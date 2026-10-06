using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace BarcelonaPulse.Api.Tests.Integration;

public sealed class TimelineApiTests(DemoApiFixture fixture) : IClassFixture<DemoApiFixture>
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

    private async Task<TimelineResponse> TimelineAsync(string query)
    {
        var response = await Client().GetAsync($"/api/sources/demo/timeline?{query}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TimelineResponse>(Json, TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task Every_step_matches_the_map_at_that_instant()
    {
        var timeline = await TimelineAsync("from=2026-03-10T05:30:00Z&to=2026-03-10T09:30:00Z&step=15");
        Assert.Equal(17, timeline.Points.Count);

        foreach (var point in timeline.Points)
        {
            var at = Uri.EscapeDataString(point.At.ToString("O"));
            var map = (await Client().GetFromJsonAsync<StationsResponse>(
                $"/api/stations?source=demo&at={at}", Json, TestContext.Current.CancellationToken))!;
            // Misma precedencia que la leyenda de la web (availability.ts).
            var current = map.Stations.Where(s => s.State.Freshness == Freshness.Current).ToList();
            var operating = current
                .Where(s => s.State.Status == ObservationStatus.InService
                    && !(s.State.IsRenting == false && s.State.IsReturning == false))
                .ToList();
            var counted = operating.Where(s => s.State is { BikesAvailable: not null, DocksAvailable: not null }).ToList();

            Assert.Equal(map.Count, point.StationsKnown);
            Assert.Equal(current.Count, point.StationsWithData);
            Assert.Equal(counted.Count, point.StationsCounted);
            Assert.Equal(operating.Count(s => s.State.BikesAvailable == 0), point.StationsEmpty);
            Assert.Equal(operating.Count(s => s.State is { BikesAvailable: > 0, DocksAvailable: 0 }), point.StationsFull);
            Assert.Equal(counted.Count == 0 ? null : counted.Sum(s => s.State.BikesAvailable), point.BikesAvailable);
            Assert.Equal(counted.Count == 0 ? null : counted.Sum(s => s.State.DocksAvailable), point.DocksAvailable);
        }
    }

    [Fact]
    public async Task Gaps_show_up_as_steps_with_fewer_stations_with_data()
    {
        var timeline = await TimelineAsync("from=2026-03-10T05:30:00Z&to=2026-03-10T09:30:00Z&step=15");
        int WithData(int hour, int minute) => timeline.Points
            .Single(p => p.At == new DateTimeOffset(2026, 3, 10, hour, minute, 0, TimeSpan.Zero)).StationsWithData;

        Assert.Equal(0, WithData(5, 30)); // antes de los datos
        Assert.Equal(45, WithData(6, 0)); // todas menos la que nunca informa
        Assert.Equal(44, WithData(7, 30)); // la que dejó de informar a las 06:45 ya está fuera
        Assert.Equal(43, WithData(8, 0)); // y la del hueco de 07:30 a 08:30
        Assert.Equal(44, WithData(8, 30)); // que vuelve a informar
        Assert.Null(timeline.Points[0].BikesAvailable);
    }

    [Fact]
    public async Task Closed_stuck_and_blind_stations_are_neither_empty_nor_added_as_zero()
    {
        fixture.Database.RequireAvailable();
        var ct = TestContext.Current.CancellationToken;
        await using (var db = fixture.Database.CreateContext())
        {
            var ingestor = new StationIngestor(db, TimeProvider.System, NullLogger<StationIngestor>.Instance);
            await ingestor.IngestAsync(TestData.Batch(
                [TestData.Station("closed"), TestData.Station("blind"), TestData.Station("stuck"), TestData.Station("full")],
                [
                    TestData.Observation("closed", TestData.T0, bikes: 0, docks: 0, status: ObservationStatus.Closed),
                    TestData.Observation("blind", TestData.T0, bikes: null),
                    // En servicio, pero no presta ni admite devoluciones: no opera.
                    TestData.Observation("stuck", TestData.T0, bikes: 0) with { IsRenting = false, IsReturning = false },
                    TestData.Observation("blind", TestData.T0.AddMinutes(15), bikes: 3, docks: 7),
                    TestData.Observation("full", TestData.T0.AddMinutes(15), bikes: 20, docks: 0),
                ],
                source: TestData.Source("timeline-closed")), "test", ct);
        }

        var timeline = await Client().GetFromJsonAsync<TimelineResponse>(
            "/api/sources/timeline-closed/timeline?from=2026-03-10T06:00:00Z&to=2026-03-10T06:15:00Z&step=15", Json, ct);

        Assert.Collection(timeline!.Points,
            p =>
            {
                // Hay dato de las tres, pero ninguna está vacía ni se puede sumar: no es «0 bicis».
                Assert.Equal(3, p.StationsWithData);
                Assert.Equal(0, p.StationsCounted);
                Assert.Equal(0, p.StationsEmpty);
                Assert.Equal(0, p.StationsFull);
                Assert.Null(p.BikesAvailable);
                Assert.Null(p.DocksAvailable);
            },
            p =>
            {
                Assert.Equal(4, p.StationsWithData);
                Assert.Equal(2, p.StationsCounted);
                Assert.Equal(0, p.StationsEmpty);
                Assert.Equal(1, p.StationsFull);
                Assert.Equal(23, p.BikesAvailable);
                Assert.Equal(7, p.DocksAvailable);
            });
    }

    [Fact]
    public async Task Without_a_range_it_covers_the_last_24_hours_with_data()
    {
        var timeline = await TimelineAsync("step=60");
        Assert.Equal(new DateTimeOffset(2026, 3, 10, 9, 0, 0, TimeSpan.Zero), timeline.To);
        Assert.Equal(timeline.To.AddHours(-24), timeline.From);
        Assert.Equal(25, timeline.Points.Count);
        Assert.Equal(30, timeline.ToleranceMinutes);
    }

    [Theory]
    [InlineData("from=2026-03-10T06:00:00Z", "from")] // falta to
    [InlineData("from=2026-03-10T09:00:00Z&to=2026-03-10T06:00:00Z", "from")] // al revés
    [InlineData("from=2026-03-01T00:00:00Z&to=2026-03-10T00:00:00Z", "to")] // más de 7 días
    [InlineData("from=2026-03-10T06:00:00&to=2026-03-10T09:00:00Z", "from")] // sin zona
    [InlineData("step=7", "step")]
    public async Task Invalid_parameters_return_a_validation_problem(string query, string field)
    {
        var response = await Client().GetAsync($"/api/sources/demo/timeline?{query}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task An_unknown_source_is_a_404()
    {
        var response = await Client().GetAsync("/api/sources/no-existe/timeline", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_warm_up_leaves_the_gaps_grid_as_the_web_asks_for_it()
    {
        var client = Client();
        var services = fixture.Factory!.Services;
        var warmUp = services.GetRequiredService<TimelineWarmUp>();
        var cache = (MemoryCache)services.GetRequiredService<IMemoryCache>();
        var ct = TestContext.Current.CancellationToken;

        await warmUp.RunOnceAsync(ct);
        Assert.Equal(0, await warmUp.RunOnceAsync(ct)); // lo que ya está en la caché no se repite

        // La rejilla de la web para el demo (martes 10-3-2026): del lunes 9 a las 00:00 al domingo 15
        // a las 23:45, hora de Barcelona, cada 15 minutos. Sale de la caché sin calcular nada nuevo.
        var entries = cache.Count;
        var response = await client.GetAsync(
            "/api/sources/demo/timeline?from=2026-03-08T23:00:00.000Z&to=2026-03-15T22:45:00.000Z&step=15", ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(entries, cache.Count);
    }
}
