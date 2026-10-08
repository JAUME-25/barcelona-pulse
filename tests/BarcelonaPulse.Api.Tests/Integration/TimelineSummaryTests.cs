using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// El resumen de la línea temporal por paso de 5 minutos (ADR 0015): lo mantienen la ingesta y
/// la purga, y calcularlo entero da lo mismo que haberlo ido actualizando. Que cada paso coincide
/// con el mapa lo comprueba <c>TimelineApiTests</c>; que una purga lo vacía, <c>PurgeTests</c>.
/// </summary>
public sealed class TimelineSummaryTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 9, 12, 0, 0, TimeSpan.Zero);

    private static DateOnly Aug(int day) => new(2026, 8, day);

    private async Task IngestAsync(string sourceId, int day, params (string Station, int Minute)[] observations)
    {
        var window = LocalDay.For(Aug(day));
        var batch = Batch(
            observations.Select(o => o.Station).Distinct().Select(s => Station(s)),
            observations.Select(o => Observation(o.Station, window.StartUtc.AddHours(10).AddMinutes(o.Minute))),
            source: Source(sourceId));
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(
            batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) }, "test", TestContext.Current.CancellationToken);
    }

    private async Task<List<(DateTimeOffset At, int WithData, int Counted, int? Bikes)>> RowsAsync(string sourceId)
    {
        await using var db = database.CreateContext();
        return await db.TimelineSummaries.AsNoTracking()
            .Where(s => s.SourceId == sourceId)
            .OrderBy(s => s.At)
            .Select(s => new ValueTuple<DateTimeOffset, int, int, int?>(s.At, s.StationsWithData, s.StationsCounted, s.BikesAvailable))
            .ToListAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_second_import_of_the_same_day_updates_the_steps_it_touches()
    {
        database.RequireAvailable();
        const string source = "summary-upsert";
        // s1 informa a las 10:00 (hora de Barcelona); después entra s2 a las 10:02. Con 30 min de
        // tolerancia, s1 cubre hasta las 10:30 y s2 de las 10:05 a las 10:30.
        await IngestAsync(source, 20, ("s1", 0));
        await IngestAsync(source, 20, ("s2", 2));

        var window = LocalDay.For(Aug(20));
        var from = window.StartUtc.AddHours(10);
        await using var db = database.CreateContext();
        var dataSource = await db.DataSources.AsNoTracking().SingleAsync(s => s.Id == source, TestContext.Current.CancellationToken);
        var points = await TimelineQuery.GetAsync(
            db, dataSource, from, from.AddMinutes(35), TimeSpan.FromMinutes(5), TestContext.Current.CancellationToken);

        Assert.Equal([1, 2, 2, 2, 2, 2, 2, 0], points.Select(p => p.StationsWithData));
        Assert.Equal([5, 10, 10, 10, 10, 10, 10, null], points.Select(p => p.BikesAvailable));
        Assert.All(points, p => Assert.Equal(2, p.StationsKnown));
        // Solo hay filas en los pasos con alguna estación con dato.
        Assert.Equal(7, (await RowsAsync(source)).Count);
    }

    [Fact]
    public async Task Rebuilding_from_scratch_gives_the_same_rows_as_the_incremental_updates()
    {
        database.RequireAvailable();
        const string source = "summary-rebuild";
        // Tres días, fuera de orden, y uno de ellos dos veces con otra estación.
        await IngestAsync(source, 21, ("s1", 0), ("s2", 7));
        await IngestAsync(source, 19, ("s1", 0));
        await IngestAsync(source, 20, ("s1", 0), ("s2", 0), ("s3", 3));
        await IngestAsync(source, 19, ("s2", 12));
        var incremental = await RowsAsync(source);
        Assert.NotEmpty(incremental);

        await using var db = database.CreateContext();
        var dataSource = await db.DataSources.AsNoTracking().SingleAsync(s => s.Id == source, TestContext.Current.CancellationToken);
        var rebuilt = await TimelineSummaries.RebuildAsync(db, dataSource, TestContext.Current.CancellationToken);
        Assert.Equal(source, rebuilt.SourceId);
        // De la primera observación (el 19 a las 10:00) a la última (el 21 a las 10:07) más los 30
        // min de tolerancia, en la rejilla de 5 min.
        Assert.Equal(LocalDay.For(Aug(19)).StartUtc.AddHours(10), rebuilt.From);
        Assert.Equal(LocalDay.For(Aug(21)).StartUtc.AddHours(10).AddMinutes(40), rebuilt.To);
        Assert.Equal(incremental, await RowsAsync(source));

        // Con resumen, no hay nada que calcular; sin él (la primera vez), se calcula entero.
        Assert.DoesNotContain(await TimelineSummaries.RebuildMissingAsync(db, TestContext.Current.CancellationToken), r => r.SourceId == source);
        await db.TimelineSummaries.Where(s => s.SourceId == source).ExecuteDeleteAsync(TestContext.Current.CancellationToken);
        var missing = await TimelineSummaries.RebuildMissingAsync(db, TestContext.Current.CancellationToken);
        Assert.Contains(missing, r => r.SourceId == source && r.From == rebuilt.From && r.To == rebuilt.To);
        Assert.Equal(incremental, await RowsAsync(source));
    }
}
