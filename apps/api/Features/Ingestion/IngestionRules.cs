namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>
/// Validación común a todos los adaptadores. Lo que el adaptador ya ha traducido
/// se comprueba aquí con las mismas reglas, venga de donde venga.
/// </summary>
public static class IngestionRules
{
    /// <summary>
    /// Envolvente generosa del término municipal de Barcelona (WGS84). Una estación fuera
    /// de ella indica coordenadas erróneas o intercambiadas, no una estación lejana.
    /// </summary>
    public static readonly (double MinLon, double MinLat, double MaxLon, double MaxLat) ServiceArea =
        (2.0, 41.28, 2.3, 41.5);

    /// <summary>Margen para relojes de proveedor algo adelantados.</summary>
    public static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(5);

    public static RejectedRecord? CheckStation(NormalizedStation s)
    {
        var reference = s.SourceStationId;
        if (string.IsNullOrWhiteSpace(s.SourceStationId))
        {
            return new(RecordKinds.Station, "(sin id)", RejectionReasons.MissingField, "id");
        }

        if (string.IsNullOrWhiteSpace(s.Name))
        {
            return new(RecordKinds.Station, reference, RejectionReasons.MissingField, "name");
        }

        if (!double.IsFinite(s.Longitude) || !double.IsFinite(s.Latitude)
            || s.Longitude is < -180 or > 180 || s.Latitude is < -90 or > 90)
        {
            return new(RecordKinds.Station, reference, RejectionReasons.CoordinatesOutOfRange,
                $"lon={s.Longitude}, lat={s.Latitude}");
        }

        var (minLon, minLat, maxLon, maxLat) = ServiceArea;
        if (s.Longitude < minLon || s.Longitude > maxLon || s.Latitude < minLat || s.Latitude > maxLat)
        {
            return new(RecordKinds.Station, reference, RejectionReasons.OutsideServiceArea,
                $"lon={s.Longitude}, lat={s.Latitude}");
        }

        if (s.Capacity is < 0)
        {
            return new(RecordKinds.Station, reference, RejectionReasons.NegativeCount, "capacity");
        }

        return null;
    }

    public static RejectedRecord? CheckObservation(NormalizedObservation o, DateTimeOffset now)
    {
        var reference = ObservationRef(o.SourceStationId, o.ObservedAt);
        if (o.ObservedAt > now + FutureTolerance)
        {
            return new(RecordKinds.Observation, reference, RejectionReasons.TimestampInFuture);
        }

        string? negative =
            o.BikesAvailable < 0 ? "bikes" :
            o.MechanicalBikesAvailable < 0 ? "mechanical" :
            o.EbikesAvailable < 0 ? "ebike" :
            o.DocksAvailable < 0 ? "docks" :
            o.BikesDisabled < 0 ? "bikesDisabled" :
            o.DocksDisabled < 0 ? "docksDisabled" : null;

        return negative is null
            ? null
            : new(RecordKinds.Observation, reference, RejectionReasons.NegativeCount, negative);
    }

    /// <summary>
    /// Señala incoherencias sin corregirlas. Que bicis y anclajes no sumen la capacidad
    /// es normal (elementos deshabilitados, recuentos parciales); solo se marca si la superan.
    /// </summary>
    public static string[] FlagsFor(NormalizedObservation o, int? capacity)
    {
        var flags = new List<string>(2);

        if (capacity is { } cap)
        {
            var used = (o.BikesAvailable ?? 0) + (o.DocksAvailable ?? 0) + (o.BikesDisabled ?? 0) + (o.DocksDisabled ?? 0);
            if (used > cap)
            {
                flags.Add(QualityFlags.CountsExceedCapacity);
            }
        }

        if (o is { BikesAvailable: { } total, MechanicalBikesAvailable: { } mechanical, EbikesAvailable: { } ebike }
            && mechanical + ebike != total)
        {
            flags.Add(QualityFlags.BikeTypesMismatch);
        }

        return [.. flags];
    }

    public static string ObservationRef(string sourceStationId, DateTimeOffset observedAt) =>
        $"{sourceStationId}@{observedAt.UtcDateTime:yyyy-MM-ddTHH:mm:ssZ}";
}
