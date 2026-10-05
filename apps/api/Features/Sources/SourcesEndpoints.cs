using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Sources;

/// <summary>Fuente disponible, con el periodo realmente cubierto por sus observaciones.</summary>
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

            var period = await (
                    from o in db.StationObservations
                    join st in db.Stations on o.StationId equals st.Id
                    where st.SourceId == s.Id
                    group o by st.SourceId into g
                    select new ObservationPeriod(g.Min(o => o.ObservedAt), g.Max(o => o.ObservedAt), g.LongCount()))
                .FirstOrDefaultAsync(ct);

            var last = await db.IngestionRuns.AsNoTracking()
                .Where(r => r.SourceId == s.Id)
                .OrderByDescending(r => r.StartedAt)
                .Select(r => new LastIngestionSummary(r.StartedAt, r.FinishedAt, r.Status,
                    r.ObservationsAccepted, r.ObservationsDuplicate, r.ObservationsConflicting, r.ObservationsRejected))
                .FirstOrDefaultAsync(ct);

            result.Add(new SourceSummary(s.Id, s.Kind, s.Name, s.Attribution, s.License, s.Url,
                (int)s.StalenessTolerance.TotalMinutes, stationCount, period, last));
        }

        return TypedResults.Ok(result);
    }
}
