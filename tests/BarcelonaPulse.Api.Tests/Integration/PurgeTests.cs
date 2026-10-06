using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

public sealed class PurgeTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private static DateOnly Aug(int day) => new(2026, 8, day);

    /// <summary>Un día importado como en el histórico: cubre el día y trae dos observaciones a las 10:00.</summary>
    private async Task IngestDayAsync(string sourceId, int day)
    {
        var window = LocalDay.For(Aug(day));
        var at = window.StartUtc.AddHours(10);
        var batch = Batch([Station("s1"), Station("s2")], [Observation("s1", at), Observation("s2", at)], source: Source(sourceId));
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(
            batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) }, "test", TestContext.Current.CancellationToken);
    }

    private async Task<PurgeResult> PurgeAsync(string sourceId, int from, int to, bool apply)
    {
        await using var db = database.CreateContext();
        var purger = new ObservationPurger(db, new FixedClock(Now), NullLogger<ObservationPurger>.Instance);
        return await purger.PurgeAsync(sourceId, Aug(from), Aug(to), apply, TestContext.Current.CancellationToken);
    }

    private async Task<long> CountAsync(string sourceId, int day)
    {
        var window = LocalDay.For(Aug(day));
        await using var db = database.CreateContext();
        return await db.StationObservations.LongCountAsync(o =>
            db.Stations.Any(s => s.Id == o.StationId && s.SourceId == sourceId)
            && o.ObservedAt >= window.StartUtc && o.ObservedAt < window.EndUtc, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Without_yes_nothing_is_deleted_and_with_it_only_those_days_go()
    {
        database.RequireAvailable();
        foreach (var day in new[] { 19, 20, 21 }) await IngestDayAsync("purge", day);
        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        const string timeline = "/api/sources/purge/timeline?from=2026-08-20T10:00:00%2B02:00&to=2026-08-20T13:00:00%2B02:00&step=60";
        // El primer paso son las 10:00 en Barcelona, la hora de las observaciones.
        var before = (await client.GetFromJsonAsync<TimelineResponse>(timeline, Json, ct))!;
        Assert.Equal(2, before.Points[0].StationsWithData);

        var dry = await PurgeAsync("purge", 20, 20, apply: false);
        Assert.Equal((2, 1, false), (dry.Observations, dry.Ingestions, dry.Applied));
        Assert.Equal(2, await CountAsync("purge", 20));

        var applied = await PurgeAsync("purge", 20, 20, apply: true);
        Assert.Equal((2, 1, true), (applied.Observations, applied.Ingestions, applied.Applied));
        Assert.Equal(0, await CountAsync("purge", 20));
        Assert.Equal(2, await CountAsync("purge", 19));
        Assert.Equal(2, await CountAsync("purge", 21));

        // El día deja de poderse reproducir, el recuento baja y la caché de la línea temporal no sirve lo de antes.
        var source = (await client.GetFromJsonAsync<List<SourceSummary>>("/api/sources", Json, ct))!.Single(s => s.Id == "purge");
        Assert.Equal([Aug(19), Aug(21)], source.Days);
        Assert.Equal(4, source.Period!.ObservationCount);
        var after = (await client.GetFromJsonAsync<TimelineResponse>(timeline, Json, ct))!;
        Assert.Equal(0, after.Points[0].StationsWithData);

        // Volver a importarlo lo recupera.
        await IngestDayAsync("purge", 20);
        source = (await client.GetFromJsonAsync<List<SourceSummary>>("/api/sources", Json, ct))!.Single(s => s.Id == "purge");
        Assert.Equal([Aug(19), Aug(20), Aug(21)], source.Days);
        Assert.Equal(6, source.Period!.ObservationCount);
    }

    [Fact]
    public async Task An_ingestion_covering_days_inside_and_outside_is_not_split()
    {
        database.RequireAvailable();
        var from = LocalDay.For(Aug(22)).StartUtc;
        var to = LocalDay.For(Aug(24)).EndUtc;
        // Una sola ingesta que dice cubrir tres días.
        var batch = Batch([Station("s1")], [Observation("s1", from.AddDays(1).AddHours(10))], source: Source("straddle"));
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
            await ingestor.IngestAsync(batch with { Covers = new CoveredPeriod(from, to) }, "test", TestContext.Current.CancellationToken);
        }

        await Assert.ThrowsAsync<InvalidOperationException>(() => PurgeAsync("straddle", 23, 23, apply: true));
        Assert.Equal(1, await CountAsync("straddle", 23));

        // Con el periodo entero, sí.
        var applied = await PurgeAsync("straddle", 22, 24, apply: true);
        Assert.Equal((1, 1), (applied.Observations, applied.Ingestions));
    }

    [Fact]
    public async Task An_unknown_source_is_an_input_error()
    {
        database.RequireAvailable();
        await Assert.ThrowsAsync<ArgumentException>(() => PurgeAsync("no-existe", 20, 20, apply: false));
    }
}
