using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;

namespace BarcelonaPulse.Api.Features.Ingestion.BicingLive;

/// <summary>
/// Feed de estado y de información de las estaciones de Bicing en Open Data BCN (dos recursos
/// JSON con token, CC BY 4.0): una instantánea de toda la red cada ~5 minutos, al estilo GBFS
/// 1.1. Es la misma fuente que el histórico mensual, que se construye con estas mismas
/// instantáneas: misma clave (estación y <c>last_reported</c>), así que lo que entra en directo
/// será repetido, no duplicado, cuando llegue el archivo del mes. Formato comprobado el
/// 8-10-2026 con un token válido (ver docs/data-sources.md).
/// </summary>
public static class BicingLiveAdapter
{
    public const string AdapterName = "bicing-live-feed";
    public const string AdapterVersion = "1";

    /// <summary>Un archivo del feed pesa unos 150–250 KB; más de esto no es el feed.</summary>
    public const long MaxBytes = 16L * 1024 * 1024;

    /// <summary>
    /// Lo que cubre una instantánea: el paso de cinco minutos en que cae su <c>last_updated</c>,
    /// como las instantáneas del histórico cubren su día entre todas (ADR 0011).
    /// </summary>
    public static readonly TimeSpan Step = TimeSpan.FromMinutes(5);

    public static IngestionBatch ReadFiles(
        string statusPath, string infoPath, CancellationToken ct, string? statusName = null, string? infoName = null)
    {
        var statusBytes = ReadAllBytes(statusPath);
        var infoBytes = ReadAllBytes(infoPath);
        ct.ThrowIfCancellationRequested();
        var statusHash = Convert.ToHexStringLower(SHA256.HashData(statusBytes));
        var infoHash = Convert.ToHexStringLower(SHA256.HashData(infoBytes));
        var combined = Convert.ToHexStringLower(SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(statusHash + infoHash)));
        var inputRef =
            $"{statusName ?? Path.GetFileName(statusPath)} (sha256 {statusHash[..12]}) + " +
            $"{infoName ?? Path.GetFileName(infoPath)} (sha256 {infoHash[..12]})";
        return Read(statusBytes, infoBytes, inputRef, combined);
    }

    /// <summary>Traduce los dos documentos al contrato normalizado.</summary>
    /// <exception cref="InvalidDataException">Si alguno no tiene la forma del feed.</exception>
    public static IngestionBatch Read(ReadOnlyMemory<byte> statusJson, ReadOnlyMemory<byte> infoJson, string inputRef, string? sha256)
    {
        using var status = Parse(statusJson, "estado");
        using var info = Parse(infoJson, "información");
        var snapshotAt = LastUpdated(status.RootElement, "estado");
        var infoAt = LastUpdated(info.RootElement, "información");

        var rejected = new List<RejectedRecord>();
        var notPublic = new HashSet<string>(StringComparer.Ordinal);
        var stations = ReadStations(info.RootElement, infoAt, rejected, notPublic);
        var observations = ReadObservations(status.RootElement, rejected, notPublic);

        var (from, _, _) = TimelineGrid.Align(snapshotAt, snapshotAt, Step);
        return new IngestionBatch(
            BicingArchiveAdapter.Source, AdapterName, AdapterVersion,
            $"{inputRef}, instantánea {snapshotAt:yyyy-MM-dd'T'HH:mm:ssK}", sha256,
            stations, observations, rejected, new CoveredPeriod(from, from + Step));
    }

    private static List<NormalizedStation> ReadStations(
        JsonElement root, DateTimeOffset seenAt, List<RejectedRecord> rejected, ISet<string> notPublic)
    {
        var result = new List<NormalizedStation>();
        var line = 0;
        foreach (var element in Stations(root, "información"))
        {
            line++;
            var id = Id(element);
            var name = Text(element, "name");
            var lat = Number(element, "lat");
            var lon = Number(element, "lon");
            if (id is null || name is null || lat is null || lon is null)
            {
                rejected.Add(new(RecordKinds.Station, id ?? $"estación {line}", RejectionReasons.MissingField,
                    id is null ? "station_id" : name is null ? "name" : "lat/lon"));
                continue;
            }

            // La estación de pruebas del operador no es pública: ni ella ni sus observaciones.
            if (BicingArchiveAdapter.IsOperatorTestStation(name))
            {
                notPublic.Add(id);
                continue;
            }

            if (!TryCount(element, "capacity", out var capacity))
            {
                rejected.Add(new(RecordKinds.Station, id, RejectionReasons.InvalidValue, $"capacity={Raw(element, "capacity")}"));
                continue;
            }

            var (district, neighbourhood) = BicingArchiveAdapter.ParseArea(Text(element, "cross_street"));
            // La altitud es secundaria: si falta o no se entiende, la estación entra sin ella.
            result.Add(new NormalizedStation(id, name, Text(element, "address"), lon.Value, lat.Value, capacity, seenAt,
                district, neighbourhood, Number(element, "altitude")));
        }

        return result;
    }

    private static List<NormalizedObservation> ReadObservations(
        JsonElement root, List<RejectedRecord> rejected, IReadOnlySet<string> notPublic)
    {
        var result = new List<NormalizedObservation>();
        var line = 0;
        foreach (var element in Stations(root, "estado"))
        {
            line++;
            var id = Id(element);
            if (id is null)
            {
                rejected.Add(new(RecordKinds.Observation, $"estación {line}", RejectionReasons.MissingField, "station_id"));
                continue;
            }

            if (notPublic.Contains(id)) continue;

            var reference = $"{id}@{Raw(element, "last_reported") ?? "?"}";
            if (!BicingArchiveAdapter.TryInstant(Raw(element, "last_reported"), out var observedAt))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.InvalidValue,
                    $"last_reported={Raw(element, "last_reported") ?? "ausente"}"));
                continue;
            }

            if (!BicingArchiveAdapter.TryStatus(Text(element, "status"), FlagText(element, "is_installed"), out var status))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.InvalidValue, $"status={Text(element, "status")}"));
                continue;
            }

            // Nulo o ausente es desconocido; un valor que no se entiende se rechaza, no se calla.
            string? invalid = null;
            int? Count(JsonElement e, string property)
            {
                if (TryCount(e, property, out var value)) return value;
                invalid ??= $"{property}={Raw(e, property)}";
                return null;
            }

            bool? Flag(string property)
            {
                if (TryFlag(element, property, out var value)) return value;
                invalid ??= $"{property}={Raw(element, property)}";
                return null;
            }

            var types = element.TryGetProperty("num_bikes_available_types", out var t) && t.ValueKind == JsonValueKind.Object
                ? t
                : default;
            var observation = new NormalizedObservation(
                id, observedAt, status,
                BikesAvailable: Count(element, "num_bikes_available"),
                MechanicalBikesAvailable: types.ValueKind == JsonValueKind.Object ? Count(types, "mechanical") : null,
                EbikesAvailable: types.ValueKind == JsonValueKind.Object ? Count(types, "ebike") : null,
                DocksAvailable: Count(element, "num_docks_available"),
                // El feed no publica elementos deshabilitados: desconocido, no cero.
                BikesDisabled: null,
                DocksDisabled: null,
                IsRenting: Flag("is_renting"),
                IsReturning: Flag("is_returning"));
            if (invalid is not null)
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.InvalidValue, invalid));
                continue;
            }

            result.Add(observation);
        }

        return result;
    }

    private static byte[] ReadAllBytes(string path)
    {
        var length = new FileInfo(path).Length;
        if (length > MaxBytes)
        {
            throw new InvalidDataException($"{Path.GetFileName(path)} pesa {length} bytes; el feed no pasa de {MaxBytes}.");
        }

        return File.ReadAllBytes(path);
    }

    private static JsonDocument Parse(ReadOnlyMemory<byte> json, string what)
    {
        if (json.Length > MaxBytes)
        {
            throw new InvalidDataException($"El documento de {what} pesa {json.Length} bytes; el feed no pasa de {MaxBytes}.");
        }

        try
        {
            var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                document.Dispose();
                throw new InvalidDataException($"El documento de {what} no es un objeto JSON.");
            }

            return document;
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException($"El documento de {what} no es JSON válido: {ex.Message}", ex);
        }
    }

    /// <summary><c>last_updated</c> del documento, en segundos epoch, como lo publica el feed.</summary>
    private static DateTimeOffset LastUpdated(JsonElement root, string what)
    {
        if (!BicingArchiveAdapter.TryInstant(Raw(root, "last_updated"), out var value))
        {
            throw new InvalidDataException($"El documento de {what} no trae un last_updated válido (segundos epoch).");
        }

        return value;
    }

    private static JsonElement.ArrayEnumerator Stations(JsonElement root, string what)
    {
        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object
            || !data.TryGetProperty("stations", out var stations) || stations.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException($"El documento de {what} no trae data.stations.");
        }

        return stations.EnumerateArray();
    }

    /// <summary>El identificador tal como lo publica la fuente: un número en el feed, texto en el histórico.</summary>
    private static string? Id(JsonElement element)
    {
        if (!element.TryGetProperty("station_id", out var id)) return null;
        return id.ValueKind switch
        {
            JsonValueKind.Number => id.TryGetInt64(out var n) ? n.ToString(CultureInfo.InvariantCulture) : id.GetRawText(),
            JsonValueKind.String => string.IsNullOrWhiteSpace(id.GetString()) ? null : id.GetString()!.Trim(),
            _ => null,
        };
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(value.GetString())
            ? value.GetString()!.Trim()
            : null;

    private static double? Number(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out var number) && double.IsFinite(number)
            ? number
            : null;

    /// <summary>El valor tal como viene, para el motivo de un rechazo; nulo si falta o es null.</summary>
    private static string? Raw(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ValueKind == JsonValueKind.String ? value.GetString() : value.GetRawText()
            : null;

    /// <summary>Un recuento: entero (negativo lo rechaza la regla común), nulo si falta o es null.</summary>
    private static bool TryCount(JsonElement element, string property, out int? value)
    {
        value = null;
        if (!element.TryGetProperty(property, out var raw) || raw.ValueKind == JsonValueKind.Null) return true;
        if (raw.ValueKind == JsonValueKind.Number && raw.TryGetInt32(out var number))
        {
            value = number;
            return true;
        }

        return false;
    }

    /// <summary>Un indicador: 0/1 como número o booleano; nulo si falta o es null.</summary>
    private static bool TryFlag(JsonElement element, string property, out bool? value)
    {
        value = null;
        if (!element.TryGetProperty(property, out var raw) || raw.ValueKind == JsonValueKind.Null) return true;
        switch (raw.ValueKind)
        {
            case JsonValueKind.True:
                value = true;
                return true;
            case JsonValueKind.False:
                value = false;
                return true;
            case JsonValueKind.Number when raw.TryGetInt32(out var n) && n is 0 or 1:
                value = n == 1;
                return true;
            default:
                return false;
        }
    }

    /// <summary>«0» o «1» para <see cref="BicingArchiveAdapter.TryStatus"/>, que lee el texto del histórico.</summary>
    private static string? FlagText(JsonElement element, string property) =>
        TryFlag(element, property, out var value) && value is { } flag ? (flag ? "1" : "0") : Raw(element, property);
}
