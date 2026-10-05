using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Geometrías en WGS84 (EPSG:4326). Orden siempre longitud, latitud (X, Y), como GeoJSON.
/// Las distancias y superficies en metros no se calculan aquí: requieren EPSG:25831 (ver ADR 0004).
/// </summary>
public static class Geo
{
    public const int Wgs84 = 4326;

    public static readonly GeometryFactory Factory = NtsGeometryServices.Instance.CreateGeometryFactory(Wgs84);

    public static Point Point(double longitude, double latitude) =>
        Factory.CreatePoint(new Coordinate(longitude, latitude));

    public static Polygon Rectangle(double minLon, double minLat, double maxLon, double maxLat) =>
        (Polygon)Factory.ToGeometry(new Envelope(minLon, maxLon, minLat, maxLat));
}
