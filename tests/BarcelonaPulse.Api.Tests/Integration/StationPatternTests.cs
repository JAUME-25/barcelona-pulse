using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// El patrón de una estación por hora: la regla del mapa en cada paso de 15 min (tolerancia de 30
/// min en las fuentes de prueba) y la precedencia de la leyenda, contado sobre los días importados.
/// </summary>
public sealed class StationPatternTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Hora de Barcelona de un día de marzo (CET, UTC+1) en UTC.</summary>
    private static DateTimeOffset March(int day, int hour, int minute = 0) =>
        new(2026, 3, day, hour - 1, minute, 0, TimeSpan.Zero);

    /// <summary>Un día local entero importado, con sus observaciones.</summary>
    private async Task IngestDayAsync(SourceDescriptor source, DateOnly day, params NormalizedObservation[] observations)
    {
        var local = LocalDay.For(day);
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        var batch = Batch([Station("p1", seenAt: local.StartUtc)], observations, source: source) with
        {
            Covers = new CoveredPeriod(local.StartUtc, local.EndUtc),
        };
        await ingestor.IngestAsync(batch, "test", Ct);
    }

    private async Task<StationPatternResponse> PatternAsync(string sourceId)
    {
        await using var db = database.CreateContext();
        var stationId = (await db.Stations.SingleAsync(s => s.SourceId == sourceId, Ct)).Id;
        await using var factory = new ApiFactory(database.ConnectionString);
        var response = await factory.CreateClient().GetAsync($"/api/stations/{stationId}/pattern", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StationPatternResponse>(Json, Ct))!;
    }

    private static PatternHour Hour(StationPatternResponse pattern, PatternDayType type, int hour) =>
        Assert.Single(pattern.Hours, h => h.DayType == type && h.Hour == hour);

    [Fact]
    public async Task Each_hour_counts_the_state_of_each_step_like_the_map()
    {
        database.RequireAvailable();
        var source = Source("pattern-rule", SourceKind.Observed);
        // Martes 10 de marzo: vacía a las 8, pocas a las 8:20, cerrada a las 9, llena a las 10.
        await IngestDayAsync(source, new DateOnly(2026, 3, 10),
            Observation("p1", March(10, 8), bikes: 0, docks: 20),
            Observation("p1", March(10, 8, 20), bikes: 2, docks: 18),
            Observation("p1", March(10, 9), bikes: 0, docks: 0, status: ObservationStatus.Closed),
            Observation("p1", March(10, 10), bikes: 20, docks: 0));
        // Sábado 14: con bicis a las 12.
        await IngestDayAsync(source, new DateOnly(2026, 3, 14), Observation("p1", March(14, 12), bikes: 9, docks: 11));

        var pattern = await PatternAsync(source.Id);

        Assert.Equal(15, pattern.StepMinutes);
        Assert.Equal(30, pattern.ToleranceMinutes);
        Assert.Equal([new DateOnly(2026, 3, 10)], pattern.Weekdays);
        Assert.Equal([new DateOnly(2026, 3, 14)], pattern.WeekendDays);
        Assert.Equal(48, pattern.Hours.Count);

        // Antes del primer dato no hay ceros: desconocido.
        Assert.Equal((4, 4), (Hour(pattern, PatternDayType.Weekday, 7).Steps, Hour(pattern, PatternDayType.Weekday, 7).Unknown));
        // 8:00 y 8:15 vacía; 8:30 y 8:45 pocas (el dato de las 8:20 vale 30 min).
        var eight = Hour(pattern, PatternDayType.Weekday, 8);
        Assert.Equal((2, 2, 0), (eight.Empty, eight.Few, eight.Unknown));
        Assert.Equal(0, eight.MedianBikes);
        // Cerrada no es vacía: fuera de servicio hasta las 9:30 (tolerancia incluida) y después, sin dato.
        var nine = Hour(pattern, PatternDayType.Weekday, 9);
        Assert.Equal((3, 0, 1), (nine.OutOfService, nine.Empty, nine.Unknown));
        Assert.Null(nine.MedianBikes);
        var ten = Hour(pattern, PatternDayType.Weekday, 10);
        Assert.Equal((3, 1), (ten.Full, ten.Unknown));
        var noon = Hour(pattern, PatternDayType.Weekend, 12);
        Assert.Equal((3, 1, 9), (noon.Available, noon.Unknown, noon.MedianBikes));
    }

    [Theory]
    [InlineData(2026, 3, 29, 92, 2, 0)] // se adelanta la hora: no hay 2:00
    [InlineData(2026, 10, 25, 100, 2, 8)] // se atrasa: la hora de las 2 se repite
    public async Task Days_of_23_and_25_hours_count_their_own_steps(
        int year, int month, int day, int steps, int hour, int stepsAtHour)
    {
        database.RequireAvailable();
        var source = Source($"pattern-dst-{month}", SourceKind.Observed);
        var date = new DateOnly(year, month, day);
        await IngestDayAsync(source, date, Observation("p1", LocalDay.For(date).StartUtc, bikes: 5, docks: 5));

        var pattern = await PatternAsync(source.Id);

        Assert.Equal(steps, pattern.Hours.Sum(h => h.Steps));
        Assert.Equal(stepsAtHour, pattern.Hours.Where(h => h.Hour == hour).Sum(h => h.Steps));
        Assert.All(pattern.Hours, h => Assert.Equal(PatternDayType.Weekend, h.DayType));
    }

    [Fact]
    public async Task An_unknown_station_is_not_found()
    {
        database.RequireAvailable();
        await using var factory = new ApiFactory(database.ConnectionString);

        var response = await factory.CreateClient().GetAsync("/api/stations/999999999/pattern", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
