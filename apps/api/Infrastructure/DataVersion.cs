using BarcelonaPulse.Api.Features.Sources;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Versión de los datos de una fuente en un rango de instantes (ADR 0014): la última ingesta
/// terminada que toca el rango y cuántas purgas ha habido. Una ingesta de otros días no la
/// cambia; una purga, siempre. Sirve de clave de caché (línea temporal) y de ETag (estado,
/// fotogramas, patrón), que así valen hasta que entren o salgan datos de ese rango.
/// </summary>
public static class DataVersion
{
    /// <summary>
    /// Versión del rango [from, to], los dos incluidos (el último paso, no el primero del
    /// siguiente). Cuentan las observaciones desde <c>from</c> menos la tolerancia de la fuente:
    /// son las que deciden el estado en <c>from</c>. Una ingesta toca el rango si lo hace el
    /// periodo que cubre o el de sus observaciones (el archivo de un día trae a veces las últimas
    /// del anterior). Sin <c>from</c> ni <c>to</c>, todos los datos.
    /// </summary>
    public static async Task<string> ForRangeAsync(
        PulseDbContext db, DataSource source, DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct)
    {
        var runs = db.IngestionRuns.AsNoTracking().Where(r => r.SourceId == source.Id && r.FinishedAt != null);
        if (from is { } f)
        {
            var lower = f - source.StalenessTolerance;
            runs = runs.Where(r =>
                (r.CoveredTo == null && r.PeriodTo == null) || r.CoveredTo >= lower || r.PeriodTo >= lower);
        }

        if (to is { } t)
        {
            runs = runs.Where(r =>
                (r.CoveredFrom == null && r.PeriodFrom == null) || r.CoveredFrom <= t || r.PeriodFrom <= t);
        }

        var lastRun = await runs.MaxAsync(r => (long?)r.Id, ct) ?? 0;
        return $"{source.Id}:{lastRun}:{source.PurgeGeneration}";
    }

    /// <summary>Versión de todos los datos de la fuente (el patrón de una estación mira todos los días).</summary>
    public static Task<string> ForAllAsync(PulseDbContext db, DataSource source, CancellationToken ct) =>
        ForRangeAsync(db, source, null, null, ct);
}
