using System.Text;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;
using BarcelonaPulse.Api.Features.Ingestion.BicingLive;
using BarcelonaPulse.Api.Features.Stations;

namespace BarcelonaPulse.Api.Tests.Unit;

/// <summary>
/// El feed de tiempo real de Bicing, con la forma observada el 8-10-2026: dos documentos
/// (estado e información) con <c>last_updated</c>, <c>ttl</c> y <c>data.stations</c>.
/// </summary>
public sealed class BicingLiveAdapterTests
{
    /// <summary>Instantánea del estado a las 15:36:26 UTC; la información es de unos minutos después (los mismos segundos epoch que llevan los JSON).</summary>
    private const long InfoAt = 1791474496;

    private const string Status = """
        {"last_updated":1791473786,"ttl":0,"data":{"stations":[
          {"station_id":1,"num_bikes_available":1,"is_charging_station":true,"status":"IN_SERVICE","traffic":null,
           "num_bikes_available_types":{"mechanical":1,"ebike":0},"num_docks_available":41,"last_reported":1791473778,
           "is_installed":1,"is_renting":1,"is_returning":1},
          {"station_id":2,"num_bikes_available":0,"status":"NOT_IN_SERVICE","num_bikes_available_types":{"mechanical":0,"ebike":0},
           "num_docks_available":0,"last_reported":1791473600,"is_installed":1,"is_renting":0,"is_returning":0},
          {"station_id":3,"num_bikes_available":null,"status":"IN_SERVICE","num_docks_available":null,"last_reported":1791473700,
           "is_installed":0,"is_renting":true,"is_returning":true},
          {"station_id":"4","num_bikes_available":"doce","status":"IN_SERVICE","num_docks_available":5,"last_reported":1791473700,
           "is_installed":1,"is_renting":1,"is_returning":1},
          {"station_id":5,"num_bikes_available":2,"status":"IN_SERVICE","num_docks_available":5,"last_reported":"ayer",
           "is_installed":1,"is_renting":1,"is_returning":1},
          {"station_id":6,"num_bikes_available":2,"status":"IN_SERVICE","num_docks_available":0,"last_reported":1791473710,
           "is_installed":1,"is_renting":1,"is_returning":1},
          {"num_bikes_available":2,"status":"IN_SERVICE","num_docks_available":0,"last_reported":1791473710}
        ]}}
        """;

    private const string Info = """
        {"last_updated":1791474496,"ttl":0,"data":{"stations":[
          {"station_id":1,"external_id":"fc540556-eb2f-11ef-896d-0a9e2ea61361","name":"GRAN VIA CORTS CATALANES, 760",
           "physical_configuration":"ELECTRICBIKESTATION","lat":41.3979779,"lon":2.1801069,"altitude":16.0,
           "address":"GRAN VIA CORTS CATALANES, 760","cross_street":"02-Eixample/05-el Fort Pienc","post_code":"08013",
           "capacity":45,"is_charging_station":true,"short_name":1,"nearby_distance":1000.0,"_ride_code_support":true,"rental_uris":null},
          {"station_id":2,"name":"C/ ROGER DE FLOR, 126","lat":41.3954877,"lon":2.1771985,"altitude":null,
           "address":"C/ ROGER DE FLOR, 126","cross_street":null,"capacity":28},
          {"station_id":3,"name":"PG. DE GRÀCIA, 30","lat":41.3912,"lon":2.165,"capacity":null},
          {"station_id":"4","name":"C/ SENSE BARRI, 1","lat":41.38,"lon":2.17,"capacity":"treinta"},
          {"station_id":5,"name":"SIN COORDENADAS","lat":null,"lon":2.17,"capacity":10},
          {"station_id":6,"name":"Estación de TESTING (no usuarios)","lat":41.3476951,"lon":2.11948,"capacity":2}
        ]}}
        """;

    private static IngestionBatch Read(string status = Status, string info = Info) =>
        BicingLiveAdapter.Read(Encoding.UTF8.GetBytes(status), Encoding.UTF8.GetBytes(info), "prueba", null);

    private static DateTimeOffset At(long seconds) => DateTimeOffset.FromUnixTimeSeconds(seconds);

    [Fact]
    public void Stations_come_from_the_information_document_with_the_same_rules_as_the_archive()
    {
        var batch = Read();

        Assert.Equal(["1", "2", "3"], batch.Stations.Select(s => s.SourceStationId));
        var first = batch.Stations[0];
        Assert.Equal("GRAN VIA CORTS CATALANES, 760", first.Name);
        Assert.Equal("GRAN VIA CORTS CATALANES, 760", first.Address);
        Assert.Equal((2.1801069, 41.3979779), (first.Longitude, first.Latitude));
        Assert.Equal(45, first.Capacity);
        Assert.Equal(16, first.Altitude);
        Assert.Equal(("Eixample", "el Fort Pienc"), (first.District, first.Neighbourhood));
        // Todas con el last_updated del documento: el feed no fecha cada estación.
        Assert.All(batch.Stations, s => Assert.Equal(At(InfoAt), s.SeenAt));
        // Sin cruce ni altitud: nulos, no cero. Sin capacidad: nula.
        Assert.Equal((null, null, null), (batch.Stations[1].District, batch.Stations[1].Neighbourhood, batch.Stations[1].Altitude));
        Assert.Null(batch.Stations[2].Capacity);
    }

    [Fact]
    public void Observations_keep_the_station_and_last_reported_key_and_the_status_rules()
    {
        var batch = Read();

        Assert.Equal(["1", "2", "3"], batch.Observations.Select(o => o.SourceStationId));
        var inService = batch.Observations[0];
        Assert.Equal(At(1791473778), inService.ObservedAt);
        Assert.Equal(ObservationStatus.InService, inService.Status);
        Assert.Equal((1, 1, 0, 41), (inService.BikesAvailable, inService.MechanicalBikesAvailable, inService.EbikesAvailable, inService.DocksAvailable));
        Assert.Equal((true, true), (inService.IsRenting, inService.IsReturning));
        // El feed no publica elementos deshabilitados: desconocido, no cero.
        Assert.Null(inService.BikesDisabled);
        Assert.Null(inService.DocksDisabled);

        var closed = batch.Observations[1];
        Assert.Equal(ObservationStatus.Closed, closed.Status);
        Assert.Equal((false, false), (closed.IsRenting, closed.IsReturning));

        // IN_SERVICE sin instalar es prevista; recuentos null y banderas booleanas se entienden.
        var planned = batch.Observations[2];
        Assert.Equal(ObservationStatus.Planned, planned.Status);
        Assert.Null(planned.BikesAvailable);
        Assert.Null(planned.MechanicalBikesAvailable);
        Assert.Equal((true, true), (planned.IsRenting, planned.IsReturning));
    }

    [Fact]
    public void What_cannot_be_read_is_rejected_with_its_reason_and_the_test_station_is_left_out()
    {
        var batch = Read();

        var stations = batch.Rejected.Where(r => r.RecordKind == RecordKinds.Station).ToList();
        Assert.Equal(["4", "5"], stations.Select(r => r.RecordRef));
        Assert.Equal([RejectionReasons.InvalidValue, RejectionReasons.MissingField], stations.Select(r => r.Reason));
        Assert.Equal("capacity=treinta", stations[0].Detail);

        var observations = batch.Rejected.Where(r => r.RecordKind == RecordKinds.Observation).ToList();
        Assert.Equal(["4@1791473700", "5@ayer", "estación 7"], observations.Select(r => r.RecordRef));
        Assert.Equal("num_bikes_available=doce", observations[0].Detail);
        Assert.Equal("last_reported=ayer", observations[1].Detail);
        Assert.Equal(RejectionReasons.MissingField, observations[2].Reason);

        // La estación de pruebas del operador no es pública: ni ella ni su observación, sin contarlas.
        Assert.DoesNotContain(batch.Stations, s => s.SourceStationId == "6");
        Assert.DoesNotContain(batch.Observations, o => o.SourceStationId == "6");
        Assert.DoesNotContain(batch.Rejected, r => r.RecordRef.StartsWith("6", StringComparison.Ordinal));
    }

    [Fact]
    public void The_batch_belongs_to_the_archive_source_and_covers_the_five_minute_step_of_the_snapshot()
    {
        var batch = Read();

        Assert.Same(BicingArchiveAdapter.Source, batch.Source);
        Assert.Equal(BicingLiveAdapter.AdapterName, batch.Adapter);
        Assert.Contains("instantánea 2026-10-08T15:36:26+00:00", batch.InputRef);
        // 15:36:26 cae en el paso de las 15:35: cubre [15:35, 15:40).
        Assert.Equal(new CoveredPeriod(At(1791473700), At(1791474000)), batch.Covers);
    }

    [Theory]
    [InlineData("[]", Info)]
    [InlineData("{\"ttl\":0,\"data\":{\"stations\":[]}}", Info)]
    [InlineData("{\"last_updated\":1791473786,\"data\":{}}", Info)]
    [InlineData(Status, "{\"last_updated\":\"hoy\",\"data\":{\"stations\":[]}}")]
    [InlineData("no es json", Info)]
    public void A_document_without_the_feed_shape_is_refused(string status, string info)
    {
        Assert.Throws<InvalidDataException>(() => Read(status, info));
    }
}
