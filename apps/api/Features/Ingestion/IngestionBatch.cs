using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>
/// Contrato interno normalizado. Cada adaptador traduce el formato de su proveedor a
/// esto; el resto de la aplicación no conoce el esquema de ningún proveedor.
/// </summary>
public sealed record IngestionBatch(
    SourceDescriptor Source,
    string Adapter,
    string AdapterVersion,
    string InputRef,
    string? InputSha256,
    IReadOnlyList<NormalizedStation> Stations,
    IReadOnlyList<NormalizedObservation> Observations,
    IReadOnlyList<RejectedRecord> Rejected);

public sealed record SourceDescriptor(
    string Id,
    SourceKind Kind,
    string Name,
    string Attribution,
    string? License,
    string? Url,
    TimeSpan StalenessTolerance);

/// <summary>Atributos de una estación tal como la fuente los publicó en <see cref="SeenAt"/>.</summary>
public sealed record NormalizedStation(
    string SourceStationId,
    string Name,
    string? Address,
    double Longitude,
    double Latitude,
    int? Capacity,
    DateTimeOffset SeenAt);

/// <summary>Instantes siempre en UTC. Recuentos nulos = no informados.</summary>
public sealed record NormalizedObservation(
    string SourceStationId,
    DateTimeOffset ObservedAt,
    ObservationStatus Status,
    int? BikesAvailable,
    int? MechanicalBikesAvailable,
    int? EbikesAvailable,
    int? DocksAvailable,
    int? BikesDisabled,
    int? DocksDisabled);

public sealed record RejectedRecord(string RecordKind, string RecordRef, string Reason, string? Detail = null);

public static class RecordKinds
{
    public const string Input = "input";
    public const string Station = "station";
    public const string Observation = "observation";
}

/// <summary>Motivos de rechazo. Códigos estables: aparecen en la base de datos y en los informes.</summary>
public static class RejectionReasons
{
    public const string MissingField = "missing_field";
    public const string InvalidValue = "invalid_value";
    public const string AmbiguousTimestamp = "ambiguous_timestamp";
    public const string TimestampInFuture = "timestamp_in_future";
    public const string CoordinatesOutOfRange = "coordinates_out_of_range";
    public const string OutsideServiceArea = "outside_service_area";
    public const string NegativeCount = "negative_count";
    public const string DuplicateInBatch = "duplicate_in_batch";
    public const string UnknownStation = "unknown_station";
    public const string MetadataOlderThanCurrent = "metadata_older_than_current";
}

/// <summary>Marcas de calidad de una observación aceptada. No se corrigen los datos: se señalan.</summary>
public static class QualityFlags
{
    /// <summary>Bicis + anclajes (libres y deshabilitados) superan la capacidad publicada.</summary>
    public const string CountsExceedCapacity = "counts_exceed_capacity";

    /// <summary>Mecánicas + eléctricas no coinciden con el total publicado.</summary>
    public const string BikeTypesMismatch = "bike_types_mismatch";
}
