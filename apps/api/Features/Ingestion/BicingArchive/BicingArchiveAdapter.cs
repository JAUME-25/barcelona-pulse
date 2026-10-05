using System.Globalization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Features.Ingestion.BicingArchive;

/// <summary>
/// Histórico mensual de Bicing en Open Data BCN (CC BY 4.0): un .7z de estado y otro de
/// información por mes, con una instantánea de todas las estaciones cada ~5 min.
/// Importa un día natural (hora de Barcelona) y lo traduce al contrato normalizado.
/// Formato comprobado con el archivo de agosto de 2026 (ver docs/data-sources.md).
/// </summary>
public static partial class BicingArchiveAdapter
{
    public const string AdapterName = "bicing-monthly-archive";
    public const string AdapterVersion = "1";

    /// <summary>
    /// Tolerancia: las estaciones informan cada ~6 min (mediana 361 s, p99 375 s en agosto de
    /// 2026). 15 min admite perder un reporte antes de dar el estado por desconocido.
    /// </summary>
    public static readonly SourceDescriptor Source = new(
        Id: "bicing-bcn",
        Kind: SourceKind.Observed,
        Name: "Bicing, histórico del Ajuntament de Barcelona",
        Attribution: "Fuente de los datos: Ayuntamiento de Barcelona. Datos transformados: histórico mensual normalizado.",
        License: "CC BY 4.0",
        Url: "https://opendata-ajuntament.barcelona.cat/data/es/dataset/estat-estacions-bicing",
        StalenessTolerance: TimeSpan.FromMinutes(15));

    internal static readonly string[] StatusColumns =
    [
        "station_id", "num_bikes_available", "num_bikes_available_types.mechanical",
        "num_bikes_available_types.ebike", "num_docks_available", "last_reported", "status",
        "is_installed", "is_renting", "is_returning", "last_updated",
    ];

    internal static readonly string[] InfoColumns =
        ["station_id", "name", "lat", "lon", "address", "cross_street", "capacity", "last_updated"];

    /// <param name="statusArchive">Ruta del .7z de estado.</param>
    /// <param name="infoArchive">Ruta del .7z de información.</param>
    /// <param name="day">Día natural en hora de Barcelona.</param>
    /// <param name="limits">Límites de lectura.</param>
    /// <param name="ct">Cancelación.</param>
    /// <param name="statusName">Nombre publicado del archivo de estado, para el registro (por defecto, el de la ruta).</param>
    /// <param name="infoName">Nombre publicado del archivo de información.</param>
    public static IngestionBatch Read(
        string statusArchive, string infoArchive, DateOnly day, ArchiveLimits limits, CancellationToken ct,
        string? statusName = null, string? infoName = null)
    {
        var window = LocalDay.For(day);
        var rejected = new List<RejectedRecord>();
        var stations = ReadStationChanges(infoArchive, window, rejected, limits, ct);
        var observations = ReadObservations(statusArchive, window, rejected, limits, ct);

        var statusHash = Sha256(statusArchive);
        var infoHash = Sha256(infoArchive);
        var inputRef =
            $"{statusName ?? Path.GetFileName(statusArchive)} (sha256 {statusHash[..12]}) + {infoName ?? Path.GetFileName(infoArchive)} " +
            $"(sha256 {infoHash[..12]}), día {day:yyyy-MM-dd} en {LocalDay.TimeZoneId}";
        var combined = Convert.ToHexStringLower(SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(statusHash + infoHash)));

        return new IngestionBatch(Source, AdapterName, AdapterVersion, inputRef, combined, stations, observations, rejected);
    }

    /// <summary>
    /// El archivo de información repite los atributos de cada estación en cada instantánea.
    /// Aquí se reducen a los momentos en que cambian: cada cambio será una versión.
    /// </summary>
    internal static List<NormalizedStation> ReadStationChanges(
        string archive, LocalDay window, List<RejectedRecord> rejected, ArchiveLimits limits, CancellationToken ct)
    {
        var byStation = new Dictionary<string, List<NormalizedStation>>(StringComparer.Ordinal);

        foreach (var row in ArchiveCsv.ReadRows(archive, InfoColumns, limits, ct))
        {
            if (!TryInstant(row["last_updated"], out var seenAt))
            {
                rejected.Add(new(RecordKinds.Station, $"línea {row.Line}", RejectionReasons.MissingField, "last_updated"));
                continue;
            }

            if (!window.Contains(seenAt)) continue;

            var id = row["station_id"];
            var name = row["name"];
            if (id is null || name is null || !TryDouble(row["lat"], out var lat) || !TryDouble(row["lon"], out var lon))
            {
                rejected.Add(new(RecordKinds.Station, id ?? $"línea {row.Line}", RejectionReasons.MissingField,
                    id is null ? "station_id" : name is null ? "name" : "lat/lon"));
                continue;
            }

            var (district, neighbourhood) = ParseArea(row["cross_street"]);
            var station = new NormalizedStation(id, name, row["address"], lon, lat, TryInt(row["capacity"]), seenAt,
                district, neighbourhood);

            var changes = byStation.TryGetValue(id, out var list) ? list : byStation[id] = [];
            if (changes.Count == 0 || !SameAttributes(changes[^1], station))
            {
                changes.Add(station);
            }
        }

        // Por si el archivo no estuviera en orden: se ordena y se vuelven a quitar repeticiones.
        var result = new List<NormalizedStation>();
        foreach (var changes in byStation.Values)
        {
            NormalizedStation? previous = null;
            foreach (var s in changes.OrderBy(s => s.SeenAt))
            {
                if (previous is null || !SameAttributes(previous, s)) result.Add(s);
                previous = s;
            }
        }

        return result;
    }

    internal static List<NormalizedObservation> ReadObservations(
        string archive, LocalDay window, List<RejectedRecord> rejected, ArchiveLimits limits, CancellationToken ct)
    {
        var result = new List<NormalizedObservation>();

        foreach (var row in ArchiveCsv.ReadRows(archive, StatusColumns, limits, ct))
        {
            if (!TryInstant(row["last_updated"], out var snapshot))
            {
                rejected.Add(new(RecordKinds.Observation, $"línea {row.Line}", RejectionReasons.MissingField, "last_updated"));
                continue;
            }

            // Se toman las instantáneas del día. La observación lleva su propio instante
            // (last_reported), que puede ser anterior si la estación lleva tiempo sin informar.
            if (!window.Contains(snapshot)) continue;

            var id = row["station_id"];
            var reference = $"{id ?? "?"}@{row["last_reported"] ?? "?"}";
            if (id is null)
            {
                rejected.Add(new(RecordKinds.Observation, $"línea {row.Line}", RejectionReasons.MissingField, "station_id"));
                continue;
            }

            if (!TryInstant(row["last_reported"], out var observedAt))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.MissingField, "last_reported"));
                continue;
            }

            if (!TryStatus(row["status"], row["is_installed"], out var status))
            {
                rejected.Add(new(RecordKinds.Observation, reference, RejectionReasons.InvalidValue, $"status={row["status"]}"));
                continue;
            }

            result.Add(new NormalizedObservation(
                id, observedAt, status,
                BikesAvailable: TryInt(row["num_bikes_available"]),
                MechanicalBikesAvailable: TryInt(row["num_bikes_available_types.mechanical"]),
                EbikesAvailable: TryInt(row["num_bikes_available_types.ebike"]),
                DocksAvailable: TryInt(row["num_docks_available"]),
                // El histórico no publica elementos deshabilitados: desconocido, no cero.
                BikesDisabled: null,
                DocksDisabled: null,
                IsRenting: TryFlag(row["is_renting"]),
                IsReturning: TryFlag(row["is_returning"])));
        }

        return result;
    }

    /// <summary>«02-Eixample/05-el Fort Pienc» → («Eixample», «el Fort Pienc»).</summary>
    internal static (string? District, string? Neighbourhood) ParseArea(string? crossStreet)
    {
        if (crossStreet is null) return (null, null);
        var match = AreaPattern().Match(crossStreet);
        return match.Success ? (match.Groups["d"].Value.Trim(), match.Groups["n"].Value.Trim()) : (null, null);
    }

    [GeneratedRegex(@"^\s*\d+\s*-\s*(?<d>[^/]+?)\s*/\s*\d+\s*-\s*(?<n>.+?)\s*$")]
    private static partial Regex AreaPattern();

    /// <summary>
    /// Estados vistos en el histórico: IN_SERVICE, MAINTENANCE y NOT_IN_SERVICE (= no opera).
    /// Cualquier otro se rechaza para que un cambio de esquema no pase desapercibido.
    /// </summary>
    internal static bool TryStatus(string? status, string? installed, out ObservationStatus value)
    {
        value = status switch
        {
            "IN_SERVICE" => installed == "0" ? ObservationStatus.Planned : ObservationStatus.InService,
            "MAINTENANCE" => ObservationStatus.Maintenance,
            "NOT_IN_SERVICE" or "CLOSED" => ObservationStatus.Closed,
            "PLANNED" => ObservationStatus.Planned,
            _ => ObservationStatus.Unknown,
        };
        return value != ObservationStatus.Unknown;
    }

    private static bool SameAttributes(NormalizedStation a, NormalizedStation b) =>
        a with { SeenAt = b.SeenAt } == b;

    /// <summary>Segundos epoch UTC, como publica el archivo.</summary>
    private static bool TryInstant(string? text, out DateTimeOffset value)
    {
        value = default;
        if (!long.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)) return false;
        value = DateTimeOffset.FromUnixTimeSeconds(seconds);
        return true;
    }

    private static bool TryDouble(string? text, out double value) =>
        double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value) && double.IsFinite(value);

    private static int? TryInt(string? text) =>
        int.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value) ? value : null;

    private static bool? TryFlag(string? text) => text switch
    {
        "1" or "TRUE" => true,
        "0" or "FALSE" => false,
        _ => null,
    };

    private static string Sha256(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexStringLower(SHA256.HashData(stream));
    }
}
