using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

public sealed class IngestionTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private async Task<IngestionRun> IngestAsync(IngestionBatch batch)
    {
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        return await ingestor.IngestAsync(batch, "test", TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Repeating_the_demo_import_creates_no_duplicates()
    {
        database.RequireAvailable();
        var batch = DemoFixtureAdapter.LoadEmbedded() with
        {
            Source = DemoFixtureAdapter.LoadEmbedded().Source with { Id = "demo-repeat" },
        };

        var first = await IngestAsync(batch);
        var second = await IngestAsync(batch);

        Assert.Equal(IngestionStatus.Succeeded, first.Status);
        Assert.Equal(46, first.StationVersionsCreated);
        Assert.Equal(572, first.ObservationsAccepted);

        Assert.Equal(IngestionStatus.Succeeded, second.Status);
        Assert.Equal(0, second.StationVersionsCreated);
        Assert.Equal(0, second.ObservationsAccepted);
        Assert.Equal(572, second.ObservationsDuplicate);

        await using var db = database.CreateContext();
        // El recuento de la fuente lo lleva la ingesta: solo suma las nuevas.
        Assert.Equal(572, (await db.DataSources.SingleAsync(s => s.Id == "demo-repeat")).ObservationCount);
        Assert.Equal(46, await db.Stations.CountAsync(s => s.SourceId == "demo-repeat"));
        Assert.Equal(46, await db.StationVersions.CountAsync(v => v.Station.SourceId == "demo-repeat"));
        Assert.Equal(572, await db.StationObservations.CountAsync(o =>
            db.Stations.Any(s => s.Id == o.StationId && s.SourceId == "demo-repeat")));
    }

    [Fact]
    public async Task Station_ids_are_kept_as_published_text()
    {
        database.RequireAvailable();
        var source = Source("ids");
        await IngestAsync(Batch([Station("0042"), Station("A-7"), Station("42")], source: source));

        await using var db = database.CreateContext();
        var ids = await db.Stations.Where(s => s.SourceId == "ids").Select(s => s.SourceStationId).OrderBy(x => x).ToListAsync();
        Assert.Equal(["0042", "42", "A-7"], ids);
    }

    [Fact]
    public async Task A_capacity_change_closes_the_current_version_and_opens_another()
    {
        database.RequireAvailable();
        var source = Source("versions");
        var later = T0.AddDays(7);

        await IngestAsync(Batch([Station("s1", capacity: 20)], source: source));
        var run = await IngestAsync(Batch([Station("s1", capacity: 24, seenAt: later)], source: source));

        Assert.Equal(1, run.StationVersionsCreated);
        await using var db = database.CreateContext();
        var versions = await db.StationVersions.Where(v => v.Station.SourceId == "versions")
            .OrderBy(v => v.FirstSeenAt).ToListAsync();
        Assert.Collection(versions,
            v =>
            {
                Assert.Equal(20, v.Capacity);
                Assert.Null(v.ValidFrom);
                Assert.Equal(later, v.ValidTo);
            },
            v =>
            {
                Assert.Equal(24, v.Capacity);
                Assert.Equal(later, v.ValidFrom);
                Assert.Null(v.ValidTo);
            });
    }

    [Fact]
    public async Task Reimporting_a_period_with_several_versions_rejects_nothing()
    {
        database.RequireAvailable();
        var source = Source("reimport");
        var batch = Batch(
            [Station("s1", capacity: 20), Station("s1", capacity: 24, seenAt: T0.AddHours(1))],
            source: source);

        var first = await IngestAsync(batch);
        var second = await IngestAsync(batch);

        Assert.Equal(2, first.StationVersionsCreated);
        Assert.Equal(0, second.StationVersionsCreated);
        Assert.Equal(0, second.StationsRejected);
    }

    [Fact]
    public async Task Importing_an_older_period_afterwards_fills_in_the_history()
    {
        database.RequireAvailable();
        var source = Source("older");
        var later = T0.AddDays(3);
        await IngestAsync(Batch([Station("s1", capacity: 20, seenAt: later)], source: source));
        var run = await IngestAsync(Batch([Station("s1", capacity: 30, seenAt: T0)], source: source));

        Assert.Equal(1, run.StationVersionsCreated);
        Assert.Equal(0, run.StationsRejected);
        await using var db = database.CreateContext();
        var station = await db.Stations.Include(s => s.Versions).SingleAsync(s => s.SourceId == "older");
        Assert.Equal(T0, station.FirstSeenAt);
        var versions = station.Versions.OrderBy(v => v.FirstSeenAt).ToList();
        Assert.Collection(versions,
            v =>
            {
                // Lo más antiguo que se sabe ahora: vigente hacia atrás hasta que se vio la otra.
                Assert.Equal(30, v.Capacity);
                Assert.Null(v.ValidFrom);
                Assert.Equal(later, v.ValidTo);
            },
            v =>
            {
                // Ya no se supone vigente desde siempre: empieza cuando se publicó.
                Assert.Equal(20, v.Capacity);
                Assert.Equal(later, v.ValidFrom);
                Assert.Null(v.ValidTo);
            });
    }

    [Fact]
    public async Task A_change_inside_a_known_period_splits_that_version()
    {
        database.RequireAvailable();
        var source = Source("split");
        var day1 = T0;
        var day2 = T0.AddDays(1);
        var day3 = T0.AddDays(2);
        // Primero se conocen el día 1 (capacidad 20) y el día 3 (capacidad 30)…
        await IngestAsync(Batch([Station("s1", capacity: 20, seenAt: day1), Station("s1", capacity: 30, seenAt: day3)], source: source));
        // …y después llega el día 2, con un valor intermedio.
        var run = await IngestAsync(Batch([Station("s1", capacity: 25, seenAt: day2)], source: source));

        Assert.Equal(1, run.StationVersionsCreated);
        await using var db = database.CreateContext();
        var versions = await db.StationVersions.Where(v => v.Station.SourceId == "split")
            .OrderBy(v => v.FirstSeenAt).Select(v => new { v.Capacity, v.ValidFrom, v.ValidTo }).ToListAsync();
        Assert.Equal([20, 25, 30], versions.Select(v => v.Capacity));
        Assert.Equal(day2, versions[0].ValidTo);
        Assert.Equal(day2, versions[1].ValidFrom);
        Assert.Equal(day3, versions[1].ValidTo);
        Assert.Equal(day3, versions[2].ValidFrom);
        Assert.Null(versions[2].ValidTo);

        // Repetirlo no cambia nada.
        var again = await IngestAsync(Batch([Station("s1", capacity: 25, seenAt: day2)], source: source));
        Assert.Equal(0, again.StationVersionsCreated);
        Assert.Equal(0, again.StationsRejected);
    }

    [Fact]
    public async Task A_partially_invalid_batch_keeps_valid_rows_and_records_each_reason()
    {
        database.RequireAvailable();
        var source = Source("partial");
        var batch = Batch(
            stations:
            [
                Station("ok"),
                Station("ok", capacity: 99), // otra versión publicada en el mismo instante
                Station("far", lon: -3.70, lat: 40.42), // Madrid: fuera del área de servicio
                Station("swapped", lon: 41.39, lat: 2.17), // lat/lon intercambiadas: también fuera del área
                Station("invalid", lon: 2.17, lat: 141.39), // no es una coordenada WGS84
            ],
            observations:
            [
                Observation("ok", T0),
                Observation("ok", T0), // misma clave en el lote: duplicada, no rechazada
                Observation("ok", T0.AddMinutes(15), bikes: -1),
                Observation("ok", Now.AddHours(1)), // futuro
                Observation("ghost", T0),
            ],
            rejected: [new RejectedRecord(RecordKinds.Observation, "x@?", RejectionReasons.AmbiguousTimestamp)],
            source: source);

        var run = await IngestAsync(batch);

        Assert.Equal(IngestionStatus.SucceededWithIssues, run.Status);
        Assert.Equal(5, run.StationsReceived);
        Assert.Equal(4, run.StationsRejected);
        Assert.Equal(6, run.ObservationsReceived);
        Assert.Equal(1, run.ObservationsAccepted);
        Assert.Equal(1, run.ObservationsDuplicate);
        Assert.Equal(4, run.ObservationsRejected);

        await using var db = database.CreateContext();
        var reasons = await db.IngestionRejections.Where(r => r.IngestionRunId == run.Id)
            .Select(r => r.Reason).OrderBy(r => r).ToListAsync();
        Assert.Equal(
            new[]
            {
                RejectionReasons.AmbiguousTimestamp,
                RejectionReasons.CoordinatesOutOfRange,
                RejectionReasons.DuplicateInBatch,
                RejectionReasons.NegativeCount,
                RejectionReasons.OutsideServiceArea,
                RejectionReasons.OutsideServiceArea,
                RejectionReasons.TimestampInFuture,
                RejectionReasons.UnknownStation,
            }.Order(StringComparer.Ordinal),
            reasons.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Quality_flags_mark_counts_without_correcting_them()
    {
        database.RequireAvailable();
        var source = Source("flags");
        await IngestAsync(Batch(
            [Station("s1", capacity: 20)],
            [
                Observation("s1", T0, bikes: 15, docks: 10), // 25 > 20
                Observation("s1", T0.AddMinutes(15), bikes: 5, docks: 10, mechanical: 3, ebike: 1), // 3 + 1 != 5
                Observation("s1", T0.AddMinutes(30), bikes: 5, docks: 5, docksDisabled: 10), // = 20: sin marca
            ],
            source: source));

        await using var db = database.CreateContext();
        var flags = await db.StationObservations
            .Where(o => db.Stations.Any(s => s.Id == o.StationId && s.SourceId == "flags"))
            .OrderBy(o => o.ObservedAt).Select(o => new { o.BikesAvailable, o.QualityFlags }).ToListAsync();
        Assert.Equal([QualityFlags.CountsExceedCapacity], flags[0].QualityFlags);
        Assert.Equal(15, flags[0].BikesAvailable);
        Assert.Equal([QualityFlags.BikeTypesMismatch], flags[1].QualityFlags);
        Assert.Empty(flags[2].QualityFlags);
    }

    [Fact]
    public async Task A_source_cannot_switch_between_synthetic_and_observed()
    {
        database.RequireAvailable();
        await IngestAsync(Batch([Station("s1")], source: Source("kind", SourceKind.Synthetic)));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            IngestAsync(Batch([Station("s1")], source: Source("kind", SourceKind.Observed))));

        await using var db = database.CreateContext();
        Assert.Equal(SourceKind.Synthetic, (await db.DataSources.SingleAsync(s => s.Id == "kind")).Kind);
    }

    [Fact]
    public async Task The_days_to_replay_come_from_finished_ingestions_not_from_old_observations()
    {
        database.RequireAvailable();
        var source = Source("days");
        CoveredPeriod Day(int d) => new(
            LocalDay.For(new DateOnly(2026, 8, d)).StartUtc, LocalDay.For(new DateOnly(2026, 8, d)).EndUtc);
        // Una estación publica un dato de 2025: no por eso 2025 es un día que reproducir.
        var oldObservation = Observation("s1", new DateTimeOffset(2025, 6, 12, 8, 54, 16, TimeSpan.Zero));
        await IngestAsync(Batch([Station("s1")], [oldObservation], source: source) with { Covers = Day(21) });
        await IngestAsync(Batch([Station("s1")], source: source) with { Covers = Day(19) });
        // Una ingesta fallida no deja días.
        await Record.ExceptionAsync(() => IngestAsync(
            Batch([Station("s2", name: new string('x', 300))], source: source) with { Covers = Day(20) }));

        await using var factory = new ApiFactory(database.ConnectionString);
        var sources = await factory.CreateClient().GetFromJsonAsync<List<SourceSummary>>(
            "/api/sources", JsonOptions, TestContext.Current.CancellationToken);

        var days = sources!.Single(s => s.Id == "days").Days;
        Assert.Equal([new DateOnly(2026, 8, 19), new DateOnly(2026, 8, 21)], days);
    }

    [Fact]
    public async Task A_failed_ingestion_is_recorded_as_failed_and_leaves_no_partial_data()
    {
        database.RequireAvailable();
        var source = Source("fails");
        // Un valor que pasa la validación pero viola una restricción de la base de datos.
        var tooLongName = new string('x', 300);
        var ex = await Record.ExceptionAsync(() => IngestAsync(Batch(
            [Station("s1"), Station("s2", name: tooLongName)],
            [Observation("s1", T0)],
            source: source)));
        Assert.NotNull(ex);

        await using var db = database.CreateContext();
        var run = await db.IngestionRuns.SingleAsync(r => r.SourceId == "fails");
        Assert.Equal(IngestionStatus.Failed, run.Status);
        Assert.NotNull(run.FinishedAt);
        Assert.False(string.IsNullOrEmpty(run.Error));
        Assert.Equal(0, await db.Stations.CountAsync(s => s.SourceId == "fails"));
    }
}
