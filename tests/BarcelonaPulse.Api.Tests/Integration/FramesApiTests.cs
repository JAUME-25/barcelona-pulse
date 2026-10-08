using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

namespace BarcelonaPulse.Api.Tests.Integration;

public sealed class FramesApiTests(DemoApiFixture fixture) : IClassFixture<DemoApiFixture>
{
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

    private async Task<FramesResponse> FramesAsync(string source, string query)
    {
        var response = await Client().GetAsync($"/api/sources/{source}/frames?{query}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<FramesResponse>(Json, TestContext.Current.CancellationToken))!;
    }

    private async Task IngestAsync(IngestionBatch batch)
    {
        await using var db = fixture.Database.CreateContext();
        var ingestor = new StationIngestor(db, TimeProvider.System, NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(batch, "test", TestContext.Current.CancellationToken);
    }

    /// <summary>Lo que daría GET /api/stations en ese paso, montado a partir de los fotogramas.</summary>
    private static string AsStations(FramesResponse frames, Frame frame) => JsonSerializer.Serialize(
        frame.States
            .Select(fs =>
            {
                var s = frames.Stations[fs.Station];
                var assumed = s.AssumedUntil is { } until && frame.At < until;
                return new StationItem(s.Id, s.SourceStationId, s.Name, s.Address, s.District, s.Neighbourhood,
                    s.Longitude, s.Latitude, s.Capacity, s.Altitude, assumed, fs.State, s.FirstSeenAt, s.LastSeenAt);
            })
            .OrderBy(s => s.Id),
        Json);

    [Fact]
    public async Task Every_frame_is_what_the_map_shows_at_that_instant()
    {
        // 05:30 UTC: media hora antes de los datos, para que salgan pasos sin nada, con huecos y con dato.
        var frames = await FramesAsync("demo", "from=2026-03-10T05:30:00Z");

        Assert.Equal(FramesQuery.FramesPerResponse, frames.Frames.Count);
        Assert.Equal(46, frames.Stations.Count);
        foreach (var frame in frames.Frames)
        {
            var at = Uri.EscapeDataString(frame.At.ToString("O"));
            var map = (await Client().GetFromJsonAsync<StationsResponse>(
                $"/api/stations?source=demo&at={at}", Json, TestContext.Current.CancellationToken))!;
            Assert.Equal(JsonSerializer.Serialize(map.Stations.OrderBy(s => s.Id), Json), AsStations(frames, frame));
        }
    }

    [Fact]
    public async Task The_window_is_aligned_to_the_step_grid()
    {
        var frames = await FramesAsync("demo", "from=2026-03-10T07:07:00%2B01:00&step=15");

        Assert.Equal(new DateTimeOffset(2026, 3, 10, 6, 0, 0, TimeSpan.Zero), frames.From);
        Assert.Equal(15, frames.StepMinutes);
        Assert.Equal(frames.From.AddMinutes(15 * 11), frames.Frames[^1].At);
    }

    [Fact]
    public async Task A_version_change_inside_the_window_switches_the_attributes_at_that_step()
    {
        var t0 = TestData.T0;
        await IngestAsync(TestData.Batch(
            [TestData.Station("s1", capacity: 20, seenAt: t0), TestData.Station("s1", capacity: 30, seenAt: t0.AddMinutes(20))],
            [TestData.Observation("s1", t0), TestData.Observation("s1", t0.AddMinutes(20))],
            source: TestData.Source("frames-versions")));

        var frames = await FramesAsync("frames-versions", "from=2026-03-10T06:00:00Z");

        Assert.Equal([20, 30], frames.Stations.Select(s => s.Capacity).Order());
        int CapacityAt(int minute) => frames.Stations[frames.Frames[minute / 5].States.Single().Station].Capacity!.Value;
        Assert.Equal(20, CapacityAt(15));
        Assert.Equal(30, CapacityAt(20));
    }

    [Fact]
    public async Task An_old_observation_before_the_window_makes_the_station_stale_not_absent()
    {
        var t0 = TestData.T0;
        await IngestAsync(TestData.Batch(
            [TestData.Station("old", seenAt: t0.AddDays(-3)), TestData.Station("never", seenAt: t0.AddDays(-3))],
            [TestData.Observation("old", t0.AddDays(-3))],
            source: TestData.Source("frames-stale")));

        var frames = await FramesAsync("frames-stale", "from=2026-03-10T06:00:00Z");

        foreach (var frame in frames.Frames)
        {
            var byId = frame.States.ToDictionary(fs => frames.Stations[fs.Station].SourceStationId, fs => fs.State);
            Assert.Equal(Freshness.Stale, byId["old"].Freshness);
            Assert.Equal(t0.AddDays(-3), byId["old"].LastObservedAt);
            Assert.Null(byId["old"].BikesAvailable);
            Assert.Equal(Freshness.None, byId["never"].Freshness);
        }
    }

    [Theory]
    [InlineData("", "from")]
    [InlineData("from=2026-03-10T06:00:00", "from")] // sin zona
    [InlineData("from=2026-03-10T06:00:00Z&step=7", "step")]
    public async Task Invalid_parameters_return_a_validation_problem(string query, string field)
    {
        var response = await Client().GetAsync($"/api/sources/demo/frames?{query}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task An_unknown_source_is_a_404()
    {
        var response = await Client().GetAsync(
            "/api/sources/no-existe/frames?from=2026-03-10T06:00:00Z", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
