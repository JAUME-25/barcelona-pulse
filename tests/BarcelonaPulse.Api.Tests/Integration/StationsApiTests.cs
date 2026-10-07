using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>Base temporal con el demo importado y la API en memoria apuntando a ella.</summary>
public sealed class DemoApiFixture : IAsyncLifetime
{
    public PostgisDatabase Database { get; } = new();
    internal ApiFactory? Factory { get; private set; }

    public async ValueTask InitializeAsync()
    {
        await Database.InitializeAsync();
        if (!Database.Available)
        {
            return;
        }

        await using var db = Database.CreateContext();
        var ingestor = new StationIngestor(db, TimeProvider.System, NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(DemoFixtureAdapter.LoadEmbedded(), "test", CancellationToken.None);
        Factory = new ApiFactory(Database.ConnectionString);
    }

    public async ValueTask DisposeAsync()
    {
        if (Factory is not null)
        {
            await Factory.DisposeAsync();
        }

        await Database.DisposeAsync();
    }
}

public sealed class StationsApiTests(DemoApiFixture fixture) : IClassFixture<DemoApiFixture>
{
    private static readonly DateTimeOffset DemoEnd = new(2026, 3, 10, 9, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private HttpClient Client()
    {
        fixture.Database.RequireAvailable();
        return fixture.Factory!.CreateClient();
    }

    private async Task<StationsResponse> GetStationsAsync(string query)
    {
        var response = await Client().GetAsync($"/api/stations?{query}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StationsResponse>(Json, TestContext.Current.CancellationToken))!;
    }

    private static StationItem ById(StationsResponse r, string sourceStationId) =>
        r.Stations.Single(s => s.SourceStationId == sourceStationId);

    [Fact]
    public async Task Sources_lists_the_demo_as_synthetic_with_its_real_period()
    {
        var sources = await Client().GetFromJsonAsync<List<SourceSummary>>(
            "/api/sources", Json, TestContext.Current.CancellationToken);

        var demo = Assert.Single(sources!);
        Assert.Equal("demo", demo.Id);
        Assert.Equal(SourceKind.Synthetic, demo.Kind);
        Assert.Equal(46, demo.StationCount);
        Assert.Equal(new DateTimeOffset(2026, 3, 10, 6, 0, 0, TimeSpan.Zero), demo.Period!.From);
        Assert.Equal(DemoEnd, demo.Period.To);
        Assert.Equal(572, demo.Period.ObservationCount);
        Assert.Equal([new DateOnly(2026, 3, 10)], demo.Days);
        Assert.Equal(IngestionStatus.Succeeded, demo.LastIngestion!.Status);
    }

    [Fact]
    public async Task Without_at_a_synthetic_source_is_shown_at_the_end_of_its_data_not_now()
    {
        var r = await GetStationsAsync("source=demo");

        Assert.Equal(DemoEnd, r.At);
        Assert.Equal(InstantBasis.LatestObservation, r.AtBasis);
        Assert.Equal(SourceKind.Synthetic, r.Source.Kind);
        Assert.Equal(46, r.Count);
        Assert.False(r.Truncated);
        Assert.Equal(30, r.ToleranceMinutes);
    }

    [Fact]
    public async Task Missing_data_is_unknown_and_closed_is_not_empty()
    {
        var r = await GetStationsAsync("source=demo");

        var neverReports = ById(r, "demo-037").State;
        Assert.Equal(Freshness.None, neverReports.Freshness);
        Assert.Equal(ObservationStatus.Unknown, neverReports.Status);
        Assert.Null(neverReports.BikesAvailable);
        Assert.Null(neverReports.DocksAvailable);

        var stoppedReporting = ById(r, "demo-024").State;
        Assert.Equal(Freshness.Stale, stoppedReporting.Freshness);
        Assert.Equal(ObservationStatus.Unknown, stoppedReporting.Status);
        Assert.Equal(new DateTimeOffset(2026, 3, 10, 6, 45, 0, TimeSpan.Zero), stoppedReporting.LastObservedAt);
        Assert.Null(stoppedReporting.BikesAvailable);

        var closed = ById(r, "demo-013").State;
        Assert.Equal(Freshness.Current, closed.Freshness);
        Assert.Equal(ObservationStatus.Closed, closed.Status);

        Assert.Contains(QualityFlags.CountsExceedCapacity, ById(r, "demo-031").State.QualityFlags);

        var noSplit = ById(r, "demo-042").State;
        Assert.NotNull(noSplit.BikesAvailable);
        Assert.Null(noSplit.MechanicalBikesAvailable);
        Assert.Null(noSplit.EbikesAvailable);
    }

    [Theory]
    [InlineData("2026-03-10T07:15:00Z", Freshness.Current)] // última 06:45Z + 30 min: límite incluido
    [InlineData("2026-03-10T07:15:01Z", Freshness.Stale)]
    [InlineData("2026-03-10T06:44:59Z", Freshness.Current)] // usa la de 06:30Z, nunca una posterior
    public async Task Tolerance_boundary_is_inclusive(string at, Freshness expected)
    {
        var r = await GetStationsAsync($"source=demo&at={Uri.EscapeDataString(at)}");
        Assert.Equal(expected, ById(r, "demo-024").State.Freshness);
        Assert.Equal(InstantBasis.Requested, r.AtBasis);
    }

    [Fact]
    public async Task An_explicit_offset_is_the_same_instant_as_its_utc_equivalent()
    {
        var local = await GetStationsAsync($"source=demo&at={Uri.EscapeDataString("2026-03-10T08:30:00+01:00")}");
        var utc = await GetStationsAsync("source=demo&at=2026-03-10T07:30:00Z");

        Assert.Equal(utc.At, local.At);
        Assert.Equal(
            utc.Stations.Select(s => (s.Id, s.State.BikesAvailable)),
            local.Stations.Select(s => (s.Id, s.State.BikesAvailable)));
    }

    [Fact]
    public async Task Before_any_observation_every_station_is_unknown_and_metadata_is_marked_as_assumed()
    {
        var r = await GetStationsAsync("source=demo&at=2026-03-10T05:00:00Z");

        Assert.All(r.Stations, s =>
        {
            Assert.Equal(Freshness.None, s.State.Freshness);
            Assert.True(s.MetadataAssumed);
        });
    }

    [Fact]
    public async Task Bbox_returns_exactly_the_stations_inside_it()
    {
        var (minLon, minLat, maxLon, maxLat) = (2.15, 41.38, 2.18, 41.40);
        var expected = DemoFixtureAdapter.LoadEmbedded().Stations
            .Where(s => s.Longitude >= minLon && s.Longitude <= maxLon && s.Latitude >= minLat && s.Latitude <= maxLat)
            .Select(s => s.SourceStationId)
            .Order(StringComparer.Ordinal)
            .ToList();

        var r = await GetStationsAsync("source=demo&bbox=2.15,41.38,2.18,41.40");

        Assert.NotEmpty(expected);
        Assert.Equal(expected, r.Stations.Select(s => s.SourceStationId).Order(StringComparer.Ordinal).ToList());
    }

    [Theory]
    [InlineData("bbox=2.15,41.38,2.18,41.40", "source")]
    [InlineData("source=demo&bbox=2.2,41.4,2.1,41.3", "bbox")]
    [InlineData("source=demo&bbox=0,0,5,5", "bbox")]
    [InlineData("source=demo&bbox=a,b,c,d", "bbox")]
    [InlineData("source=demo&at=2026-03-10T09:00:00", "at")] // hora local sin zona
    [InlineData("source=demo&at=ayer", "at")]
    [InlineData("source=demo&at=1999-12-31T23:00:00Z", "at")]
    public async Task Invalid_parameters_return_a_validation_problem(string query, string field)
    {
        var response = await Client().GetAsync($"/api/stations?{query}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Theory]
    [InlineData("/api/stations?source=no-existe")]
    [InlineData("/api/stations/999999")]
    public async Task Unknown_resources_return_a_404_problem(string url)
    {
        var response = await Client().GetAsync(url, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Station_detail_matches_the_list_and_includes_versions()
    {
        var list = await GetStationsAsync("source=demo");
        var fromList = ById(list, "demo-008");

        var detail = await Client().GetFromJsonAsync<StationDetailResponse>(
            $"/api/stations/{fromList.Id}", Json, TestContext.Current.CancellationToken);

        Assert.Equal(fromList, detail!.Station with { State = detail.Station.State with { QualityFlags = fromList.State.QualityFlags } });
        Assert.Equal(fromList.State.BikesAvailable, detail.Station.State.BikesAvailable);
        Assert.Equal(ObservationStatus.Maintenance, detail.Station.State.Status);
        var version = Assert.Single(detail.Versions);
        Assert.Null(version.ValidFrom);
        Assert.Null(version.ValidTo);
    }

    [Fact]
    public async Task Health_and_openapi_respond()
    {
        var client = Client();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready", TestContext.Current.CancellationToken)).StatusCode);
        var openapi = await client.GetStringAsync("/api/openapi/v1.json", TestContext.Current.CancellationToken);
        Assert.Contains("\"/api/stations\"", openapi, StringComparison.Ordinal);
    }
}
