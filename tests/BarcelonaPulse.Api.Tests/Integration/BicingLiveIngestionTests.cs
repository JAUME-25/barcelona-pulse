using System.Text;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingLive;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Tests.Unit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// Una instantánea del feed de tiempo real entra en la misma fuente que el histórico: lo que ya
/// estaba (misma estación y mismo last_reported) es repetido, lo nuevo entra, y los atributos
/// iguales no abren versiones. El archivo del mes, cuando llegue, dirá lo mismo al revés.
/// </summary>
public sealed class BicingLiveIngestionTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    /// <summary>Después del día del fixture: una observación por delante del reloj se rechazaría.</summary>
    private static readonly DateTimeOffset Now = new(2026, 8, 20, 22, 30, 0, TimeSpan.Zero);

    private static DateTimeOffset At(long seconds) => DateTimeOffset.FromUnixTimeSeconds(seconds);

    [Fact]
    public async Task A_live_snapshot_after_the_archive_day_adds_only_what_is_new_and_fills_the_altitude()
    {
        database.RequireAvailable();
        var ct = TestContext.Current.CancellationToken;
        await using var db = database.CreateContext();
        var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(BicingFixtures.Read(), "test", ct);

        // A las 20:00 UTC del 20-8, después de todo lo que el fixture publica ese día: la 1 repite
        // su reporte de la noche anterior, la 3 informa de nuevo y la 999 no existe en la fuente.
        const string status = """
            {"last_updated":1787256000,"ttl":0,"data":{"stations":[
              {"station_id":1,"num_bikes_available":11,"status":"IN_SERVICE","num_bikes_available_types":{"mechanical":11,"ebike":0},
               "num_docks_available":28,"last_reported":1787176900,"is_installed":1,"is_renting":1,"is_returning":1},
              {"station_id":3,"num_bikes_available":6,"status":"IN_SERVICE","num_bikes_available_types":{"mechanical":4,"ebike":2},
               "num_docks_available":24,"last_reported":1787255990,"is_installed":1,"is_renting":1,"is_returning":1},
              {"station_id":999,"num_bikes_available":4,"status":"IN_SERVICE","num_bikes_available_types":{"mechanical":4,"ebike":0},
               "num_docks_available":10,"last_reported":1787255980,"is_installed":1,"is_renting":1,"is_returning":1}
            ]}}
            """;
        // Los mismos atributos que tiene cada una a esa hora; la 4 venía sin altitud y ahora la trae.
        const string info = """
            {"last_updated":1787256000,"ttl":0,"data":{"stations":[
              {"station_id":1,"name":"GRAN VIA CORTS CATALANES, 760","lat":41.3979779,"lon":2.1801069,"altitude":20,
               "address":"GRAN VIA CORTS CATALANES, 760","cross_street":"02-Eixample/05-el Fort Pienc","capacity":44},
              {"station_id":3,"name":"PG. DE GRÀCIA, 30","lat":41.3912,"lon":2.165,"altitude":12,
               "address":"PG. DE GRÀCIA, 30","cross_street":"02-Eixample/07-la Dreta de l'Eixample","capacity":33},
              {"station_id":4,"name":"C/ SENSE BARRI, 1","lat":41.38,"lon":2.17,"altitude":7.0,
               "address":"C/ SENSE BARRI, 1","cross_street":null,"capacity":null}
            ]}}
            """;
        var batch = BicingLiveAdapter.Read(Encoding.UTF8.GetBytes(status), Encoding.UTF8.GetBytes(info), "instantánea de prueba", null);
        var run = await ingestor.IngestAsync(batch, "test", ct);

        Assert.Equal(IngestionStatus.SucceededWithIssues, run.Status);
        Assert.Equal((1, 1, 0, 1), (run.ObservationsAccepted, run.ObservationsDuplicate, run.ObservationsConflicting, run.ObservationsRejected));
        Assert.Equal(0, run.StationVersionsCreated);
        var rejection = Assert.Single(await db.IngestionRejections.Where(r => r.IngestionRunId == run.Id).ToListAsync(ct));
        Assert.Equal((RecordKinds.Observation, RejectionReasons.UnknownStation), (rejection.RecordKind, rejection.Reason));

        // La altitud se rellena sin abrir otra versión; la nueva observación es de la 3.
        var fourth = await db.StationVersions.Where(v => v.Station.SourceId == "bicing-bcn" && v.Station.SourceStationId == "4").ToListAsync(ct);
        Assert.Equal(7, Assert.Single(fourth).Altitude);
        Assert.True(await db.StationObservations.AnyAsync(o => o.ObservedAt == At(1787255990), ct));

        // Cubre el paso de cinco minutos de la instantánea: el día ya se podía reproducir y sigue igual.
        Assert.Equal(new CoveredPeriod(At(1787256000), At(1787256300)), batch.Covers);
        Assert.Equal([new DateOnly(2026, 8, 20)], await SourceDays.GetAsync(db, "bicing-bcn", ct));
    }
}
