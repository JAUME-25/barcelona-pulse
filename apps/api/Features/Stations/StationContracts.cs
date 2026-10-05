using BarcelonaPulse.Api.Features.Sources;

namespace BarcelonaPulse.Api.Features.Stations;

// DTOs del contrato HTTP. No exponen entidades ni el esquema de ningún proveedor.

/// <summary>Frescura del dato en el instante consultado.</summary>
public enum Freshness
{
    /// <summary>Hay observación dentro de la tolerancia de la fuente.</summary>
    Current,

    /// <summary>La última observación es anterior a la tolerancia: estado desconocido.</summary>
    Stale,

    /// <summary>No hay ninguna observación anterior al instante.</summary>
    None,
}

/// <summary>Cómo se eligió el instante de la respuesta.</summary>
public enum InstantBasis
{
    /// <summary>El indicado en <c>at</c>.</summary>
    Requested,

    /// <summary>Fuente sintética sin <c>at</c>: el final de sus datos, nunca «ahora».</summary>
    LatestObservation,

    /// <summary>Fuente observada sin <c>at</c>: el momento de la petición.</summary>
    Now,
}

public sealed record SourceRef(
    string Id,
    SourceKind Kind,
    string Name,
    string Attribution,
    string? License,
    string? Url);

/// <summary>
/// Estado en el instante consultado. Si la frescura no es <c>current</c>, el estado es
/// <c>unknown</c> y los recuentos son nulos: falta de dato no es cero.
/// </summary>
public sealed record StationState(
    Freshness Freshness,
    DateTimeOffset? LastObservedAt,
    ObservationStatus Status,
    int? BikesAvailable,
    int? MechanicalBikesAvailable,
    int? EbikesAvailable,
    int? DocksAvailable,
    int? BikesDisabled,
    int? DocksDisabled,
    bool? IsRenting,
    bool? IsReturning,
    IReadOnlyList<string> QualityFlags);

/// <summary>Estación con sus atributos vigentes en el instante consultado.</summary>
/// <param name="Id">Identificador interno, estable dentro de esta base de datos.</param>
/// <param name="SourceStationId">Identificador tal como lo publica la fuente.</param>
/// <param name="Name">Nombre publicado por la fuente.</param>
/// <param name="Address">Dirección, si la fuente la publica.</param>
/// <param name="District">Distrito, si la fuente lo publica.</param>
/// <param name="Neighbourhood">Barrio, si la fuente lo publica.</param>
/// <param name="Longitude">Longitud WGS84.</param>
/// <param name="Latitude">Latitud WGS84.</param>
/// <param name="Capacity">Capacidad publicada; nula si la fuente no la da.</param>
/// <param name="MetadataAssumed">
/// Los atributos se publicaron después del instante consultado y se asumen vigentes
/// también antes (primera versión conocida).
/// </param>
/// <param name="State">Estado en el instante consultado.</param>
public sealed record StationItem(
    long Id,
    string SourceStationId,
    string Name,
    string? Address,
    string? District,
    string? Neighbourhood,
    double Longitude,
    double Latitude,
    int? Capacity,
    bool MetadataAssumed,
    StationState State);

public sealed record StationsResponse(
    SourceRef Source,
    DateTimeOffset At,
    InstantBasis AtBasis,
    int ToleranceMinutes,
    int Count,
    bool Truncated,
    IReadOnlyList<StationItem> Stations);

public sealed record StationVersionItem(
    string Name,
    string? Address,
    string? District,
    string? Neighbourhood,
    double Longitude,
    double Latitude,
    int? Capacity,
    DateTimeOffset? ValidFrom,
    DateTimeOffset? ValidTo,
    DateTimeOffset FirstSeenAt);

public sealed record StationDetailResponse(
    SourceRef Source,
    DateTimeOffset At,
    InstantBasis AtBasis,
    int ToleranceMinutes,
    StationItem Station,
    IReadOnlyList<StationVersionItem> Versions);
