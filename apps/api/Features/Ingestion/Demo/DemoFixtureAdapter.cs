using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Features.Ingestion.Demo;

/// <summary>
/// Traduce el fixture sintético (formato propio, ver scripts/generate-demo-fixture.mjs)
/// al contrato normalizado. Siempre declara la fuente como sintética.
/// </summary>
public static class DemoFixtureAdapter
{
    public const string AdapterName = "demo-fixture";
    public const string AdapterVersion = "1";
    public const string EmbeddedResourceName = "BarcelonaPulse.Api.demo-fixture.v1.json";
    internal const int MaxInputBytes = 5 * 1024 * 1024;

    private const string ExpectedFormat = "barcelona-pulse/demo-fixture";
    private const int ExpectedFormatVersion = 1;

    public static IngestionBatch LoadEmbedded()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(EmbeddedResourceName)
            ?? throw new InvalidOperationException($"No se encuentra el recurso {EmbeddedResourceName}.");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return Parse(buffer.ToArray(), $"embedded:{EmbeddedResourceName}");
    }

    public static IngestionBatch Parse(byte[] json, string inputRef)
    {
        if (json.Length > MaxInputBytes)
        {
            throw new InvalidDataException($"El fixture ocupa {json.Length} bytes; el máximo es {MaxInputBytes}.");
        }

        using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 16 });
        var root = doc.RootElement;

        if (GetString(root, "format") != ExpectedFormat || GetInt(root, "formatVersion") != ExpectedFormatVersion)
        {
            throw new InvalidDataException($"Formato no reconocido: se esperaba {ExpectedFormat} v{ExpectedFormatVersion}.");
        }

        var sourceEl = Required(root, "source");
        var source = new SourceDescriptor(
            Id: GetString(sourceEl, "id") ?? throw new InvalidDataException("Falta source.id."),
            Kind: SourceKind.Synthetic,
            Name: GetString(sourceEl, "name") ?? "Demo sintética",
            Attribution: GetString(sourceEl, "attribution") ?? "Datos sintéticos",
            License: null,
            Url: null,
            StalenessTolerance: TimeSpan.FromMinutes(GetInt(sourceEl, "stalenessToleranceMinutes") ?? 30));

        var rejected = new List<RejectedRecord>();

        if (!Instants.TryParseExplicit(GetString(root, "stationsSeenAt"), out var stationsSeenAt))
        {
            throw new InvalidDataException("stationsSeenAt falta o no es un instante ISO 8601 con zona.");
        }

        var stations = new List<NormalizedStation>();
        var index = 0;
        foreach (var el in Required(root, "stations").EnumerateArray())
        {
            index++;
            var id = GetString(el, "id");
            var name = GetString(el, "name");
            var lat = GetDouble(el, "lat");
            var lon = GetDouble(el, "lon");
            if (id is null || name is null || lat is null || lon is null)
            {
                rejected.Add(new(RecordKinds.Station, id ?? $"#{index}", RejectionReasons.MissingField,
                    id is null ? "id" : name is null ? "name" : "lat/lon"));
                continue;
            }

            stations.Add(new(id, name, GetString(el, "address"), lon.Value, lat.Value, GetInt(el, "capacity"), stationsSeenAt));
        }

        var observations = new List<NormalizedObservation>();
        index = 0;
        foreach (var el in Required(root, "observations").EnumerateArray())
        {
            index++;
            var stationId = GetString(el, "station");
            var atText = GetString(el, "at");
            var reference = $"{stationId ?? "?"}@{atText ?? "?"}";
            if (stationId is null || atText is null)
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.MissingField,
                    stationId is null ? "station" : "at"));
                continue;
            }

            if (!Instants.TryParseExplicit(atText, out var observedAt))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.AmbiguousTimestamp, atText));
                continue;
            }

            var statusText = GetString(el, "status");
            var status = ObservationStatus.Unknown;
            if (statusText is not null && !SnakeCaseEnum<ObservationStatus>.TryParse(statusText, out status))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.InvalidValue, $"status={statusText}"));
                continue;
            }

            var mechanical = GetInt(el, "mechanical");
            var ebike = GetInt(el, "ebike");
            var bikes = GetInt(el, "bikes") ?? (mechanical is { } m && ebike is { } e ? m + e : null);

            observations.Add(new(
                stationId, observedAt, status, bikes, mechanical, ebike,
                GetInt(el, "docks"), GetInt(el, "bikesDisabled"), GetInt(el, "docksDisabled")));
        }

        // El fixture no declara periodo: cubre de su primera a su última observación.
        CoveredPeriod? covers = observations.Count == 0 ? null : new(
            observations.Min(o => o.ObservedAt), observations.Max(o => o.ObservedAt));
        if (covers is { } c && c.From >= c.To) covers = null;

        return new IngestionBatch(source, AdapterName, AdapterVersion, inputRef,
            Convert.ToHexStringLower(SHA256.HashData(json)), stations, observations, rejected, covers);
    }

    private static JsonElement Required(JsonElement el, string name) =>
        el.TryGetProperty(name, out var value) ? value : throw new InvalidDataException($"Falta '{name}'.");

    private static string? GetString(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static double? GetDouble(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    private static int? GetInt(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : null;
}
