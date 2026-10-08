using System.Diagnostics;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.History;

/// <summary>
/// La red de una fuente en un paso de 5 minutos (ADR 0015): lo que la línea temporal devuelve en
/// un punto, sin las estaciones conocidas (esas se cuentan al pedirla, con las versiones de hoy).
/// Solo hay fila en los pasos con alguna estación con dato; los demás son ceros y nulos. Las
/// mantienen la ingesta y la purga en su transacción, con la misma regla que el mapa (ADR 0005)
/// y la precedencia de la leyenda (<c>availability.ts</c>).
/// </summary>
public sealed class TimelineSummary
{
    public required string SourceId { get; init; }
    public DateTimeOffset At { get; init; }
    public int StationsWithData { get; init; }
    public int StationsCounted { get; init; }
    public int StationsEmpty { get; init; }
    public int StationsFull { get; init; }
    public int? BikesAvailable { get; init; }
    public int? DocksAvailable { get; init; }
    public int StationsCountedEbikes { get; init; }
    public int? EbikesAvailable { get; init; }
}

internal sealed class TimelineSummaryConfiguration : IEntityTypeConfiguration<TimelineSummary>
{
    public void Configure(EntityTypeBuilder<TimelineSummary> b)
    {
        b.HasKey(x => new { x.SourceId, x.At });
        b.Property(x => x.SourceId).HasMaxLength(64);
        b.HasOne<DataSource>().WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
    }
}

/// <summary>
/// Lo que ha calculado un rebuild: el rango (de la primera observación a la última más la
/// tolerancia; nulo sin observaciones) y cuánto ha tardado.
/// </summary>
public sealed record TimelineSummaryRebuild(string SourceId, DateTimeOffset? From, DateTimeOffset? To, TimeSpan Elapsed);

/// <summary>
/// Mantiene <c>timeline_summaries</c>. El paso es el más fino que sirve la API (5 min): los
/// demás (10, 15, 30 y 60) son subconjuntos exactos de la misma rejilla, alineada en UTC.
/// Cada observación cubre los pasos desde su instante hasta el siguiente reporte de su estación,
/// sin pasar de la tolerancia: es lo que calculaba <see cref="TimelineQuery"/> al pedir cada
/// rango (ADR 0009), ahora una vez, cuando entran o salen observaciones.
/// </summary>
public static class TimelineSummaries
{
    public static readonly TimeSpan Step = TimeSpan.FromMinutes(5);

    /// <summary>Un día por consulta: sobre todo el histórico de golpe ordenaría millones de filas.</summary>
    private static readonly TimeSpan Chunk = TimeSpan.FromDays(1);

    private const string DeleteSql = """
        DELETE FROM timeline_summaries
        WHERE source_id = @source AND at >= @from AND at <= @to
        """;

    private const string InsertSql = """
        WITH obs AS (
            SELECT o.station_id, o.observed_at, o.status, o.bikes_available, o.ebikes_available,
                   o.docks_available, o.is_renting, o.is_returning,
                   lead(o.observed_at) OVER (PARTITION BY o.station_id ORDER BY o.observed_at) AS next_at
            FROM station_observations o
            JOIN stations s ON s.id = o.station_id
            WHERE s.source_id = @source
              AND o.observed_at >= @from - @tolerance
              AND o.observed_at <= @to
        ),
        covered AS (
            SELECT g.at, obs.bikes_available, obs.ebikes_available, obs.docks_available,
                   obs.status = 'in_service' AND NOT (obs.is_renting IS FALSE AND obs.is_returning IS FALSE) AS operating
            FROM obs,
            LATERAL generate_series(
                @from + ceil(extract(epoch FROM (greatest(obs.observed_at, @from) - @from)) / extract(epoch FROM @step)) * @step,
                least(obs.observed_at + @tolerance, coalesce(obs.next_at - interval '1 microsecond', 'infinity'), @to),
                @step) AS g(at)
        ),
        counted AS (
            SELECT at, operating, bikes_available, ebikes_available, docks_available,
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
                   sum(docks_available) FILTER (WHERE counted) AS docks,
                   -- Las eléctricas solo de quien publica el desglose: una fuente sin él no suma cero.
                   count(*) FILTER (WHERE counted AND ebikes_available IS NOT NULL) AS ebikes_counted,
                   sum(ebikes_available) FILTER (WHERE counted AND ebikes_available IS NOT NULL) AS ebikes
            FROM counted
            GROUP BY at
        )
        INSERT INTO timeline_summaries (
            source_id, at, stations_with_data, stations_counted, stations_empty, stations_full,
            bikes_available, docks_available, stations_counted_ebikes, ebikes_available)
        -- Con alias: «full» a secas es palabra reservada (FULL JOIN).
        SELECT @source, a.at, a.with_data, a.counted, a.empty, a.full, a.bikes, a.docks, a.ebikes_counted, a.ebikes
        FROM aggregated a
        """;

    /// <summary>
    /// Vuelve a calcular los pasos que pueden cambiar cuando entran o salen observaciones entre
    /// <paramref name="from"/> y <paramref name="to"/>: hasta <paramref name="to"/> más la
    /// tolerancia, porque una observación decide el estado durante ese tiempo. Va dentro de la
    /// transacción en curso del contexto (la de la ingesta o la purga).
    /// </summary>
    public static async Task RefreshAsync(
        PulseDbContext db, string sourceId, TimeSpan tolerance, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("El resumen de la línea temporal se actualiza dentro de la transacción de la ingesta o la purga.");
        }

        var (first, last) = Grid(from, to + tolerance);
        await ExecuteAsync(db, DeleteSql, sourceId, tolerance, first, last, ct);
        await InsertAsync(db, sourceId, tolerance, first, last, ct);
    }

    /// <summary>
    /// Lo calcula entero para una fuente, de su primera observación a la última más la tolerancia,
    /// en una transacción y con el mismo cerrojo que la ingesta. Para la primera vez (migración)
    /// y para cuando cambie la regla.
    /// </summary>
    public static async Task<TimelineSummaryRebuild> RebuildAsync(PulseDbContext db, DataSource source, CancellationToken ct)
    {
        var started = Stopwatch.GetTimestamp();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtext({source.Id}))", ct);
        await db.TimelineSummaries.Where(s => s.SourceId == source.Id).ExecuteDeleteAsync(ct);

        (DateTimeOffset From, DateTimeOffset To)? range = null;
        var earliest = await StationQueries.EarliestObservationAsync(db, source.Id, ct);
        var latest = await StationQueries.LatestObservationAsync(db, source.Id, ct);
        if (earliest is { } first && latest is { } last)
        {
            // Desde la primera observación aunque quede lejos de los días importados (el histórico
            // repite un dato de 2025): los tramos vacíos no cuestan nada.
            range = Grid(first, last + source.StalenessTolerance);
            await InsertAsync(db, source.Id, source.StalenessTolerance, range.Value.From, range.Value.To, ct);
        }

        await tx.CommitAsync(ct);
        return new TimelineSummaryRebuild(source.Id, range?.From, range?.To, Stopwatch.GetElapsedTime(started));
    }

    /// <summary>
    /// Las fuentes con observaciones y sin ningún resumen: la primera vez tras la migración. Lo
    /// hace <c>migrate</c>, para que la API arranque con la línea temporal entera.
    /// </summary>
    public static async Task<List<TimelineSummaryRebuild>> RebuildMissingAsync(PulseDbContext db, CancellationToken ct)
    {
        var results = new List<TimelineSummaryRebuild>();
        foreach (var source in await db.DataSources.AsNoTracking().OrderBy(s => s.Id).ToListAsync(ct))
        {
            if (await db.TimelineSummaries.AnyAsync(s => s.SourceId == source.Id, ct)
                || !await db.StationObservations.AnyAsync(o => db.Stations.Any(s => s.Id == o.StationId && s.SourceId == source.Id), ct))
            {
                continue;
            }

            results.Add(await RebuildAsync(db, source, ct));
        }

        return results;
    }

    /// <summary>Del primer paso de la rejilla que no pasa de <paramref name="from"/> al primero que llega a <paramref name="to"/>.</summary>
    private static (DateTimeOffset From, DateTimeOffset To) Grid(DateTimeOffset from, DateTimeOffset to)
    {
        var (first, last, _) = TimelineGrid.Align(from, to, Step);
        if (last < to) last += Step;
        return (first, last);
    }

    private static async Task InsertAsync(
        PulseDbContext db, string sourceId, TimeSpan tolerance, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        // Sin JIT: con la estimación del generate_series compilaba siempre y la compilación
        // costaba más que la consulta (ADR 0009). SET LOCAL dura hasta el final de la transacción.
        await using (var settings = new NpgsqlCommand("SET LOCAL jit = off", Connection(db), Transaction(db)))
        {
            await settings.ExecuteNonQueryAsync(ct);
        }

        for (var start = from; start <= to; start += Chunk)
        {
            var end = start + Chunk - Step;
            if (end > to) end = to;
            await ExecuteAsync(db, InsertSql, sourceId, tolerance, start, end, ct);
        }
    }

    private static async Task ExecuteAsync(
        PulseDbContext db, string sql, string sourceId, TimeSpan tolerance, DateTimeOffset from, DateTimeOffset to,
        CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(sql, Connection(db), Transaction(db));
        command.CommandTimeout = 120;
        command.Parameters.Add(new NpgsqlParameter("source", NpgsqlDbType.Varchar) { Value = sourceId });
        command.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.TimestampTz) { Value = from.ToUniversalTime() });
        command.Parameters.Add(new NpgsqlParameter("to", NpgsqlDbType.TimestampTz) { Value = to.ToUniversalTime() });
        command.Parameters.Add(new NpgsqlParameter("step", NpgsqlDbType.Interval) { Value = Step });
        command.Parameters.Add(new NpgsqlParameter("tolerance", NpgsqlDbType.Interval) { Value = tolerance });
        await command.ExecuteNonQueryAsync(ct);
    }

    private static NpgsqlConnection Connection(PulseDbContext db) => (NpgsqlConnection)db.Database.GetDbConnection();

    private static NpgsqlTransaction? Transaction(PulseDbContext db) =>
        (NpgsqlTransaction?)db.Database.CurrentTransaction?.GetDbTransaction();
}
