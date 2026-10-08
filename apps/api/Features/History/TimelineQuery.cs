using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
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
/// <param name="StationsCountedEbikes">De las contadas, las que publican cuántas eléctricas tienen: las que suman en EbikesAvailable.</param>
/// <param name="EbikesAvailable">Bicis eléctricas en esas estaciones; nula si ninguna lo publica. Si no son todas las contadas, no es el total de la red.</param>
public sealed record TimelinePoint(
    DateTimeOffset At,
    int StationsKnown,
    int StationsWithData,
    int StationsCounted,
    int StationsEmpty,
    int StationsFull,
    int? BikesAvailable,
    int? DocksAvailable,
    int StationsCountedEbikes,
    int? EbikesAvailable);

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

    /// <summary>
    /// Siete días de Barcelona: la semana del cambio de hora de octubre tiene un día de 25 h y
    /// dura 169 h (la web y el precalentamiento la piden entera).
    /// </summary>
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(7) + TimeSpan.FromHours(1);

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
/// Línea temporal de una fuente, leída del resumen por paso de 5 minutos que mantienen la ingesta
/// y la purga (<see cref="TimelineSummaries"/>, ADR 0015). Hasta el 8-10-2026 se calculaba al
/// pedirla sobre las observaciones (ADR 0009): una semana tardaba de 2,8 a 3,0 s en producción.
/// Las estaciones conocidas en cada paso se cuentan aquí con las versiones de hoy, como antes.
/// </summary>
public static class TimelineQuery
{
    // Un punto por paso de la rejilla pedida, haya o no fila en el resumen (sin fila: ceros y
    // nulos). Los pasos de 10, 15, 30 y 60 minutos caen en la rejilla de 5, alineada en UTC.
    private const string Sql = """
        WITH steps AS (
            SELECT generate_series(@from, @to, @step) AS at
        )
        SELECT st.at, coalesce(t.stations_with_data, 0), coalesce(t.stations_counted, 0),
               coalesce(t.stations_empty, 0), coalesce(t.stations_full, 0), t.bikes_available, t.docks_available,
               coalesce(t.stations_counted_ebikes, 0), t.ebikes_available
        FROM steps st
        LEFT JOIN timeline_summaries t ON t.source_id = @source AND t.at = st.at
        ORDER BY st.at
        """;

    /// <summary>
    /// Un punto por paso entre <paramref name="from"/> y <paramref name="to"/>, leídos del resumen.
    /// Sin caché ni tope de cálculos: hasta el 8-10-2026 cada rango costaba segundos y se guardaba
    /// en memoria tras pasar por un <c>ComputationGate</c>; ahora son milisegundos.
    /// </summary>
    public static async Task<IReadOnlyList<TimelinePoint>> GetAsync(
        PulseDbContext db, DataSource source, DateTimeOffset from, DateTimeOffset to, TimeSpan step, CancellationToken ct)
    {
        var known = await KnownCounter.ForSourceAsync(db, source.Id, ct);
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = new NpgsqlCommand(Sql, connection);
            command.CommandTimeout = StationQueries.QueryTimeoutSeconds;
            command.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.TimestampTz) { Value = from.ToUniversalTime() });
            command.Parameters.Add(new NpgsqlParameter("to", NpgsqlDbType.TimestampTz) { Value = to.ToUniversalTime() });
            command.Parameters.Add(new NpgsqlParameter("step", NpgsqlDbType.Interval) { Value = step });
            command.Parameters.Add(new NpgsqlParameter("source", NpgsqlDbType.Varchar) { Value = source.Id });

            var points = new List<TimelinePoint>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var at = reader.GetFieldValue<DateTimeOffset>(0);
                points.Add(new TimelinePoint(
                    at,
                    known.At(at),
                    reader.GetInt32(1),
                    reader.GetInt32(2),
                    reader.GetInt32(3),
                    reader.GetInt32(4),
                    reader.IsDBNull(5) ? null : reader.GetInt32(5),
                    reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    reader.GetInt32(7),
                    reader.IsDBNull(8) ? null : reader.GetInt32(8)));
            }

            return points;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    /// <summary>
    /// Estaciones con atributos vigentes en un instante: las versiones que ya han empezado
    /// (o se asumen desde siempre) menos las que ya han acabado. Dos listas ordenadas y una
    /// búsqueda binaria por paso, en vez de cruzar en SQL cada paso con todas las versiones.
    /// </summary>
    private sealed class KnownCounter(int alwaysKnown, long[] startsTicks, long[] endsTicks)
    {
        public static async Task<KnownCounter> ForSourceAsync(PulseDbContext db, string sourceId, CancellationToken ct)
        {
            var versions = await db.StationVersions.AsNoTracking()
                .Where(v => v.Station.SourceId == sourceId)
                .Select(v => new { v.ValidFrom, v.ValidTo })
                .ToListAsync(ct);
            var starts = versions.Where(v => v.ValidFrom is not null).Select(v => v.ValidFrom!.Value.UtcTicks).Order().ToArray();
            var ends = versions.Where(v => v.ValidTo is not null).Select(v => v.ValidTo!.Value.UtcTicks).Order().ToArray();
            return new KnownCounter(versions.Count(v => v.ValidFrom is null), starts, ends);
        }

        /// <summary>Versiones con <c>valid_from ≤ at</c> (o nulo) y <c>valid_to &gt; at</c> (o nulo).</summary>
        public int At(DateTimeOffset at)
        {
            var ticks = at.UtcTicks;
            return alwaysKnown + CountUpTo(startsTicks, ticks) - CountUpTo(endsTicks, ticks);
        }

        /// <summary>Cuántos valores ordenados son ≤ <paramref name="ticks"/>.</summary>
        private static int CountUpTo(long[] sorted, long ticks)
        {
            var index = Array.BinarySearch(sorted, ticks);
            if (index >= 0)
            {
                while (index + 1 < sorted.Length && sorted[index + 1] == ticks) index++;
                return index + 1;
            }

            return ~index;
        }
    }
}
