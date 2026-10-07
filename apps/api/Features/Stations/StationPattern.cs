using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.Stations;

/// <summary>Laborable (de lunes a viernes; los festivos cuentan como laborables) o fin de semana.</summary>
public enum PatternDayType
{
    Weekday,
    Weekend,
}

/// <summary>
/// Una hora del día (hora de Barcelona) en un tipo de día: en cuántos pasos de los días
/// importados estuvo la estación en cada estado. Sin dato no es cero: va en <c>Unknown</c>.
/// </summary>
public sealed record PatternHour(
    PatternDayType DayType,
    int Hour,
    int Steps,
    int Unknown,
    int OutOfService,
    int Empty,
    int Few,
    int Available,
    int Full,
    int? MedianBikes);

/// <summary>
/// Cómo estuvo una estación a cada hora en los días importados de su fuente. Es lo que pasó, no
/// una previsión: cada paso sigue la regla del mapa (ADR 0005) y la precedencia de la leyenda.
/// </summary>
public sealed record StationPatternResponse(
    SourceRef Source,
    long StationId,
    string SourceStationId,
    int StepMinutes,
    int ToleranceMinutes,
    int FewBikesMax,
    IReadOnlyList<DateOnly> Weekdays,
    IReadOnlyList<DateOnly> WeekendDays,
    IReadOnlyList<PatternHour> Hours);

/// <summary>
/// El patrón de una estación: su estado cada 15 minutos de cada día importado, contado por hora
/// y tipo de día. Medido el 7-10-2026 con 42 días reales: 28 ms (4 032 pasos, cada uno con una
/// búsqueda en el índice por estación e instante); en producción, 0,2 s la primera vez por el
/// disco. Crece con los días importados, así que se guarda en la caché con la versión de la
/// fuente en la clave (la misma del ETag) y como mucho dos se calculan a la vez.
/// </summary>
public static class StationPattern
{
    public static readonly TimeSpan Step = TimeSpan.FromMinutes(15);

    /// <summary>Patrones calculándose a la vez y cuánto espera una petición un hueco antes del 503.</summary>
    internal static readonly ComputationGate Gate = new(2, TimeSpan.FromSeconds(5));

    /// <summary>
    /// El patrón, de la caché si ya está; si no, calculado y guardado hasta la siguiente ingesta o
    /// purga de la fuente (la versión va en la clave). Prioridad baja: si la caché se llena, se van
    /// antes que las semanas de la rejilla de huecos, que cuestan segundos.
    /// </summary>
    /// <exception cref="ComputationBusyException">Sin hueco para calcular a tiempo.</exception>
    public static async Task<StationPatternResponse> GetAsync(
        PulseDbContext db, IMemoryCache cache, Station station, string version, CancellationToken ct)
    {
        var key = $"pattern:{station.Id}:{version}";
        if (cache.TryGetValue(key, out StationPatternResponse? cached) && cached is not null)
        {
            return cached;
        }

        using var lease = await Gate.EnterAsync(ct);
        if (cache.TryGetValue(key, out cached) && cached is not null)
        {
            return cached;
        }

        var pattern = await ComputeAsync(db, station, ct);
        cache.Set(key, pattern, new MemoryCacheEntryOptions { Size = 1, Priority = CacheItemPriority.Low });
        return pattern;
    }

    /// <summary>
    /// «Pocas bicis»: hasta 3, como en la leyenda (apps/web/src/features/stations/availability.ts,
    /// FEW_BIKES_MAX). Si cambia allí, cambia aquí.
    /// </summary>
    public const int FewBikesMax = 3;

    // Mismo estado que el mapa: la última observación anterior o igual al paso, si no pasa de la
    // tolerancia; si no, desconocido. Misma precedencia que availabilityOf (availability.ts):
    // desconocido, fuera de servicio (cerrada no es vacía), vacía, llena, pocas y con bicis.
    private const string Sql = """
        WITH days AS (
            SELECT * FROM unnest(@starts, @ends, @weekend) AS d(day_start, day_end, weekend)
        ),
        steps AS (
            SELECT d.weekend, g.at
            FROM days d,
            LATERAL generate_series(d.day_start, d.day_end - @step, @step) AS g(at)
        ),
        state AS (
            SELECT st.weekend, st.at, o.observed_at IS NOT NULL AS observed, o.status,
                   o.bikes_available, o.docks_available, o.is_renting, o.is_returning
            FROM steps st
            LEFT JOIN LATERAL (
                SELECT * FROM station_observations o
                WHERE o.station_id = @station AND o.observed_at <= st.at
                ORDER BY o.observed_at DESC
                LIMIT 1
            ) o ON st.at - o.observed_at <= @tolerance
        ),
        category AS (
            SELECT weekend,
                   extract(hour FROM at AT TIME ZONE @zone)::int AS hour,
                   CASE
                       WHEN NOT observed OR status = 'unknown' THEN 'unknown'
                       WHEN status <> 'in_service' OR (is_renting IS FALSE AND is_returning IS FALSE) THEN 'out_of_service'
                       WHEN bikes_available IS NULL THEN 'unknown'
                       WHEN bikes_available = 0 THEN 'empty'
                       WHEN docks_available = 0 THEN 'full'
                       WHEN bikes_available <= @few THEN 'few'
                       ELSE 'available'
                   END AS category,
                   bikes_available
            FROM state
        )
        SELECT weekend, hour, count(*),
               count(*) FILTER (WHERE category = 'unknown'),
               count(*) FILTER (WHERE category = 'out_of_service'),
               count(*) FILTER (WHERE category = 'empty'),
               count(*) FILTER (WHERE category = 'few'),
               count(*) FILTER (WHERE category = 'available'),
               count(*) FILTER (WHERE category = 'full'),
               percentile_disc(0.5) WITHIN GROUP (ORDER BY bikes_available)
                   FILTER (WHERE category IN ('empty', 'few', 'available', 'full'))
        FROM category
        GROUP BY weekend, hour
        ORDER BY weekend, hour
        """;

    public static async Task<StationPatternResponse> ComputeAsync(PulseDbContext db, Station station, CancellationToken ct)
    {
        var source = station.Source;
        var days = await SourceDays.GetAsync(db, source.Id, ct);
        var localDays = days.Select(LocalDay.For).ToList();
        var weekend = days.Select(IsWeekend).ToArray();

        var hours = new List<PatternHour>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var tx = await connection.BeginTransactionAsync(ct);
            // Sin JIT: con la estimación de los pasos compilaba siempre y tardaba 0,9 s en vez
            // de 28 ms. Y con un tope, por si un día hubiera muchísimos días importados.
            await using (var settings = new NpgsqlCommand(
                "SET LOCAL statement_timeout = 10000; SET LOCAL jit = off", connection, tx))
            {
                await settings.ExecuteNonQueryAsync(ct);
            }

            await using var command = new NpgsqlCommand(Sql, connection, tx);
            command.Parameters.Add(new("station", NpgsqlDbType.Bigint) { Value = station.Id });
            command.Parameters.Add(new("starts", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz)
            {
                Value = localDays.Select(d => d.StartUtc.ToUniversalTime()).ToArray(),
            });
            command.Parameters.Add(new("ends", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz)
            {
                Value = localDays.Select(d => d.EndUtc.ToUniversalTime()).ToArray(),
            });
            command.Parameters.Add(new("weekend", NpgsqlDbType.Array | NpgsqlDbType.Boolean) { Value = weekend });
            command.Parameters.Add(new("step", NpgsqlDbType.Interval) { Value = Step });
            command.Parameters.Add(new("tolerance", NpgsqlDbType.Interval) { Value = source.StalenessTolerance });
            command.Parameters.Add(new("few", NpgsqlDbType.Integer) { Value = FewBikesMax });
            command.Parameters.Add(new("zone", NpgsqlDbType.Text) { Value = LocalDay.TimeZoneId });

            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                hours.Add(new PatternHour(
                    reader.GetBoolean(0) ? PatternDayType.Weekend : PatternDayType.Weekday,
                    reader.GetInt32(1),
                    (int)reader.GetInt64(2),
                    (int)reader.GetInt64(3),
                    (int)reader.GetInt64(4),
                    (int)reader.GetInt64(5),
                    (int)reader.GetInt64(6),
                    (int)reader.GetInt64(7),
                    (int)reader.GetInt64(8),
                    reader.IsDBNull(9) ? null : reader.GetInt32(9)));
            }
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }

        return new StationPatternResponse(
            source.ToRef(),
            station.Id,
            station.SourceStationId,
            (int)Step.TotalMinutes,
            (int)source.StalenessTolerance.TotalMinutes,
            FewBikesMax,
            [.. days.Where(d => !IsWeekend(d))],
            [.. days.Where(IsWeekend)],
            hours);
    }

    private static bool IsWeekend(DateOnly day) => day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
}
