namespace BarcelonaPulse.Api.Features.Stations;

/// <summary>
/// Regla determinista del estado en un instante T (ADR 0005): se toma la última
/// observación con instante ≤ T. Si su antigüedad supera la tolerancia de la fuente
/// (límite incluido como vigente), el estado pasa a desconocido. No se interpola.
/// </summary>
public static class StationStateRules
{
    public static StationState Evaluate(StationObservation? latest, DateTimeOffset at, TimeSpan tolerance)
    {
        if (latest is null)
        {
            return Unknown(Freshness.None, lastObservedAt: null);
        }

        if (latest.ObservedAt > at)
        {
            throw new ArgumentException("La observación es posterior al instante consultado.", nameof(latest));
        }

        if (at - latest.ObservedAt > tolerance)
        {
            return Unknown(Freshness.Stale, latest.ObservedAt);
        }

        return new StationState(
            Freshness.Current,
            latest.ObservedAt,
            latest.Status,
            latest.BikesAvailable,
            latest.MechanicalBikesAvailable,
            latest.EbikesAvailable,
            latest.DocksAvailable,
            latest.BikesDisabled,
            latest.DocksDisabled,
            latest.QualityFlags);
    }

    private static StationState Unknown(Freshness freshness, DateTimeOffset? lastObservedAt) =>
        new(freshness, lastObservedAt, ObservationStatus.Unknown, null, null, null, null, null, null, []);
}
