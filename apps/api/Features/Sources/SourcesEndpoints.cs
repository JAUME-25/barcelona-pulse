using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Sources;

/// <summary>Fuente disponible, con el periodo realmente cubierto por sus observaciones.</summary>
/// <param name="Id">Identificador de la fuente.</param>
/// <param name="Kind">Observada o sintética.</param>
/// <param name="Name">Nombre de la fuente.</param>
/// <param name="Attribution">Atribución exigida por la licencia.</param>
/// <param name="License">Licencia de los datos, si la hay.</param>
/// <param name="Url">Página del conjunto de datos, si la hay.</param>
/// <param name="ToleranceMinutes">Antigüedad máxima de una observación para contar como dato.</param>
/// <param name="StationCount">Estaciones conocidas.</param>
/// <param name="Period">Primera y última observación. Una estación con un dato viejo lo estira: para reproducir, <c>days</c>.</param>
/// <param name="Days">Días (hora de Barcelona) que cubren sus ingestas terminadas, en orden: los que se pueden reproducir.</param>
/// <param name="LastIngestion">La ingesta más reciente.</param>
public sealed record SourceSummary(
    string Id,
    SourceKind Kind,
    string Name,
    string Attribution,
    string? License,
    string? Url,
    int ToleranceMinutes,
    int StationCount,
    ObservationPeriod? Period,
    IReadOnlyList<DateOnly> Days,
    LastIngestionSummary? LastIngestion);

public sealed record ObservationPeriod(DateTimeOffset From, DateTimeOffset To, long ObservationCount);

public sealed record LastIngestionSummary(
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    IngestionStatus Status,
    int ObservationsAccepted,
    int ObservationsDuplicate,
    int ObservationsConflicting,
    int ObservationsRejected);

public static class SourcesEndpoints
{
    public static RouteGroupBuilder MapSourcesEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sources", ListSources)
            .WithTags("Sources")
            .WithName("ListSources")
            .WithSummary("Fuentes de datos, su tipo (observada o sintética) y el periodo que cubren");
        return api;
    }

    private static async Task<Ok<List<SourceSummary>>> ListSources(PulseDbContext db, CancellationToken ct)
    {
        var sources = await db.DataSources.AsNoTracking().OrderBy(s => s.Id).ToListAsync(ct);
        var result = new List<SourceSummary>(sources.Count);

        foreach (var s in sources)
        {
            var stationCount = await db.Stations.CountAsync(x => x.SourceId == s.Id, ct);

            // Primera y última por estación (índice) y el recuento que llevan ingesta y purga: antes
            // se recorrían todas las observaciones en cada petición, y crecía con el histórico.
            var first = await StationQueries.EarliestObservationAsync(db, s.Id, ct);
            var latest = await StationQueries.LatestObservationAsync(db, s.Id, ct);
            var period = first is { } f && latest is { } l ? new ObservationPeriod(f, l, s.ObservationCount) : null;

            var last = await db.IngestionRuns.AsNoTracking()
                .Where(r => r.SourceId == s.Id)
                .OrderByDescending(r => r.StartedAt)
                .Select(r => new LastIngestionSummary(r.StartedAt, r.FinishedAt, r.Status,
                    r.ObservationsAccepted, r.ObservationsDuplicate, r.ObservationsConflicting, r.ObservationsRejected))
                .FirstOrDefaultAsync(ct);

            // Solo las ingestas terminadas y no quitadas: una fallida o purgada no deja nada que reproducir.
            var covered = await db.IngestionRuns.AsNoTracking()
                .Where(r => r.SourceId == s.Id && r.CoveredFrom != null && r.CoveredTo != null && r.PurgedAt == null
                    && (r.Status == IngestionStatus.Succeeded || r.Status == IngestionStatus.SucceededWithIssues))
                .Select(r => new { From = r.CoveredFrom!.Value, To = r.CoveredTo!.Value })
                .ToListAsync(ct);
            var days = covered.SelectMany(c => LocalDay.DatesIn(c.From, c.To)).Distinct().Order().ToList();

            result.Add(new SourceSummary(s.Id, s.Kind, s.Name, s.Attribution, s.License, s.Url,
                (int)s.StalenessTolerance.TotalMinutes, stationCount, period, days, last));
        }

        return TypedResults.Ok(result);
    }
}
