using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Sources;

/// <summary>
/// Días (hora de Barcelona) que cubren las ingestas terminadas de una fuente: los que se pueden
/// reproducir (ADR 0011). Los usan <c>GET /api/sources</c> y el cálculo previo de la rejilla de
/// huecos.
/// </summary>
public static class SourceDays
{
    public static async Task<List<DateOnly>> GetAsync(PulseDbContext db, string sourceId, CancellationToken ct)
    {
        // Solo las ingestas terminadas y no quitadas: una fallida o purgada no deja nada que reproducir.
        var covered = await db.IngestionRuns.AsNoTracking()
            .Where(r => r.SourceId == sourceId && r.CoveredFrom != null && r.CoveredTo != null && r.PurgedAt == null
                && (r.Status == IngestionStatus.Succeeded || r.Status == IngestionStatus.SucceededWithIssues))
            .Select(r => new { From = r.CoveredFrom!.Value, To = r.CoveredTo!.Value })
            .ToListAsync(ct);
        return covered.SelectMany(c => LocalDay.DatesIn(c.From, c.To)).Distinct().Order().ToList();
    }
}
