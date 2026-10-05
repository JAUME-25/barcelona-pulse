using System.Globalization;
using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Features.Stations;

public readonly record struct BoundingBox(double MinLon, double MinLat, double MaxLon, double MaxLat);

/// <summary>Validación de parámetros de consulta. Devuelve el error listo para un ValidationProblem.</summary>
public static class QueryParsing
{
    /// <summary>Lado máximo de la caja, en grados. Barcelona ocupa unos 0,2° × 0,15°.</summary>
    public const double MaxBoundingBoxSpan = 1.0;

    public static readonly DateTimeOffset EarliestInstant = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public static bool TryParseBoundingBox(string? text, out BoundingBox? bbox, out string? error)
    {
        bbox = null;
        error = null;
        if (string.IsNullOrWhiteSpace(text))
        {
            return true;
        }

        var parts = text.Split(',');
        var values = new double[4];
        if (parts.Length != 4 || !parts.Select((p, i) =>
                double.TryParse(p, NumberStyles.Float, CultureInfo.InvariantCulture, out values[i]) && double.IsFinite(values[i]))
            .All(ok => ok))
        {
            error = "Formato esperado: minLon,minLat,maxLon,maxLat (grados decimales con punto).";
            return false;
        }

        var box = new BoundingBox(values[0], values[1], values[2], values[3]);
        if (box.MinLon < -180 || box.MaxLon > 180 || box.MinLat < -90 || box.MaxLat > 90)
        {
            error = "Coordenadas fuera de rango: longitud entre -180 y 180, latitud entre -90 y 90.";
            return false;
        }

        if (box.MinLon >= box.MaxLon || box.MinLat >= box.MaxLat)
        {
            error = "El mínimo debe ser menor que el máximo en longitud y en latitud.";
            return false;
        }

        if (box.MaxLon - box.MinLon > MaxBoundingBoxSpan || box.MaxLat - box.MinLat > MaxBoundingBoxSpan)
        {
            error = $"La caja no puede superar {MaxBoundingBoxSpan.ToString(CultureInfo.InvariantCulture)}° de lado.";
            return false;
        }

        bbox = box;
        return true;
    }

    public static bool TryParseInstant(string? text, DateTimeOffset now, out DateTimeOffset? instant, out string? error)
    {
        instant = null;
        error = null;
        if (string.IsNullOrWhiteSpace(text))
        {
            return true;
        }

        if (!Instants.TryParseExplicit(text, out var parsed))
        {
            error = "Instante ISO 8601 con zona explícita, p. ej. 2026-03-10T09:00:00Z o 2026-03-10T10:00:00+01:00.";
            return false;
        }

        if (parsed < EarliestInstant || parsed > now.AddDays(1))
        {
            error = "Instante fuera del rango admitido.";
            return false;
        }

        instant = parsed;
        return true;
    }
}
