using System.Net;
using System.Net.Http.Headers;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// La versión de los datos por rango (ADR 0014): clave de las cachés y ETag de las respuestas.
/// </summary>
public sealed class DataVersionTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);

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

    private async Task<string> VersionAsync(string sourceId, int? day)
    {
        await using var db = database.CreateContext();
        var source = await db.DataSources.AsNoTracking().SingleAsync(s => s.Id == sourceId, TestContext.Current.CancellationToken);
        if (day is null)
        {
            return await DataVersion.ForAllAsync(db, source, TestContext.Current.CancellationToken);
        }

        // El rango es de instantes incluidos: el último del día, no el primero del siguiente.
        var window = LocalDay.For(Aug(day.Value));
        return await DataVersion.ForRangeAsync(
            db, source, window.StartUtc, window.EndUtc.AddTicks(-1), TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task An_ingestion_changes_only_the_version_of_the_days_it_touches_and_a_purge_all_of_them()
    {
        database.RequireAvailable();
        const string source = "version-range";
        await IngestDayAsync(source, 19);
        await IngestDayAsync(source, 21);
        await IngestDayAsync(source, 23);
        var day19 = await VersionAsync(source, 19);
        var day20 = await VersionAsync(source, 20);
        var day21 = await VersionAsync(source, 21);
        var day23 = await VersionAsync(source, 23);
        var all = await VersionAsync(source, null);
        Assert.NotEqual(day19, day21);

        // Entra el 20: cambian el 20 y «todo». El 19 y el 23 no. El 21 sí: sus primeros minutos
        // se deciden con las últimas observaciones del 20 (la tolerancia mira hacia atrás).
        await IngestDayAsync(source, 20);
        Assert.NotEqual(day20, await VersionAsync(source, 20));
        Assert.NotEqual(all, await VersionAsync(source, null));
        Assert.Equal(day19, await VersionAsync(source, 19));
        Assert.Equal(day23, await VersionAsync(source, 23));
        Assert.NotEqual(day21, await VersionAsync(source, 21));

        // El 19 otra vez (idempotente, pero es una ingesta que lo toca): cambia el 19, no el 23.
        await IngestDayAsync(source, 19);
        Assert.NotEqual(day19, await VersionAsync(source, 19));
        Assert.Equal(day23, await VersionAsync(source, 23));

        // Una purga cambia todas, también la de un día que no se ha quitado.
        await using (var db = database.CreateContext())
        {
            var purger = new ObservationPurger(db, new FixedClock(Now), NullLogger<ObservationPurger>.Instance);
            await purger.PurgeAsync(source, Aug(20), Aug(20), apply: true, TestContext.Current.CancellationToken);
        }

        Assert.NotEqual(day23, await VersionAsync(source, 23));
    }

    [Fact]
    public async Task The_previous_day_sees_an_ingestion_whose_observations_reach_into_it()
    {
        database.RequireAvailable();
        const string source = "version-spill";
        await IngestDayAsync(source, 19);
        var day19 = await VersionAsync(source, 19);

        // El archivo del 20 trae una observación de las 23:58 del 19 (pasa en el histórico).
        var window20 = LocalDay.For(Aug(20));
        var batch = Batch(
            [Station("s1")],
            [Observation("s1", window20.StartUtc.AddMinutes(-2)), Observation("s1", window20.StartUtc.AddHours(10))],
            source: Source(source));
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
            await ingestor.IngestAsync(
                batch with { Covers = new CoveredPeriod(window20.StartUtc, window20.EndUtc) }, "test", TestContext.Current.CancellationToken);
        }

        Assert.NotEqual(day19, await VersionAsync(source, 19));
    }

    [Fact]
    public async Task Responses_carry_an_etag_and_answer_304_while_the_version_holds()
    {
        database.RequireAvailable();
        const string source = "version-http";
        await IngestDayAsync(source, 19);
        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var at = Uri.EscapeDataString(LocalDay.For(Aug(19)).StartUtc.AddHours(10).ToString("O"));
        var window = LocalDay.For(Aug(19));
        var from = Uri.EscapeDataString(window.StartUtc.ToString("O"));
        var to = Uri.EscapeDataString(window.StartUtc.AddHours(2).ToString("O"));

        foreach (var url in new[]
                 {
                     $"/api/stations?source={source}&at={at}",
                     $"/api/sources/{source}/timeline?from={from}&to={to}&step=15",
                     $"/api/sources/{source}/frames?from={from}",
                 })
        {
            var first = await client.GetAsync(url, ct);
            Assert.Equal(HttpStatusCode.OK, first.StatusCode);
            var etag = first.Headers.ETag;
            Assert.NotNull(etag);
            Assert.True(etag.IsWeak);
            Assert.True(first.Headers.CacheControl is { Private: true, NoCache: true });

            using var again = new HttpRequestMessage(HttpMethod.Get, url);
            again.Headers.IfNoneMatch.Add(etag);
            var second = await client.SendAsync(again, ct);
            Assert.Equal(HttpStatusCode.NotModified, second.StatusCode);
            Assert.Equal(etag, second.Headers.ETag);
            Assert.Empty(await second.Content.ReadAsByteArrayAsync(ct));
        }

        // La estación y su patrón también; el patrón cambia con cualquier día de la fuente.
        long stationId;
        await using (var db = database.CreateContext())
        {
            stationId = await db.Stations.Where(s => s.SourceId == source && s.SourceStationId == "s1")
                .Select(s => s.Id).SingleAsync(ct);
        }

        var pattern = await client.GetAsync($"/api/stations/{stationId}/pattern", ct);
        var patternTag = pattern.Headers.ETag;
        Assert.NotNull(patternTag);
        var detail = await client.GetAsync($"/api/stations/{stationId}?at={at}", ct);
        Assert.NotNull(detail.Headers.ETag);

        // Entra otro día: el estado del 19 vale igual (304), el patrón ya no.
        await IngestDayAsync(source, 21);
        using (var stations = new HttpRequestMessage(HttpMethod.Get, $"/api/stations?source={source}&at={at}"))
        {
            stations.Headers.IfNoneMatch.Add(first19(await client.GetAsync($"/api/stations?source={source}&at={at}", ct)));
            Assert.Equal(HttpStatusCode.NotModified, (await client.SendAsync(stations, ct)).StatusCode);
        }

        using var patternAgain = new HttpRequestMessage(HttpMethod.Get, $"/api/stations/{stationId}/pattern");
        patternAgain.Headers.IfNoneMatch.Add(patternTag);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(patternAgain, ct)).StatusCode);

        static EntityTagHeaderValue first19(HttpResponseMessage response) => response.Headers.ETag!;
    }

    [Fact]
    public async Task Now_is_not_validated_but_a_synthetic_source_without_at_is()
    {
        database.RequireAvailable();
        const string source = "version-now";
        await IngestDayAsync(source, 19);
        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        // La fuente de prueba es sintética: sin `at`, el final de sus datos, que sí se valida.
        var synthetic = await client.GetAsync($"/api/stations?source={source}", ct);
        Assert.NotNull(synthetic.Headers.ETag);

        // La demo observada no existe aquí: se comprueba con una fuente observada propia.
        var window = LocalDay.For(Aug(19));
        var batch = Batch([Station("o1")], [Observation("o1", window.StartUtc.AddHours(10))],
            source: Source("version-observed", Features.Sources.SourceKind.Observed));
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
            await ingestor.IngestAsync(batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) }, "test", ct);
        }

        var now = await client.GetAsync("/api/stations?source=version-observed", ct);
        Assert.Equal(HttpStatusCode.OK, now.StatusCode);
        Assert.Null(now.Headers.ETag);
    }
}
