using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Stations;

/// <summary>Consultas de estaciones en un instante, acotadas por fuente y, opcionalmente, por zona.</summary>
public static class StationQueries
{
    public const int MaxStations = 1000;

    /// <summary>
    /// Instante por defecto: en una fuente sintética, el final de sus datos (la demo nunca se
    /// presenta como «ahora»); en una observada, el momento actual, para que un dato viejo
    /// aparezca como desconocido.
    /// </summary>
    public static async Task<(DateTimeOffset At, InstantBasis Basis)> ResolveInstantAsync(
        PulseDbContext db, DataSource source, DateTimeOffset? requested, DateTimeOffset now, CancellationToken ct)
    {
        if (requested is { } at)
        {
            return (at, InstantBasis.Requested);
        }

        if (source.Kind == SourceKind.Synthetic)
        {
            var latest = await (
                from o in db.StationObservations
                join s in db.Stations on o.StationId equals s.Id
                where s.SourceId == source.Id
                select (DateTimeOffset?)o.ObservedAt).MaxAsync(ct);
            if (latest is { } l)
            {
                return (l, InstantBasis.LatestObservation);
            }
        }

        return (now, InstantBasis.Now);
    }

    /// <summary>
    /// Estaciones con la versión vigente en <paramref name="at"/> y su última observación
    /// con instante ≤ <paramref name="at"/>. Devuelve hasta <paramref name="limit"/> + 1 filas
    /// para poder indicar truncado.
    /// </summary>
    public static async Task<List<StationItem>> StatesAtAsync(
        PulseDbContext db, DataSource source, DateTimeOffset at, BoundingBox? bbox, long? stationId, int limit,
        CancellationToken ct)
    {
        var versions = db.StationVersions.AsNoTracking()
            .Where(v => v.Station.SourceId == source.Id
                        && (v.ValidFrom == null || v.ValidFrom <= at)
                        && (v.ValidTo == null || v.ValidTo > at));

        if (bbox is { } b)
        {
            // ST_Intersects usa el índice GiST de location; incluye los puntos del borde.
            var rectangle = Geo.Rectangle(b.MinLon, b.MinLat, b.MaxLon, b.MaxLat);
            versions = versions.Where(v => v.Location.Intersects(rectangle));
        }

        if (stationId is { } id)
        {
            versions = versions.Where(v => v.StationId == id);
        }

        var rows = await versions
            .OrderBy(v => v.Name).ThenBy(v => v.StationId)
            .Select(v => new
            {
                v.StationId,
                v.Station.SourceStationId,
                v.Name,
                v.Address,
                Longitude = v.Location.X,
                Latitude = v.Location.Y,
                v.Capacity,
                MetadataAssumed = v.ValidFrom == null && v.FirstSeenAt > at,
                Latest = db.StationObservations
                    .Where(o => o.StationId == v.StationId && o.ObservedAt <= at)
                    .OrderByDescending(o => o.ObservedAt)
                    .FirstOrDefault(),
            })
            .Take(limit + 1)
            .ToListAsync(ct);

        return rows.ConvertAll(r => new StationItem(
            r.StationId, r.SourceStationId, r.Name, r.Address, r.Longitude, r.Latitude, r.Capacity, r.MetadataAssumed,
            StationStateRules.Evaluate(r.Latest, at, source.StalenessTolerance)));
    }

    public static SourceRef ToRef(this DataSource s) => new(s.Id, s.Kind, s.Name, s.Attribution, s.License, s.Url);
}
