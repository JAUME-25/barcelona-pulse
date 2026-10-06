using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.Scenarios;

/// <summary>Área cargada, para el resumen del comando.</summary>
public sealed record LoadedStudyArea(string Id, string Name, double AreaSquareMeters);

/// <summary>
/// Carga las áreas de estudio desde el archivo oficial de distritos del Ajuntament, embebido sin
/// modificar (ver <c>Data/PROVENANCE.md</c>): los 10 distritos y Barcelona como su unión.
/// Repetirlo deja lo mismo.
/// </summary>
public sealed class StudyAreaLoader(PulseDbContext db, TimeProvider clock, ILogger<StudyAreaLoader> logger)
{
    internal const string ResourceName = "BarcelonaPulse.Api.BarcelonaCiutat_Districtes.json";
    private const int MaxInputBytes = 5 * 1024 * 1024;
    private const string Source =
        "Ajuntament de Barcelona, Open Data BCN: 20170706-districtes-barris (BarcelonaCiutat_Districtes.json)";
    private const string Attribution = "Fuente de los datos: Ayuntamiento de Barcelona.";
    private const string License = "CC BY 4.0";

    /// <summary>
    /// En la unión de los distritos, los huecos más pequeños que esto son rendijas entre límites
    /// vecinos que no coinciden del todo (en el archivo de 2024, 24 que suman 14 m²).
    /// </summary>
    internal const double SliverSquareMeters = 100;

    private const string MunicipalityNote =
        "Unión de los 10 distritos. Se rellenan las rendijas de menos de 100 m² que dejan límites vecinos que no coinciden del todo.";

    private const string UpsertDistrictSql = """
        INSERT INTO study_areas (id, name, kind, geometry, area_square_meters, source, attribution, license, note, input_sha256, loaded_at)
        SELECT @id, @name, 'district', g, ST_Area(g), @source, @attribution, @license, NULL, @sha, @now
        FROM (SELECT ST_Multi(ST_GeomFromText(@wkt, 25831)) AS g) x
        WHERE ST_IsValid(x.g) AND NOT ST_IsEmpty(x.g)
        ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, kind = excluded.kind, geometry = excluded.geometry,
            area_square_meters = excluded.area_square_meters, source = excluded.source,
            attribution = excluded.attribution, license = excluded.license, note = excluded.note,
            input_sha256 = excluded.input_sha256, loaded_at = excluded.loaded_at
        """;

    // Barcelona: la unión de los distritos, sin las rendijas (huecos interiores pequeños).
    private const string UpsertMunicipalitySql = """
        WITH u AS (SELECT ST_Union(geometry) AS g FROM study_areas WHERE kind = 'district'),
        parts AS (SELECT (ST_Dump(g)).geom AS p FROM u),
        cleaned AS (
            SELECT ST_MakePolygon(
                ST_ExteriorRing(p),
                ARRAY(SELECT ST_InteriorRingN(p, n)
                      FROM generate_series(1, ST_NumInteriorRings(p)) AS n
                      WHERE ST_Area(ST_MakePolygon(ST_InteriorRingN(p, n))) >= @sliver)) AS p
            FROM parts
        ),
        municipality AS (SELECT ST_Multi(ST_Collect(p)) AS g FROM cleaned)
        INSERT INTO study_areas (id, name, kind, geometry, area_square_meters, source, attribution, license, note, input_sha256, loaded_at)
        SELECT 'barcelona', 'Barcelona', 'municipality', g, ST_Area(g), @source, @attribution, @license, @note, @sha, @now
        FROM municipality
        WHERE g IS NOT NULL AND ST_IsValid(g)
        ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, kind = excluded.kind, geometry = excluded.geometry,
            area_square_meters = excluded.area_square_meters, source = excluded.source,
            attribution = excluded.attribution, license = excluded.license, note = excluded.note,
            input_sha256 = excluded.input_sha256, loaded_at = excluded.loaded_at
        """;

    private sealed record District(string Code, string Name, string Wkt);

    public async Task<IReadOnlyList<LoadedStudyArea>> LoadEmbeddedAsync(CancellationToken ct)
    {
        await using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"No se encuentra el recurso {ResourceName}.");
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        return await LoadAsync(buffer.ToArray(), ct);
    }

    public async Task<IReadOnlyList<LoadedStudyArea>> LoadAsync(byte[] json, CancellationToken ct)
    {
        if (json.Length > MaxInputBytes)
        {
            throw new InvalidDataException($"El archivo de distritos ocupa {json.Length} bytes; el máximo es {MaxInputBytes}.");
        }

        var districts = Parse(json);
        var sha = Convert.ToHexStringLower(SHA256.HashData(json));
        var now = clock.GetUtcNow();

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var tx = await connection.BeginTransactionAsync(ct);
            foreach (var d in districts)
            {
                await using var command = new NpgsqlCommand(UpsertDistrictSql, connection, tx);
                command.Parameters.Add(new("id", NpgsqlDbType.Varchar) { Value = $"districte-{d.Code}" });
                command.Parameters.Add(new("name", NpgsqlDbType.Varchar) { Value = d.Name });
                command.Parameters.Add(new("wkt", NpgsqlDbType.Text) { Value = d.Wkt });
                AddProvenance(command, sha, now, note: null);
                if (await command.ExecuteNonQueryAsync(ct) != 1)
                {
                    throw new InvalidDataException($"La geometría del distrito {d.Code} ({d.Name}) no es válida.");
                }
            }

            await using (var command = new NpgsqlCommand(UpsertMunicipalitySql, connection, tx))
            {
                command.Parameters.Add(new("sliver", NpgsqlDbType.Double) { Value = SliverSquareMeters });
                AddProvenance(command, sha, now, MunicipalityNote);
                if (await command.ExecuteNonQueryAsync(ct) != 1)
                {
                    throw new InvalidDataException("La unión de los distritos no da un polígono válido.");
                }
            }

            await tx.CommitAsync(ct);
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }

        var loaded = await db.StudyAreas.AsNoTracking()
            .OrderBy(a => a.Kind).ThenBy(a => a.Id)
            .Select(a => new LoadedStudyArea(a.Id, a.Name, a.AreaSquareMeters))
            .ToListAsync(ct);
        logger.LogInformation("Áreas de estudio cargadas: {Count} (sha256 {Sha})", loaded.Count, sha[..12]);
        return loaded;
    }

    private static void AddProvenance(NpgsqlCommand command, string sha, DateTimeOffset now, string? note)
    {
        command.Parameters.Add(new("source", NpgsqlDbType.Varchar) { Value = Source });
        command.Parameters.Add(new("attribution", NpgsqlDbType.Varchar) { Value = Attribution });
        command.Parameters.Add(new("license", NpgsqlDbType.Varchar) { Value = License });
        command.Parameters.Add(new("note", NpgsqlDbType.Varchar) { Value = (object?)note ?? DBNull.Value });
        command.Parameters.Add(new("sha", NpgsqlDbType.Varchar) { Value = sha });
        command.Parameters.Add(new("now", NpgsqlDbType.TimestampTz) { Value = now.ToUniversalTime() });
    }

    /// <summary>Array de distritos con código, nombre y geometría WKT en EPSG:25831.</summary>
    private static List<District> Parse(byte[] json)
    {
        using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 8 });
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("Se esperaba un array de distritos.");
        }

        var districts = new List<District>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var code = el.TryGetProperty("Codi_Districte", out var c) ? c.GetString() : null;
            var name = el.TryGetProperty("nom_districte", out var n) ? n.GetString() : null;
            var wkt = el.TryGetProperty("geometria_etrs89", out var g) ? g.GetString() : null;
            if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, @"^\d{2}$")
                || string.IsNullOrWhiteSpace(name) || wkt is null
                || !(wkt.StartsWith("POLYGON", StringComparison.Ordinal) || wkt.StartsWith("MULTIPOLYGON", StringComparison.Ordinal)))
            {
                throw new InvalidDataException($"Distrito sin código, nombre o geometría válidos: {code ?? "?"}.");
            }

            districts.Add(new District(code, name.Trim(), wkt));
        }

        if (districts.Count != 10 || districts.Select(d => d.Code).Distinct().Count() != 10)
        {
            throw new InvalidDataException($"Se esperaban los 10 distritos de Barcelona; hay {districts.Count}.");
        }

        return districts;
    }
}
