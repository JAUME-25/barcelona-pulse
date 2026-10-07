using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>
/// Contrato interno normalizado. Cada adaptador traduce el formato de su proveedor a
/// esto; el resto de la aplicación no conoce el esquema de ningún proveedor.
/// </summary>
/// <param name="Source">Fuente a la que pertenece la entrada.</param>
/// <param name="Adapter">Adaptador que la ha leído.</param>
/// <param name="AdapterVersion">Versión del adaptador.</param>
/// <param name="InputRef">Referencia legible a la entrada.</param>
/// <param name="InputSha256">Huella de la entrada, si se conoce.</param>
/// <param name="Stations">Estaciones con sus atributos publicados.</param>
/// <param name="Observations">Observaciones normalizadas.</param>
/// <param name="Rejected">Registros que el adaptador no pudo traducir, con su motivo.</param>
/// <param name="Covers">
/// Periodo [desde, hasta) que dice cubrir la entrada: el día pedido del histórico, el del
/// fixture. De ahí salen los días que se pueden reproducir, y no del mínimo y el máximo de las
/// observaciones, que una estación con un dato viejo estira (ADR 0011).
/// </param>
public sealed record IngestionBatch(
    SourceDescriptor Source,
    string Adapter,
    string AdapterVersion,
    string InputRef,
    string? InputSha256,
    IReadOnlyList<NormalizedStation> Stations,
    IReadOnlyList<NormalizedObservation> Observations,
    IReadOnlyList<RejectedRecord> Rejected,
    CoveredPeriod? Covers = null);

/// <summary>Periodo [desde, hasta) en instantes UTC.</summary>
public sealed record CoveredPeriod(DateTimeOffset From, DateTimeOffset To);

public sealed record SourceDescriptor(
    string Id,
    SourceKind Kind,
    string Name,
    string Attribution,
    string? License,
    string? Url,
    TimeSpan StalenessTolerance);

/// <summary>
/// Atributos de una estación tal como la fuente los publicó en <see cref="SeenAt"/>. La altitud,
/// en metros, solo si la fuente la publica.
/// </summary>
public sealed record NormalizedStation(
    string SourceStationId,
    string Name,
    string? Address,
    double Longitude,
    double Latitude,
    int? Capacity,
    DateTimeOffset SeenAt,
    string? District = null,
    string? Neighbourhood = null,
    double? Altitude = null);

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
    int? DocksDisabled,
    bool? IsRenting = null,
    bool? IsReturning = null);

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
    public const string MetadataInsideKnownPeriod = "metadata_inside_known_period";
}

/// <summary>Marcas de calidad de una observación aceptada. No se corrigen los datos: se señalan.</summary>
public static class QualityFlags
{
    /// <summary>Bicis + anclajes (libres y deshabilitados) superan la capacidad publicada.</summary>
    public const string CountsExceedCapacity = "counts_exceed_capacity";

    /// <summary>Mecánicas + eléctricas no coinciden con el total publicado.</summary>
    public const string BikeTypesMismatch = "bike_types_mismatch";
}
