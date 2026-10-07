using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using BarcelonaPulse.Api.Tests.Unit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// Un día del histórico (fixtures pequeños con el formato real) de punta a punta:
/// adaptador, ingesta, base de datos y API.
/// </summary>
internal static class BicingIngestion
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    public static async Task<IngestionRun> IngestFixturesAsync(PostgisDatabase database)
    {
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        return await ingestor.IngestAsync(BicingFixtures.Read(), "test", TestContext.Current.CancellationToken);
    }
}

/// <summary>Base propia: cuenta lo que hace la primera importación.</summary>
public sealed class BicingArchiveIdempotencyTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private Task<IngestionRun> IngestFixturesAsync() => BicingIngestion.IngestFixturesAsync(database);

    [Fact]
    public async Task One_day_enters_once_with_every_row_accounted_for()
    {
        database.RequireAvailable();

        var first = await IngestFixturesAsync();
        var second = await IngestFixturesAsync();

        // 12 filas del día: 6 nuevas, 2 repetidas idénticas, 1 conflicto y 3 rechazadas.
        Assert.Equal(12, first.ObservationsReceived);
        Assert.Equal(6, first.ObservationsAccepted);
        Assert.Equal(2, first.ObservationsDuplicate);
        Assert.Equal(1, first.ObservationsConflicting);
        Assert.Equal(3, first.ObservationsRejected);
        Assert.Equal(5, first.StationVersionsCreated);
        Assert.Equal(1, first.StationsRejected);
        Assert.Equal(IngestionStatus.SucceededWithIssues, first.Status);
        // Cubre el día pedido, no el rango de las observaciones.
        var day = LocalDay.For(BicingFixtures.Day);
        Assert.Equal(day.StartUtc, first.CoveredFrom);
        Assert.Equal(day.EndUtc, first.CoveredTo);

        // Repetir no crea nada: todo es duplicado salvo el mismo conflicto y los mismos rechazos.
        Assert.Equal(0, second.ObservationsAccepted);
        Assert.Equal(8, second.ObservationsDuplicate);
        Assert.Equal(1, second.ObservationsConflicting);
        Assert.Equal(3, second.ObservationsRejected);
        Assert.Equal(0, second.StationVersionsCreated);
        // Solo la fila sin coordenadas: el cambio de capacidad de la mañana ya es una versión conocida.
        Assert.Equal(1, second.StationsRejected);

        await using var db = database.CreateContext();
        var source = await db.DataSources.SingleAsync(s => s.Id == "bicing-bcn");
        Assert.Equal(SourceKind.Observed, source.Kind);
        Assert.Equal(6, await db.StationObservations.CountAsync(o => db.Stations.Any(s => s.Id == o.StationId && s.SourceId == "bicing-bcn")));
    }
}

public sealed class BicingArchiveIngestionTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private Task<IngestionRun> IngestFixturesAsync() => BicingIngestion.IngestFixturesAsync(database);

    [Fact]
    public async Task In_a_conflict_the_first_value_is_kept_and_a_capacity_change_opens_a_version()
    {
        database.RequireAvailable();
        await IngestFixturesAsync();

        await using var db = database.CreateContext();
        var station3 = await db.Stations.Include(s => s.Versions)
            .SingleAsync(s => s.SourceId == "bicing-bcn" && s.SourceStationId == "3");
        var conflicted = await db.StationObservations
            .SingleAsync(o => o.StationId == station3.Id && o.ObservedAt == BicingFixtures.S1.AddSeconds(-20));
        Assert.Equal(5, conflicted.BikesAvailable);

        var versions = station3.Versions.OrderBy(v => v.FirstSeenAt).ToList();
        Assert.Equal([30, 33], versions.Select(v => v.Capacity));
        Assert.Equal(BicingFixtures.S3, versions[0].ValidTo);
        Assert.Equal(BicingFixtures.S3, versions[1].ValidFrom);
        Assert.Equal("Eixample", versions[1].District);
    }

    [Fact]
    public async Task The_api_serves_the_day_with_its_versions_and_flags()
    {
        database.RequireAvailable();
        await IngestFixturesAsync();
        await using var factory = new ApiFactory(database.ConnectionString);
        var client = factory.CreateClient();
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(json);

        async Task<StationsResponse> At(DateTimeOffset at) =>
            (await client.GetFromJsonAsync<StationsResponse>(
                $"/api/stations?source=bicing-bcn&at={Uri.EscapeDataString(at.ToString("O"))}", json,
                TestContext.Current.CancellationToken))!;

        var afternoon = await At(BicingFixtures.S3.AddMinutes(5));
        Assert.Equal(SourceKind.Observed, afternoon.Source.Kind);
        Assert.Equal(InstantBasis.Requested, afternoon.AtBasis);
        Assert.Equal(15, afternoon.ToleranceMinutes);

        var s3 = afternoon.Stations.Single(s => s.SourceStationId == "3");
        Assert.Equal(33, s3.Capacity);
        Assert.Equal(12, s3.Altitude);
        Assert.Null(afternoon.Stations.Single(s => s.SourceStationId == "4").Altitude);
        Assert.Equal(Freshness.Current, s3.State.Freshness);
        Assert.False(s3.State.IsRenting);
        Assert.True(s3.State.IsReturning);
        Assert.Equal("la Dreta de l'Eixample", s3.Neighbourhood);

        Assert.Equal(ObservationStatus.Closed, afternoon.Stations.Single(s => s.SourceStationId == "2").State.Status);
        Assert.Equal(3, afternoon.Stations.Single(s => s.SourceStationId == "1").State.BikesAvailable);

        // De madrugada la 3 tenía la capacidad anterior.
        var night = await At(BicingFixtures.S1.AddMinutes(5));
        Assert.Equal(30, night.Stations.Single(s => s.SourceStationId == "3").Capacity);

        // Una hora sin datos después del último reporte: fuera de la tolerancia de 15 min.
        var later = await At(BicingFixtures.S3.AddHours(1));
        Assert.All(later.Stations, s => Assert.NotEqual(Freshness.Current, s.State.Freshness));
    }
}
