using System.Net;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// Sin hueco para calcular, la API responde 503 con Retry-After en vez de esperar sin tope; lo
/// que ya está en la caché se sirve igualmente. Ocupa el paso del patrón, que es global: la
/// colección evita que corra a la vez que otras pruebas que piden patrones.
/// </summary>
[Collection("station-pattern")]
public sealed class ComputationBusyTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task The_pattern_answers_503_with_retry_after_while_both_slots_are_taken_and_serves_the_cache()
    {
        database.RequireAvailable();
        const string source = "busy-pattern";
        var ct = TestContext.Current.CancellationToken;
        var window = LocalDay.For(new DateOnly(2026, 8, 19));
        long stationId;
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
            var batch = Batch([Station("s1")], [Observation("s1", window.StartUtc.AddHours(10))], source: Source(source));
            await ingestor.IngestAsync(
                batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) }, "test", ct);
            stationId = await db.Stations.Where(s => s.SourceId == source).Select(s => s.Id).SingleAsync(ct);
        }

        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var url = $"/api/stations/{stationId}/pattern";

        // Los dos huecos ocupados: la petición espera lo que marca el paso (5 s) y se rinde.
        using (await StationPattern.Gate.EnterAsync(ct))
        using (await StationPattern.Gate.EnterAsync(ct))
        {
            var busy = await client.GetAsync(url, ct);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, busy.StatusCode);
            Assert.Equal("application/problem+json", busy.Content.Headers.ContentType?.MediaType);
            Assert.NotNull(busy.Headers.RetryAfter?.Delta);
            Assert.True(busy.Headers.RetryAfter.Delta >= TimeSpan.FromSeconds(1));
        }

        // Con hueco responde y lo guarda: después, aunque no haya hueco, sale de la caché.
        var ok = await client.GetAsync(url, ct);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        using (await StationPattern.Gate.EnterAsync(ct))
        using (await StationPattern.Gate.EnterAsync(ct))
        {
            var cached = await client.GetAsync(url, ct);
            Assert.Equal(HttpStatusCode.OK, cached.StatusCode);
            Assert.Equal(await ok.Content.ReadAsStringAsync(ct), await cached.Content.ReadAsStringAsync(ct));
        }
    }
}
