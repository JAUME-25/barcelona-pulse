using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Scenarios;

public static class ScenariosEndpoints
{
    /// <summary>Tamaño máximo de una petición de cobertura: con todos los topes llenos ocupa unos 20 KB.</summary>
    public const long MaxRequestBytes = 64 * 1024;

    public static RouteGroupBuilder MapScenariosEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/study-areas", ListStudyAreas)
            .WithTags("Scenarios")
            .WithName("ListStudyAreas")
            .WithSummary("Áreas de estudio para la cobertura: Barcelona y sus 10 distritos");

        api.MapPost("/scenarios/coverage", ComputeCoverage)
            .WithTags("Scenarios")
            .WithName("ComputeCoverage")
            .WithSummary("Cobertura geométrica de la red real y de un escenario con estaciones hipotéticas")
            .WithDescription(
                "Círculos del radio elegido alrededor de cada estación, unidos y recortados al área de estudio, " +
                "medidos en EPSG:25831. Devuelve el modelo, sus supuestos y los parámetros. No se guarda nada " +
                "y no dice nada de demanda, viajes ni esperas.")
            .ProducesProblem(StatusCodes.Status404NotFound)
            // Un escenario dentro de los topes ocupa unos pocos KB: más es otra cosa.
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes));
        return api;
    }

    private static async Task<Ok<List<StudyAreaItem>>> ListStudyAreas(PulseDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await CoverageQuery.StudyAreaItemsAsync(db, ct));

    private static async Task<Results<Ok<CoverageResponse>, ValidationProblem, ProblemHttpResult>> ComputeCoverage(
        CoverageRequest request, PulseDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var added = request.Added ?? [];
        var moved = request.Moved ?? [];
        var removed = request.Removed ?? [];

        if (request.RadiusMeters is < CoverageQuery.MinRadius or > CoverageQuery.MaxRadius)
        {
            errors["radiusMeters"] = [$"Radio entre {CoverageQuery.MinRadius} y {CoverageQuery.MaxRadius} metros."];
        }

        if (!QueryParsing.TryParseInstant(request.At, clock.GetUtcNow(), out var requestedAt, out var atError))
        {
            errors["at"] = [atError!];
        }

        if (added.Count > CoverageQuery.MaxAdded)
        {
            errors["added"] = [$"Como mucho {CoverageQuery.MaxAdded} estaciones hipotéticas."];
        }
        else if (added.Any(a => !InServiceArea(a.Longitude, a.Latitude)))
        {
            errors["added"] = ["Hay estaciones hipotéticas fuera de la zona de Barcelona."];
        }
        else if (added.Any(a => string.IsNullOrWhiteSpace(a.Id) || a.Id.Length > 40)
            || added.Select(a => a.Id).Distinct(StringComparer.Ordinal).Count() != added.Count)
        {
            errors["added"] = ["Cada estación hipotética necesita una etiqueta propia de hasta 40 caracteres."];
        }

        if (moved.Count > CoverageQuery.MaxMoved)
        {
            errors["moved"] = [$"Como mucho {CoverageQuery.MaxMoved} estaciones movidas."];
        }
        else if (moved.Any(m => !InServiceArea(m.Longitude, m.Latitude)))
        {
            errors["moved"] = ["Hay estaciones movidas fuera de la zona de Barcelona."];
        }
        else if (moved.Select(m => m.Station).Distinct().Count() != moved.Count)
        {
            errors["moved"] = ["Una estación aparece movida más de una vez."];
        }

        // El tamaño, antes que nada: lo que sigue recorre las listas.
        if (removed.Count > CoverageQuery.MaxRemoved)
        {
            errors["removed"] = [$"Como mucho {CoverageQuery.MaxRemoved} estaciones quitadas."];
        }
        else if (removed.Distinct().Count() != removed.Count
            || (moved.Count <= CoverageQuery.MaxMoved && removed.Any(id => moved.Any(m => m.Station == id))))
        {
            errors["removed"] = ["Cada estación se quita una sola vez y no puede estar también movida."];
        }

        var area = await CoverageQuery.StudyAreaItemAsync(db, request.StudyArea, ct);
        if (area is null)
        {
            errors["studyArea"] = [$"No existe el área de estudio '{request.StudyArea}' (ver GET /api/study-areas)."];
        }

        if (errors.Count > 0 || area is null)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var source = await db.DataSources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == request.Source, ct);
        if (source is null)
        {
            return StationsEndpoints.SourceNotFound(request.Source);
        }

        var (at, basis) = await StationQueries.ResolveInstantAsync(db, source, requestedAt, clock.GetUtcNow(), ct);

        // Solo se mueven o quitan estaciones que están en la red base de ese instante.
        var baseIds = await CoverageQuery.BaseStationIdsAsync(db, source.Id, at, ct);
        var unknownErrors = new Dictionary<string, string[]>();
        var changed = new (string Field, IEnumerable<long> Ids)[] { ("moved", moved.Select(m => m.Station)), ("removed", removed) };
        foreach (var (field, ids) in changed)
        {
            var unknown = ids.Where(id => !baseIds.Contains(id)).Distinct().ToList();
            if (unknown.Count > 0)
            {
                unknownErrors[field] = [$"Estaciones que no están en la red base en ese instante: {string.Join(", ", unknown.Take(10))}."];
            }
        }

        if (unknownErrors.Count > 0)
        {
            return TypedResults.ValidationProblem(unknownErrors);
        }

        return TypedResults.Ok(await CoverageQuery.ComputeAsync(
            db, source, area, at, basis, request.RadiusMeters, added, moved, removed, ct));
    }

    private static bool InServiceArea(double longitude, double latitude) =>
        double.IsFinite(longitude) && double.IsFinite(latitude)
        && longitude >= IngestionRules.ServiceArea.MinLon && longitude <= IngestionRules.ServiceArea.MaxLon
        && latitude >= IngestionRules.ServiceArea.MinLat && latitude <= IngestionRules.ServiceArea.MaxLat;
}
