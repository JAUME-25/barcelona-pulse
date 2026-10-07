using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

public sealed class IngestionsApiTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private static DateOnly Aug(int day) => new(2026, 8, day);

    private async Task<IngestionRun> IngestAsync(IngestionBatch batch)
    {
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        return await ingestor.IngestAsync(batch, "test", TestContext.Current.CancellationToken);
    }

    /// <summary>Un día del histórico: cubre el día y trae lo que se le pase a las 10:00.</summary>
    private Task<IngestionRun> IngestDayAsync(string sourceId, int day, IEnumerable<NormalizedObservation> observations,
        IEnumerable<RejectedRecord>? rejected = null)
    {
        var window = LocalDay.For(Aug(day));
        var batch = Batch([Station("s1"), Station("s2")], observations, rejected, source: Source(sourceId));
        return IngestAsync(batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) });
    }

    [Fact]
    public async Task Lists_finished_ingestions_with_their_days_counts_purge_and_rejections_by_reason()
    {
        database.RequireAvailable();
        var ten = LocalDay.For(Aug(20)).StartUtc.AddHours(10);
        // El día 20: dos observaciones buenas, una negativa, una de una estación desconocida y una
        // fecha ambigua que el adaptador ya rechazó.
        await IngestDayAsync("ingestions", 20,
            [Observation("s1", ten), Observation("s2", ten), Observation("s1", ten.AddMinutes(5), bikes: -1), Observation("ghost", ten)],
            [new RejectedRecord(RecordKinds.Observation, "x@?", RejectionReasons.AmbiguousTimestamp)]);
        // El día 19 (importado después, pero anterior): limpio.
        var nineteen = LocalDay.For(Aug(19)).StartUtc.AddHours(10);
        await IngestDayAsync("ingestions", 19, [Observation("s1", nineteen)]);
        // El día 20 otra vez: nada nuevo, todo repetido.
        await IngestDayAsync("ingestions", 20, [Observation("s1", ten), Observation("s2", ten)]);
        // Una ingesta sin periodo cubierto no es un día del histórico: no sale.
        await IngestAsync(Batch([Station("s1")], [Observation("s1", ten.AddHours(1))], source: Source("ingestions")));
        // El día 19 se purga: se conserva, con la fecha de la purga.
        await using (var db = database.CreateContext())
        {
            var purger = new ObservationPurger(db, new FixedClock(Now.AddHours(1)), NullLogger<ObservationPurger>.Instance);
            await purger.PurgeAsync("ingestions", Aug(19), Aug(19), apply: true, TestContext.Current.CancellationToken);
        }

        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var response = (await client.GetFromJsonAsync<IngestionsResponse>("/api/sources/ingestions/ingestions", Json, ct))!;

        Assert.Equal("ingestions", response.Source.Id);
        // En orden de periodo cubierto, no de ejecución; la repetición del 20, después de la primera.
        Assert.Equal([Aug(19), Aug(20), Aug(20)], response.Ingestions.Select(i => i.Days.Single()));

        var purged = response.Ingestions[0];
        Assert.Equal(IngestionStatus.Succeeded, purged.Status);
        Assert.Equal(Now.AddHours(1), purged.PurgedAt);
        Assert.Equal((1, 0, 0, 0), (purged.ObservationsAccepted, purged.ObservationsDuplicate, purged.ObservationsConflicting, purged.ObservationsRejected));
        Assert.Empty(purged.Rejections);

        var first = response.Ingestions[1];
        Assert.Equal(IngestionStatus.SucceededWithIssues, first.Status);
        Assert.Null(first.PurgedAt);
        Assert.Equal(LocalDay.For(Aug(20)).StartUtc, first.CoveredFrom);
        Assert.Equal(LocalDay.For(Aug(20)).EndUtc, first.CoveredTo);
        Assert.Equal((5, 2, 0, 3), (first.ObservationsReceived, first.ObservationsAccepted, first.ObservationsDuplicate, first.ObservationsRejected));
        Assert.Equal(
            [
                new RejectionGroup(RecordKinds.Observation, RejectionReasons.AmbiguousTimestamp, 1),
                new RejectionGroup(RecordKinds.Observation, RejectionReasons.NegativeCount, 1),
                new RejectionGroup(RecordKinds.Observation, RejectionReasons.UnknownStation, 1),
            ],
            first.Rejections);

        var repeat = response.Ingestions[2];
        Assert.Equal(IngestionStatus.Succeeded, repeat.Status);
        Assert.Equal((0, 2, 0), (repeat.ObservationsAccepted, repeat.ObservationsDuplicate, repeat.ObservationsRejected));
        // Con el reloj fijo de las pruebas las dos empiezan a la vez: el orden lo decide la ejecución.
        Assert.True(repeat.Id > first.Id);
        Assert.NotNull(repeat.FinishedAt);
    }

    [Fact]
    public async Task An_unknown_source_is_404_and_a_source_without_ingestions_an_empty_list()
    {
        database.RequireAvailable();
        await IngestAsync(Batch([Station("s1")], source: Source("sin-dias")));
        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var missing = await client.GetAsync("/api/sources/no-existe/ingestions", ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var empty = (await client.GetFromJsonAsync<IngestionsResponse>("/api/sources/sin-dias/ingestions", Json, ct))!;
        Assert.Empty(empty.Ingestions);
    }
}
