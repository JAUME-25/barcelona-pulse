using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>Lo que quita (o quitaría) una purga.</summary>
/// <param name="SourceId">Fuente.</param>
/// <param name="From">Primer día (hora de Barcelona).</param>
/// <param name="To">Último día, incluido.</param>
/// <param name="Observations">Observaciones borradas (o que se borrarían).</param>
/// <param name="Ingestions">Ingestas cuyos días dejan de poderse reproducir.</param>
/// <param name="Applied">Si se ha borrado de verdad; sin aplicar, solo se ha contado.</param>
public sealed record PurgeResult(
    string SourceId, DateOnly From, DateOnly To, long Observations, int Ingestions, bool Applied);

/// <summary>
/// Quita días enteros (hora de Barcelona) de una fuente (ADR 0012): sus observaciones y la
/// posibilidad de reproducirlos. Las ejecuciones de ingesta se conservan, marcadas, como
/// registro de lo que entró; estaciones y versiones no se tocan. Volver a importar esos días
/// los recupera. Sin aplicar, solo cuenta.
/// </summary>
public sealed class ObservationPurger(PulseDbContext db, TimeProvider clock, ILogger<ObservationPurger> logger)
{
    public async Task<PurgeResult> PurgeAsync(
        string sourceId, DateOnly from, DateOnly to, bool apply, CancellationToken ct)
    {
        if (to < from)
        {
            throw new ArgumentException("El último día no puede ser anterior al primero.");
        }

        if (!await db.DataSources.AnyAsync(s => s.Id == sourceId, ct))
        {
            throw new ArgumentException($"No existe la fuente '{sourceId}'.");
        }

        var start = LocalDay.For(from).StartUtc;
        var end = LocalDay.For(to).EndUtc;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // El mismo cerrojo que la ingesta: no se borra mientras se importa la misma fuente.
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtext({sourceId}))", ct);

        // Una ingesta que cubre días dentro y fuera del periodo quedaría a medias: no se parte.
        var straddling = await db.IngestionRuns
            .Where(r => r.SourceId == sourceId && r.PurgedAt == null && r.CoveredFrom != null
                && r.CoveredFrom < end && r.CoveredTo > start && (r.CoveredFrom < start || r.CoveredTo > end))
            .Select(r => r.Id)
            .ToListAsync(ct);
        if (straddling.Count > 0)
        {
            throw new InvalidOperationException(
                $"Las ingestas {string.Join(", ", straddling)} cubren días dentro y fuera del periodo: " +
                "amplíalo para que las incluya enteras.");
        }

        var observations = db.StationObservations.Where(o =>
            db.Stations.Any(s => s.Id == o.StationId && s.SourceId == sourceId)
            && o.ObservedAt >= start && o.ObservedAt < end);
        var ingestions = db.IngestionRuns.Where(r =>
            r.SourceId == sourceId && r.PurgedAt == null && r.CoveredFrom >= start && r.CoveredTo <= end);

        if (!apply)
        {
            var count = await observations.LongCountAsync(ct);
            var runs = await ingestions.CountAsync(ct);
            await tx.RollbackAsync(ct);
            return new PurgeResult(sourceId, from, to, count, runs, Applied: false);
        }

        long deleted = await observations.ExecuteDeleteAsync(ct);
        var now = clock.GetUtcNow();
        var marked = await ingestions.ExecuteUpdateAsync(s => s.SetProperty(r => r.PurgedAt, now), ct);
        await db.DataSources.Where(s => s.Id == sourceId).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.ObservationCount, x => x.ObservationCount - deleted), ct);
        await tx.CommitAsync(ct);

        logger.LogInformation(
            "Purga de {SourceId} del {From} al {To}: {Observations} observaciones borradas, {Ingestions} ingestas marcadas",
            sourceId, from, to, deleted, marked);
        return new PurgeResult(sourceId, from, to, deleted, marked, Applied: true);
    }
}
