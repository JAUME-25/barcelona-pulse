using System.Linq.Expressions;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.Scenarios;

/// <summary>Estación inventada para el escenario. No se guarda en ningún sitio.</summary>
/// <param name="Id">Etiqueta que pone el cliente (h1, h2…); se devuelve tal cual.</param>
/// <param name="Longitude">Longitud WGS84.</param>
/// <param name="Latitude">Latitud WGS84.</param>
public sealed record HypotheticalStation(string Id, double Longitude, double Latitude);

/// <summary>Estación real de la red base que en el escenario está en otro sitio.</summary>
/// <param name="Station">Identificador interno de la estación.</param>
/// <param name="Longitude">Nueva longitud WGS84.</param>
/// <param name="Latitude">Nueva latitud WGS84.</param>
public sealed record MovedStation(long Station, double Longitude, double Latitude);

/// <summary>Escenario: la red real en un instante, con estaciones añadidas, movidas o quitadas.</summary>
/// <param name="Source">Fuente de la red base.</param>
/// <param name="At">Instante de referencia (ISO 8601 con zona): entran las estaciones con ubicación vigente entonces. Sin él, como en /api/stations.</param>
/// <param name="StudyArea">Área de estudio (GET /api/study-areas): el denominador del porcentaje.</param>
/// <param name="RadiusMeters">Radio en metros, en línea recta, de 50 a 1000.</param>
/// <param name="Added">Estaciones hipotéticas.</param>
/// <param name="Moved">Estaciones reales en otra ubicación.</param>
/// <param name="Removed">Estaciones reales que no están en el escenario.</param>
public sealed record CoverageRequest(
    string Source,
    string StudyArea,
    int RadiusMeters,
    string? At = null,
    IReadOnlyList<HypotheticalStation>? Added = null,
    IReadOnlyList<MovedStation>? Moved = null,
    IReadOnlyList<long>? Removed = null);

/// <summary>Modelo con el que se ha calculado: nombre, versión y supuestos explícitos.</summary>
public sealed record CoverageModel(string Name, int Version, IReadOnlyList<string> Assumptions);

/// <summary>Red base: de qué fuente, en qué instante y cuántas estaciones.</summary>
public sealed record CoverageReference(SourceRef Source, DateTimeOffset At, InstantBasis AtBasis, int Stations);

/// <summary>Área de estudio, con su procedencia.</summary>
public sealed record StudyAreaItem(
    string Id,
    string Name,
    StudyAreaKind Kind,
    double AreaSquareMeters,
    string Source,
    string Attribution,
    string? License,
    string? Note);

/// <summary>Superficie cubierta: la unión de los círculos, recortada al área de estudio.</summary>
/// <param name="Stations">Estaciones que entran en el cálculo.</param>
/// <param name="CoveredSquareMeters">Metros cuadrados del área de estudio a menos del radio de alguna estación.</param>
/// <param name="CoveredShare">Proporción del área de estudio (0 a 1).</param>
public sealed record CoverageResult(int Stations, double CoveredSquareMeters, double CoveredShare);

/// <summary>Lo que el escenario cubre y la base no, y al revés.</summary>
public sealed record CoverageDifference(double GainedSquareMeters, double LostSquareMeters);

/// <summary>Geometrías GeoJSON en WGS84 (lon, lat), simplificadas 1 m para dibujarlas.</summary>
public sealed record CoverageGeometries(
    JsonElement StudyArea, JsonElement Base, JsonElement Scenario, JsonElement Gained, JsonElement Lost);

/// <summary>Resultado de un escenario, con todo lo necesario para reproducirlo.</summary>
public sealed record CoverageResponse(
    CoverageModel Model,
    CoverageReference Reference,
    StudyAreaItem StudyArea,
    int RadiusMeters,
    IReadOnlyList<HypotheticalStation> Added,
    IReadOnlyList<MovedStation> Moved,
    IReadOnlyList<long> Removed,
    CoverageResult Base,
    CoverageResult Scenario,
    CoverageDifference Difference,
    CoverageGeometries Geometries);

/// <summary>
/// Cobertura geométrica de una red de estaciones (ADR 0013): círculos del radio elegido alrededor
/// de cada estación, unidos y recortados al área de estudio, en EPSG:25831. Base y escenario se
/// calculan en la misma consulta y nada se guarda.
/// </summary>
public static class CoverageQuery
{
    public const int MinRadius = 50;
    public const int MaxRadius = 1000;
    public const int MaxAdded = 50;
    public const int MaxMoved = 100;

    /// <summary>Lados de cada círculo: 64 (quad_segs=16). El área sale un 0,16 % por debajo de la del círculo.</summary>
    private const int QuadrantSegments = 16;

    /// <summary>Tolerancia, en metros, de las geometrías que se devuelven para dibujar.</summary>
    private const double DrawingTolerance = 1;

    public static readonly CoverageModel Model = new("cobertura-geometrica", 1,
    [
        "Distancia en línea recta desde cada estación, no a pie por calles: no es una isócrona.",
        "Cada estación cubre un círculo del radio elegido; los solapes se cuentan una sola vez.",
        "Superficies en EPSG:25831 (metros). Cada círculo es un polígono de 64 lados: 0,16 % menos de área.",
        "El porcentaje es sobre el área de estudio elegida, no sobre la población ni sobre otra zona.",
        "Entran todas las estaciones con ubicación vigente en el instante de referencia, estén o no operativas.",
        "La capacidad no cambia la cobertura. Nada de esto dice cuántos viajes, esperas o demanda habría.",
        "Las geometrías se simplifican 1 m para dibujarlas; las superficies se calculan sin simplificar.",
    ]);

    private const string BaseStationsSql = """
        SELECT v.station_id
        FROM station_versions v
        JOIN stations s ON s.id = v.station_id
        WHERE s.source_id = @source
          AND (v.valid_from IS NULL OR v.valid_from <= @at)
          AND (v.valid_to IS NULL OR v.valid_to > @at)
        """;

    private const string CoverageSql = """
        WITH area AS (
            SELECT geometry AS g FROM study_areas WHERE id = @area
        ),
        base AS (
            SELECT v.station_id AS id, ST_Transform(v.location, 25831) AS g
            FROM station_versions v
            JOIN stations s ON s.id = v.station_id
            WHERE s.source_id = @source
              AND (v.valid_from IS NULL OR v.valid_from <= @at)
              AND (v.valid_to IS NULL OR v.valid_to > @at)
        ),
        moved AS (
            SELECT m.id, ST_Transform(ST_SetSRID(ST_MakePoint(m.lon, m.lat), 4326), 25831) AS g
            FROM unnest(@moved_ids, @moved_lon, @moved_lat) AS m(id, lon, lat)
        ),
        added AS (
            SELECT ST_Transform(ST_SetSRID(ST_MakePoint(a.lon, a.lat), 4326), 25831) AS g
            FROM unnest(@added_lon, @added_lat) AS a(lon, lat)
        ),
        scenario AS (
            SELECT b.g FROM base b WHERE NOT (b.id = ANY(@removed)) AND NOT (b.id = ANY(@moved_ids))
            UNION ALL SELECT g FROM moved
            UNION ALL SELECT g FROM added
        ),
        covered AS (
            SELECT
                coalesce((SELECT ST_Intersection(ST_Union(ST_Buffer(g, @radius, @buffer)), (SELECT g FROM area)) FROM base),
                         ST_GeomFromText('POLYGON EMPTY', 25831)) AS base,
                coalesce((SELECT ST_Intersection(ST_Union(ST_Buffer(g, @radius, @buffer)), (SELECT g FROM area)) FROM scenario),
                         ST_GeomFromText('POLYGON EMPTY', 25831)) AS scenario
        ),
        diff AS (
            SELECT base, scenario, ST_Difference(scenario, base) AS gained, ST_Difference(base, scenario) AS lost
            FROM covered
        )
        SELECT
            (SELECT count(*) FROM base), (SELECT count(*) FROM scenario),
            ST_Area(d.base), ST_Area(d.scenario), ST_Area(d.gained), ST_Area(d.lost),
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology((SELECT g FROM area), @tolerance), 4326), 6),
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(d.base, @tolerance), 4326), 6),
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(d.scenario, @tolerance), 4326), 6),
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(d.gained, @tolerance), 4326), 6),
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(d.lost, @tolerance), 4326), 6)
        FROM diff d
        """;

    /// <summary>Estaciones de la red base en el instante: para validar las que se mueven o quitan.</summary>
    public static async Task<HashSet<long>> BaseStationIdsAsync(
        PulseDbContext db, string sourceId, DateTimeOffset at, CancellationToken ct)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = new NpgsqlCommand(BaseStationsSql, connection);
            command.Parameters.Add(new("source", NpgsqlDbType.Varchar) { Value = sourceId });
            command.Parameters.Add(new("at", NpgsqlDbType.TimestampTz) { Value = at.ToUniversalTime() });
            var ids = new HashSet<long>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) ids.Add(reader.GetInt64(0));
            return ids;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    public static async Task<CoverageResponse> ComputeAsync(
        PulseDbContext db, DataSource source, StudyAreaItem area, DateTimeOffset at, InstantBasis basis,
        int radius, IReadOnlyList<HypotheticalStation> added, IReadOnlyList<MovedStation> moved,
        IReadOnlyList<long> removed, CancellationToken ct)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var tx = await connection.BeginTransactionAsync(ct);
            // Un cálculo caro no puede quedarse colgado: como mucho 10 s.
            await using (var limit = new NpgsqlCommand("SET LOCAL statement_timeout = 10000", connection, tx))
            {
                await limit.ExecuteNonQueryAsync(ct);
            }

            await using var command = new NpgsqlCommand(CoverageSql, connection, tx);
            command.Parameters.Add(new("area", NpgsqlDbType.Varchar) { Value = area.Id });
            command.Parameters.Add(new("source", NpgsqlDbType.Varchar) { Value = source.Id });
            command.Parameters.Add(new("at", NpgsqlDbType.TimestampTz) { Value = at.ToUniversalTime() });
            command.Parameters.Add(new("radius", NpgsqlDbType.Double) { Value = (double)radius });
            command.Parameters.Add(new("buffer", NpgsqlDbType.Text) { Value = $"quad_segs={QuadrantSegments}" });
            command.Parameters.Add(new("tolerance", NpgsqlDbType.Double) { Value = DrawingTolerance });
            command.Parameters.Add(new("moved_ids", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = moved.Select(m => m.Station).ToArray() });
            command.Parameters.Add(new("moved_lon", NpgsqlDbType.Array | NpgsqlDbType.Double) { Value = moved.Select(m => m.Longitude).ToArray() });
            command.Parameters.Add(new("moved_lat", NpgsqlDbType.Array | NpgsqlDbType.Double) { Value = moved.Select(m => m.Latitude).ToArray() });
            command.Parameters.Add(new("added_lon", NpgsqlDbType.Array | NpgsqlDbType.Double) { Value = added.Select(a => a.Longitude).ToArray() });
            command.Parameters.Add(new("added_lat", NpgsqlDbType.Array | NpgsqlDbType.Double) { Value = added.Select(a => a.Latitude).ToArray() });
            command.Parameters.Add(new("removed", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = removed.ToArray() });

            await using var reader = await command.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            var baseStations = (int)reader.GetInt64(0);
            var scenarioStations = (int)reader.GetInt64(1);
            var baseArea = reader.GetDouble(2);
            var scenarioArea = reader.GetDouble(3);
            var gained = reader.GetDouble(4);
            var lost = reader.GetDouble(5);
            var geometries = new CoverageGeometries(
                Json(reader.GetString(6)), Json(reader.GetString(7)), Json(reader.GetString(8)),
                Json(reader.GetString(9)), Json(reader.GetString(10)));
            await reader.CloseAsync();
            await tx.CommitAsync(ct);

            return new CoverageResponse(
                Model,
                new CoverageReference(source.ToRef(), at, basis, baseStations),
                area,
                radius,
                added,
                moved,
                removed,
                new CoverageResult(baseStations, baseArea, baseArea / area.AreaSquareMeters),
                new CoverageResult(scenarioStations, scenarioArea, scenarioArea / area.AreaSquareMeters),
                new CoverageDifference(gained, lost),
                geometries);
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    // Sin la geometría: la del cálculo se queda en la base de datos.
    private static readonly Expression<Func<StudyArea, StudyAreaItem>> ToItem = a =>
        new StudyAreaItem(a.Id, a.Name, a.Kind, a.AreaSquareMeters, a.Source, a.Attribution, a.License, a.Note);

    /// <summary>Las áreas de estudio: Barcelona primero y después los distritos por código.</summary>
    public static Task<List<StudyAreaItem>> StudyAreaItemsAsync(PulseDbContext db, CancellationToken ct) =>
        db.StudyAreas.AsNoTracking()
            .OrderBy(a => a.Kind == StudyAreaKind.Municipality ? 0 : 1).ThenBy(a => a.Id)
            .Select(ToItem)
            .ToListAsync(ct);

    public static Task<StudyAreaItem?> StudyAreaItemAsync(PulseDbContext db, string id, CancellationToken ct) =>
        db.StudyAreas.AsNoTracking().Where(a => a.Id == id).Select(ToItem).FirstOrDefaultAsync(ct);

    private static JsonElement Json(string geoJson)
    {
        using var doc = JsonDocument.Parse(geoJson);
        return doc.RootElement.Clone();
    }
}
