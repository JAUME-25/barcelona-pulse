using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.History;

/// <summary>
/// Un instante de la línea temporal: cuántas estaciones tienen dato, cuántas están vacías o
/// llenas y qué suman. Operativa: en servicio y prestando o admitiendo devoluciones; es la misma
/// precedencia que la leyenda de la web (<c>availability.ts</c>).
/// </summary>
/// <param name="At">Instante (UTC) del paso.</param>
/// <param name="StationsKnown">Estaciones con atributos vigentes en ese instante.</param>
/// <param name="StationsWithData">Estaciones con observación dentro de la tolerancia (misma regla que el mapa).</param>
/// <param name="StationsCounted">De ellas, las operativas con los dos recuentos: las que se suman.</param>
/// <param name="StationsEmpty">Operativas sin bicis.</param>
/// <param name="StationsFull">Operativas con bicis y sin anclajes libres.</param>
/// <param name="BikesAvailable">Bicis disponibles en las estaciones contadas; nula si no se cuenta ninguna.</param>
/// <param name="DocksAvailable">Anclajes libres en las estaciones contadas; nula si no se cuenta ninguna.</param>
public sealed record TimelinePoint(
    DateTimeOffset At,
    int StationsKnown,
    int StationsWithData,
    int StationsCounted,
    int StationsEmpty,
    int StationsFull,
    int? BikesAvailable,
    int? DocksAvailable);

/// <summary>Línea temporal de una fuente.</summary>
/// <param name="Source">Fuente consultada, con su tipo.</param>
/// <param name="From">Primer paso, alineado a la rejilla (UTC).</param>
/// <param name="To">Último paso, alineado a la rejilla (UTC).</param>
/// <param name="StepMinutes">Minutos entre pasos.</param>
/// <param name="ToleranceMinutes">Antigüedad máxima de una observación para contar como dato.</param>
/// <param name="Points">Un punto por paso, de From a To.</param>
public sealed record TimelineResponse(
    SourceRef Source,
    DateTimeOffset From,
    DateTimeOffset To,
    int StepMinutes,
    int ToleranceMinutes,
    IReadOnlyList<TimelinePoint> Points);

/// <summary>Rejilla de pasos alineada a múltiplos del paso desde el epoch Unix (en UTC).</summary>
public static class TimelineGrid
{
    public static readonly int[] AllowedStepMinutes = [5, 10, 15, 30, 60];
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(7);

    public static (DateTimeOffset From, DateTimeOffset To, int Points) Align(
        DateTimeOffset from, DateTimeOffset to, TimeSpan step)
    {
        var alignedFrom = Floor(from, step);
        var alignedTo = Floor(to, step);
        var points = (int)((alignedTo - alignedFrom).Ticks / step.Ticks) + 1;
        return (alignedFrom, alignedTo, points);
    }

    private static DateTimeOffset Floor(DateTimeOffset value, TimeSpan step)
    {
        var utc = value.ToUniversalTime();
        return new DateTimeOffset(utc.Ticks - (utc.Ticks % step.Ticks), TimeSpan.Zero);
    }
}

/// <summary>
/// Línea temporal de una fuente, calculada al pedirla con la misma regla del estado en un
/// instante (ADR 0005). Medido el 5-10-2026 con datos reales: 2 h en 33 ms, un día a 5 min en
/// ~0,4 s y una semana a 15 min en ~1,7 s; por eso se limita a 7 días y se guarda en memoria
/// hasta la siguiente ingesta de la fuente. Si hicieran falta periodos largos, se precalcularía
/// por ingesta.
/// </summary>
public static class TimelineQuery
{
    // Cada observación cubre los pasos desde su instante hasta el siguiente reporte de la
    // estación, sin pasar de la tolerancia (límite incluido). Se generan solo esos pasos.
    private const string Sql = """
        WITH steps AS (
            SELECT generate_series(@from, @to, @step) AS at
        ),
        obs AS (
            SELECT o.station_id, o.observed_at, o.status, o.bikes_available, o.docks_available,
                   o.is_renting, o.is_returning,
                   lead(o.observed_at) OVER (PARTITION BY o.station_id ORDER BY o.observed_at) AS next_at
            FROM station_observations o
            JOIN stations s ON s.id = o.station_id
            WHERE s.source_id = @source
              AND o.observed_at >= @from - @tolerance
              AND o.observed_at <= @to
        ),
        covered AS (
            SELECT g.at, obs.bikes_available, obs.docks_available,
                   obs.status = 'in_service' AND NOT (obs.is_renting IS FALSE AND obs.is_returning IS FALSE) AS operating
            FROM obs,
            LATERAL generate_series(
                @from + ceil(extract(epoch FROM (greatest(obs.observed_at, @from) - @from)) / extract(epoch FROM @step)) * @step,
                least(obs.observed_at + @tolerance, coalesce(obs.next_at - interval '1 microsecond', 'infinity'), @to),
                @step) AS g(at)
        ),
        counted AS (
            SELECT at, operating, bikes_available, docks_available,
                   operating AND bikes_available IS NOT NULL AND docks_available IS NOT NULL AS counted
            FROM covered
        ),
        aggregated AS (
            SELECT at,
                   count(*) AS with_data,
                   count(*) FILTER (WHERE counted) AS counted,
                   count(*) FILTER (WHERE operating AND bikes_available = 0) AS empty,
                   count(*) FILTER (WHERE operating AND bikes_available > 0 AND docks_available = 0) AS full,
                   sum(bikes_available) FILTER (WHERE counted) AS bikes,
                   sum(docks_available) FILTER (WHERE counted) AS docks
            FROM counted
            GROUP BY at
        ),
        known AS (
            SELECT st.at, count(v.id) AS stations_known
            FROM steps st
            JOIN station_versions v
              ON (v.valid_from IS NULL OR v.valid_from <= st.at) AND (v.valid_to IS NULL OR v.valid_to > st.at)
            JOIN stations s ON s.id = v.station_id AND s.source_id = @source
            GROUP BY st.at
        )
        SELECT st.at, coalesce(k.stations_known, 0), coalesce(a.with_data, 0), coalesce(a.counted, 0),
               coalesce(a.empty, 0), coalesce(a.full, 0), a.bikes, a.docks
        FROM steps st
        LEFT JOIN known k ON k.at = st.at
        LEFT JOIN aggregated a ON a.at = st.at
        ORDER BY st.at
        """;

    /// <summary>
    /// Clave de la caché. Se invalida sola: incluye la última ingesta terminada de la fuente y la
    /// última purga (ADR 0012), que borra datos sin crear una ingesta.
    /// </summary>
    public static async Task<string> KeyAsync(
        PulseDbContext db, DataSource source, DateTimeOffset from, DateTimeOffset to, TimeSpan step, CancellationToken ct)
    {
        var lastRun = await db.IngestionRuns
            .Where(r => r.SourceId == source.Id && r.FinishedAt != null)
            .MaxAsync(r => (long?)r.Id, ct) ?? 0;
        var lastPurge = await db.IngestionRuns
            .Where(r => r.SourceId == source.Id)
            .MaxAsync(r => r.PurgedAt, ct);
        return $"timeline:{source.Id}:{from:O}:{to:O}:{step.TotalMinutes}:{lastRun}:{lastPurge?.UtcTicks}";
    }

    public static async Task<IReadOnlyList<TimelinePoint>> GetAsync(
        PulseDbContext db, IMemoryCache cache, DataSource source, DateTimeOffset from, DateTimeOffset to,
        TimeSpan step, CancellationToken ct)
    {
        var key = await KeyAsync(db, source, from, to, step, ct);
        if (cache.TryGetValue(key, out IReadOnlyList<TimelinePoint>? cached) && cached is not null)
        {
            return cached;
        }

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = new NpgsqlCommand(Sql, connection);
            command.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.TimestampTz) { Value = from.ToUniversalTime() });
            command.Parameters.Add(new NpgsqlParameter("to", NpgsqlDbType.TimestampTz) { Value = to.ToUniversalTime() });
            command.Parameters.Add(new NpgsqlParameter("step", NpgsqlDbType.Interval) { Value = step });
            command.Parameters.Add(new NpgsqlParameter("tolerance", NpgsqlDbType.Interval) { Value = source.StalenessTolerance });
            command.Parameters.Add(new NpgsqlParameter("source", NpgsqlDbType.Varchar) { Value = source.Id });

            var points = new List<TimelinePoint>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                points.Add(new TimelinePoint(
                    reader.GetFieldValue<DateTimeOffset>(0),
                    (int)reader.GetInt64(1),
                    (int)reader.GetInt64(2),
                    (int)reader.GetInt64(3),
                    (int)reader.GetInt64(4),
                    (int)reader.GetInt64(5),
                    reader.IsDBNull(6) ? null : (int)reader.GetInt64(6),
                    reader.IsDBNull(7) ? null : (int)reader.GetInt64(7)));
            }

            // Sin caducidad por tiempo: la clave cambia con cada ingesta o purga y el límite de la
            // caché (200 entradas, Program.cs) acota la memoria. Así sigue ahí lo que deja calculado
            // TimelineWarmUp, aunque nadie lo pida en horas.
            cache.Set(key, (IReadOnlyList<TimelinePoint>)points, new MemoryCacheEntryOptions { Size = 1 });
            return points;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }
}
