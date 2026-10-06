using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Scenarios;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>Base propia con las áreas de estudio oficiales cargadas.</summary>
public sealed class CoverageFixture : IAsyncLifetime
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
        var loader = new StudyAreaLoader(db, TimeProvider.System, NullLogger<StudyAreaLoader>.Instance);
        await loader.LoadEmbeddedAsync(CancellationToken.None);
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

public sealed class CoverageApiTests(CoverageFixture fixture) : IClassFixture<CoverageFixture>
{
    private const string At = "2026-03-10T07:00:00Z";
    private const int Radius = 300;
    private static readonly JsonSerializerOptions Json = CreateJsonOptions();

    /// <summary>Pg. de Gràcia con Consell de Cent: lejos de los límites de Barcelona.</summary>
    private const double Lon = 2.1655;
    private const double Lat = 41.3905;

    /// <summary>Área de un círculo de 300 m hecho polígono de 64 lados: (n/2)·r²·sin(2π/n).</summary>
    private static readonly double Circle = 32 * Radius * Radius * Math.Sin(2 * Math.PI / 64);

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ServiceRegistration.ConfigureApiJson(options);
        return options;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private HttpClient Client()
    {
        fixture.Database.RequireAvailable();
        return fixture.Factory!.CreateClient();
    }

    private Task<HttpResponseMessage> PostAsync(object body) =>
        Client().PostAsJsonAsync("/api/scenarios/coverage", body, Json, Ct);

    private async Task<CoverageResponse> CoverageAsync(object body)
    {
        var response = await PostAsync(body);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CoverageResponse>(Json, Ct))!;
    }

    private async Task IngestStationsAsync(string sourceId, params NormalizedStation[] stations)
    {
        fixture.Database.RequireAvailable();
        await using var db = fixture.Database.CreateContext();
        var ingestor = new StationIngestor(db, TimeProvider.System, NullLogger<StationIngestor>.Instance);
        await ingestor.IngestAsync(Batch(stations, source: Source(sourceId)), "test", Ct);
    }

    /// <summary>El punto a dx, dy metros (EPSG:25831) del de partida, en lon/lat.</summary>
    private async Task<(double Lon, double Lat)> OffsetAsync(double dx, double dy)
    {
        await using var connection = new NpgsqlConnection(fixture.Database.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("""
            SELECT ST_X(p), ST_Y(p) FROM (
                SELECT ST_Transform(ST_Translate(ST_Transform(ST_SetSRID(ST_MakePoint(@lon, @lat), 4326), 25831), @dx, @dy), 4326) AS p
            ) x
            """, connection);
        command.Parameters.AddWithValue("lon", Lon);
        command.Parameters.AddWithValue("lat", Lat);
        command.Parameters.AddWithValue("dx", dx);
        command.Parameters.AddWithValue("dy", dy);
        await using var reader = await command.ExecuteReaderAsync(Ct);
        await reader.ReadAsync(Ct);
        return (reader.GetDouble(0), reader.GetDouble(1));
    }

    [Fact]
    public async Task The_study_areas_are_barcelona_and_its_ten_districts()
    {
        // Solo las oficiales: otra prueba añade un cuadrado propio a esta misma base.
        var areas = (await Client().GetFromJsonAsync<List<StudyAreaItem>>("/api/study-areas", Json, Ct))!
            .Where(a => a.Source.StartsWith("Ajuntament", StringComparison.Ordinal))
            .ToList();

        Assert.Equal(11, areas.Count);
        var barcelona = areas[0];
        Assert.Equal(("barcelona", StudyAreaKind.Municipality), (barcelona.Id, barcelona.Kind));
        Assert.InRange(barcelona.AreaSquareMeters / 1e6, 101.6, 101.8);
        // La unión no cuenta dos veces nada: los distritos suman lo mismo, salvo las rendijas rellenadas.
        var districts = areas.Where(a => a.Kind == StudyAreaKind.District).Sum(a => a.AreaSquareMeters);
        Assert.InRange(barcelona.AreaSquareMeters - districts, 0, 100);
        Assert.Equal("CC BY 4.0", barcelona.License);
    }

    [Fact]
    public async Task Loading_the_areas_again_leaves_the_same()
    {
        fixture.Database.RequireAvailable();
        await using var db = fixture.Database.CreateContext();
        var before = await db.StudyAreas.AsNoTracking().OrderBy(a => a.Id).Select(a => new { a.Id, a.AreaSquareMeters }).ToListAsync(Ct);
        await new StudyAreaLoader(db, TimeProvider.System, NullLogger<StudyAreaLoader>.Instance).LoadEmbeddedAsync(Ct);
        var after = await db.StudyAreas.AsNoTracking().OrderBy(a => a.Id).Select(a => new { a.Id, a.AreaSquareMeters }).ToListAsync(Ct);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task One_station_covers_a_circle_measured_in_square_meters()
    {
        await IngestStationsAsync("cov-one", Station("s1", Lon, Lat));

        var result = await CoverageAsync(new { source = "cov-one", studyArea = "barcelona", radiusMeters = Radius, at = At });

        Assert.Equal(1, result.Base.Stations);
        Assert.Equal(Circle, result.Base.CoveredSquareMeters, 0.5);
        Assert.Equal(result.Base.CoveredSquareMeters / result.StudyArea.AreaSquareMeters, result.Base.CoveredShare, 9);
        // Sin cambios, el escenario es la base.
        Assert.Equal(result.Base, result.Scenario);
        Assert.Equal((0, 0), (result.Difference.GainedSquareMeters, result.Difference.LostSquareMeters));
    }

    [Fact]
    public async Task Two_stations_in_the_same_place_count_once()
    {
        await IngestStationsAsync("cov-same", Station("s1", Lon, Lat), Station("s2", Lon, Lat));

        var result = await CoverageAsync(new { source = "cov-same", studyArea = "barcelona", radiusMeters = Radius, at = At });

        Assert.Equal(2, result.Base.Stations);
        Assert.Equal(Circle, result.Base.CoveredSquareMeters, 0.5);
    }

    [Fact]
    public async Task Overlapping_circles_are_counted_once()
    {
        var (lon2, lat2) = await OffsetAsync(Radius, 0);
        await IngestStationsAsync("cov-overlap", Station("s1", Lon, Lat), Station("s2", lon2, lat2));

        var result = await CoverageAsync(new { source = "cov-overlap", studyArea = "barcelona", radiusMeters = Radius, at = At });

        // Dos círculos a una distancia igual al radio: 2πr² menos la lente común (110 554 m²), en polígonos de 64 lados.
        const double union = (2 * Math.PI * Radius * Radius) - 110_553.6;
        Assert.InRange(result.Base.CoveredSquareMeters, union * 0.996, union);
        Assert.True(result.Base.CoveredSquareMeters < 2 * Circle);
    }

    /// <summary>Área de estudio de prueba: un cuadrado de 1 km de lado con la esquina suroeste en el punto de partida.</summary>
    private async Task EnsureTestSquareAsync()
    {
        fixture.Database.RequireAvailable();
        await using var connection = new NpgsqlConnection(fixture.Database.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("""
            INSERT INTO study_areas (id, name, kind, geometry, area_square_meters, source, attribution, license, note, input_sha256, loaded_at)
            SELECT 'test-square', 'Cuadrado de prueba', 'district', ST_Multi(ST_MakeEnvelope(x, y, x + 1000, y + 1000, 25831)),
                   1000000, 'prueba', 'prueba', NULL, NULL, 'prueba', now()
            FROM (SELECT ST_X(g) AS x, ST_Y(g) AS y
                  FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(@lon, @lat), 4326), 25831) AS g) a) b
            ON CONFLICT (id) DO NOTHING
            """, connection);
        command.Parameters.AddWithValue("lon", Lon);
        command.Parameters.AddWithValue("lat", Lat);
        await command.ExecuteNonQueryAsync(Ct);
    }

    [Fact]
    public async Task Coverage_is_clipped_to_the_study_area()
    {
        // Una estación en la esquina del cuadrado: cubre exactamente un cuarto de círculo.
        await EnsureTestSquareAsync();
        await IngestStationsAsync("cov-clip", Station("s1", Lon, Lat));

        var result = await CoverageAsync(new { source = "cov-clip", studyArea = "test-square", radiusMeters = Radius, at = At });

        Assert.Equal(Circle / 4, result.Base.CoveredSquareMeters, 0.5);
        Assert.Equal(Circle / 4 / 1_000_000, result.Base.CoveredShare, 6);
    }

    [Fact]
    public async Task A_scenario_adds_moves_and_removes_stations()
    {
        var b = await OffsetAsync(1000, 0);
        var h = await OffsetAsync(0, 1000);
        var bMoved = await OffsetAsync(1000, 1000);
        await IngestStationsAsync("cov-scenario", Station("a", Lon, Lat), Station("b", b.Lon, b.Lat));
        long idA, idB;
        await using (var db = fixture.Database.CreateContext())
        {
            idA = (await db.Stations.SingleAsync(s => s.SourceId == "cov-scenario" && s.SourceStationId == "a", Ct)).Id;
            idB = (await db.Stations.SingleAsync(s => s.SourceId == "cov-scenario" && s.SourceStationId == "b", Ct)).Id;
        }

        var result = await CoverageAsync(new
        {
            source = "cov-scenario",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = h.Lon, latitude = h.Lat } },
            moved = new[] { new { station = idB, longitude = bMoved.Lon, latitude = bMoved.Lat } },
            removed = new[] { idA },
        });

        // Superficies al metro cuadrado: a menos de 1 m² de la exacta.
        Assert.Equal((2, 2), (result.Base.Stations, result.Scenario.Stations));
        Assert.Equal(2 * Circle, result.Base.CoveredSquareMeters, 1d);
        Assert.Equal(2 * Circle, result.Scenario.CoveredSquareMeters, 1d);
        Assert.Equal(2 * Circle, result.Difference.GainedSquareMeters, 1d);
        Assert.Equal(2 * Circle, result.Difference.LostSquareMeters, 1d);
        // Devuelve el escenario tal cual se pidió, con el modelo y sus supuestos.
        Assert.Equal("h1", Assert.Single(result.Added).Id);
        Assert.Equal(idB, Assert.Single(result.Moved).Station);
        Assert.Equal(idA, Assert.Single(result.Removed));
        Assert.Equal(("cobertura-geometrica", 1), (result.Model.Name, result.Model.Version));
        Assert.Contains(result.Model.Assumptions, a => a.Contains("isócrona", StringComparison.Ordinal));
        // Lo ganado son dos círculos separados: una geometría GeoJSON de varias partes.
        Assert.Equal("MultiPolygon", result.Geometries.Gained.GetProperty("type").GetString());
    }

    [Fact]
    public async Task A_station_in_ground_already_covered_gains_exactly_nothing()
    {
        // Cuatro estaciones en cuadrado (300 m de lado): cubren entero el círculo de una en el centro.
        var corners = new List<NormalizedStation>();
        foreach (var (dx, dy) in new[] { (-150, -150), (150, -150), (-150, 150), (150, 150) })
        {
            var (lon, lat) = await OffsetAsync(dx, dy);
            corners.Add(Station($"c{corners.Count}", lon, lat));
        }

        await IngestStationsAsync("cov-dense", [.. corners]);

        var result = await CoverageAsync(new
        {
            source = "cov-dense",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = Lon, latitude = Lat } },
        });

        // Sin restos de coma flotante: cero exacto, y la estación cuenta igual.
        Assert.Equal((0d, 0d), (result.Difference.GainedSquareMeters, result.Difference.LostSquareMeters));
        Assert.Equal(result.Base.CoveredSquareMeters, result.Scenario.CoveredSquareMeters);
        Assert.Equal((4, 5), (result.Base.Stations, result.Scenario.Stations));
    }

    [Fact]
    public async Task Every_change_comes_with_the_circle_of_the_calculation()
    {
        var b = await OffsetAsync(1000, 0);
        var h = await OffsetAsync(0, 1000);
        var bMoved = await OffsetAsync(1000, 1000);
        await IngestStationsAsync("cov-reach", Station("a", Lon, Lat), Station("b", b.Lon, b.Lat));
        long idA, idB;
        await using (var db = fixture.Database.CreateContext())
        {
            idA = (await db.Stations.SingleAsync(s => s.SourceId == "cov-reach" && s.SourceStationId == "a", Ct)).Id;
            idB = (await db.Stations.SingleAsync(s => s.SourceId == "cov-reach" && s.SourceStationId == "b", Ct)).Id;
        }

        var result = await CoverageAsync(new
        {
            source = "cov-reach",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = h.Lon, latitude = h.Lat } },
            moved = new[] { new { station = idB, longitude = bMoved.Lon, latitude = bMoved.Lat } },
            removed = new[] { idA },
        });

        // Nuevas, movidas y quitadas, en ese orden.
        Assert.Collection(result.Geometries.Reach,
            r => Assert.Equal((ChangeKind.Added, "h1", (long?)null), (r.Kind, r.Added, r.Station)),
            r => Assert.Equal((ChangeKind.Moved, (string?)null, (long?)idB), (r.Kind, r.Added, r.Station)),
            r => Assert.Equal((ChangeKind.Removed, (string?)null, (long?)idA), (r.Kind, r.Added, r.Station)));

        // Cada círculo es el polígono de 64 lados del cálculo, con el área del círculo de 300 m,
        // y queda entero dentro de Barcelona.
        await using var connection = new NpgsqlConnection(fixture.Database.ConnectionString);
        await connection.OpenAsync(Ct);
        foreach (var reach in result.Geometries.Reach)
        {
            Assert.Equal("Polygon", reach.Circle.GetProperty("type").GetString());
            Assert.Equal(65, reach.Circle.GetProperty("coordinates")[0].GetArrayLength());
            await using var command = new NpgsqlCommand(
                "SELECT ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(@g), 4326), 25831))", connection);
            command.Parameters.AddWithValue("g", reach.Circle.GetRawText());
            var area = (double)(await command.ExecuteScalarAsync(Ct))!;
            Assert.InRange(area, Circle * 0.999, Circle * 1.001);
            Assert.Equal(Circle, reach.SquareMetersInArea, 1d);
        }
    }

    [Fact]
    public async Task A_station_outside_the_study_area_reaches_none_of_it()
    {
        // El cuadrado de prueba empieza en el punto de partida; la nueva queda 2 km al sur.
        await EnsureTestSquareAsync();
        var far = await OffsetAsync(0, -2000);
        await IngestStationsAsync("cov-outside", Station("s1", Lon, Lat));

        var result = await CoverageAsync(new
        {
            source = "cov-outside",
            studyArea = "test-square",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = far.Lon, latitude = far.Lat } },
        });

        var reach = Assert.Single(result.Geometries.Reach);
        Assert.Equal(0, reach.SquareMetersInArea);
        Assert.Equal(0, result.Difference.GainedSquareMeters);
    }

    [Fact]
    public async Task A_capacity_change_alone_does_not_change_coverage()
    {
        var t1 = T0.AddDays(1);
        await IngestStationsAsync("cov-capacity",
            Station("s1", Lon, Lat, capacity: 20), Station("s1", Lon, Lat, capacity: 40, seenAt: t1));

        var before = await CoverageAsync(new { source = "cov-capacity", studyArea = "barcelona", radiusMeters = Radius, at = At });
        var after = await CoverageAsync(new
        {
            source = "cov-capacity",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = t1.AddHours(1).ToString("O"),
        });

        Assert.Equal(before.Base.CoveredSquareMeters, after.Base.CoveredSquareMeters);
    }

    [Fact]
    public async Task The_same_scenario_gives_the_same_result()
    {
        var (lon2, lat2) = await OffsetAsync(250, 120);
        await IngestStationsAsync("cov-repeat", Station("s1", Lon, Lat));
        var body = new
        {
            source = "cov-repeat",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = lon2, latitude = lat2 } },
        };

        var first = await (await PostAsync(body)).Content.ReadAsStringAsync(Ct);
        var second = await (await PostAsync(body)).Content.ReadAsStringAsync(Ct);

        Assert.Equal(first, second);
    }

    [Theory]
    [InlineData(0, "barcelona", "radiusMeters")]
    [InlineData(1001, "barcelona", "radiusMeters")]
    [InlineData(300, "no-existe", "studyArea")]
    public async Task Invalid_parameters_return_a_validation_problem(int radius, string area, string field)
    {
        await IngestStationsAsync("cov-invalid", Station("s1", Lon, Lat));

        var response = await PostAsync(new { source = "cov-invalid", studyArea = area, radiusMeters = radius, at = At });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Changes_must_refer_to_real_stations_and_stay_in_barcelona()
    {
        await IngestStationsAsync("cov-changes", Station("s1", Lon, Lat));
        var outside = await PostAsync(new
        {
            source = "cov-changes",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = new[] { new { id = "h1", longitude = -3.70, latitude = 40.42 } }, // Madrid
        });
        var unknown = await PostAsync(new
        {
            source = "cov-changes",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            removed = new[] { 999_999L },
        });
        var tooMany = await PostAsync(new
        {
            source = "cov-changes",
            studyArea = "barcelona",
            radiusMeters = Radius,
            at = At,
            added = Enumerable.Range(0, CoverageQuery.MaxAdded + 1).Select(i => new { id = $"h{i}", longitude = Lon, latitude = Lat }),
        });
        var noSource = await PostAsync(new { source = "no-existe", studyArea = "barcelona", radiusMeters = Radius });

        Assert.Equal(HttpStatusCode.BadRequest, outside.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, noSource.StatusCode);
        // El error va en el campo que lo tiene: una quitada que no existe, en «removed».
        using var body = JsonDocument.Parse(await unknown.Content.ReadAsStringAsync(Ct));
        var errors = body.RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("removed", out _));
        Assert.False(errors.TryGetProperty("moved", out _));
    }
}
