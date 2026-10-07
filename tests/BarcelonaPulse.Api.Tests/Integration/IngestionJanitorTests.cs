using BarcelonaPulse.Api.Features.Ingestion;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>Las ingestas que se quedaron «en marcha» por un proceso que murió se cierran como fallidas.</summary>
public sealed class IngestionJanitorTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Runs_left_running_for_over_an_hour_are_closed_as_failed_and_recent_ones_are_not()
    {
        database.RequireAvailable();
        var ct = TestContext.Current.CancellationToken;
        const string source = "janitor";
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(
            Batch([Station("s1")], [Observation("s1", Now.AddHours(-3))], source: Source(source)), "test", ct);

        IngestionRun Running(string inputRef, DateTimeOffset startedAt) => new()
        {
            SourceId = source,
            Adapter = "test",
            AdapterVersion = "1",
            InputRef = inputRef,
            Trigger = "test",
            StartedAt = startedAt,
            Status = IngestionStatus.Running,
        };
        db.IngestionRuns.AddRange(Running("vieja", Now.AddHours(-2)), Running("reciente", Now.AddMinutes(-10)));
        await db.SaveChangesAsync(ct);

        Assert.Equal(1, await IngestionJanitor.CloseInterruptedAsync(db, Now, ct));
        db.ChangeTracker.Clear();
        var runs = await db.IngestionRuns.Where(r => r.SourceId == source).ToListAsync(ct);
        var old = runs.Single(r => r.InputRef == "vieja");
        Assert.Equal(IngestionStatus.Failed, old.Status);
        Assert.Equal(Now, old.FinishedAt);
        Assert.Equal(IngestionJanitor.InterruptedError, old.Error);
        Assert.Equal(IngestionStatus.Running, runs.Single(r => r.InputRef == "reciente").Status);
        Assert.Equal(IngestionStatus.Succeeded, runs.Single(r => r.InputRef != "vieja" && r.InputRef != "reciente").Status);

        // Otra pasada no toca nada más.
        Assert.Equal(0, await IngestionJanitor.CloseInterruptedAsync(db, Now, ct));
    }
}
