using System.ComponentModel;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.History;

public static class FramesEndpoints
{
    public static RouteGroupBuilder MapFramesEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sources/{id}/frames", GetFrames)
            .WithTags("History")
            .WithName("GetFrames")
            .WithSummary("Fotogramas: el estado de todas las estaciones en 12 pasos seguidos")
            .WithDescription(
                "Cada paso aplica la misma regla que GET /api/stations?at=…. Con el paso de 5 min, " +
                "una hora por petición: sirve para reproducir sin una petición por paso. Lleva ETag: con " +
                "If-None-Match responde 304 mientras no entren ni salgan datos de esa hora.")
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);
        return api;
    }

    private static async Task<Results<Ok<FramesResponse>, StatusCodeHttpResult, ValidationProblem, ProblemHttpResult>> GetFrames(
        [Description("Identificador de la fuente.")] string id,
        [Description("Primer paso, ISO 8601 con zona. Se alinea hacia atrás a la rejilla del paso.")] string? from,
        [Description("Paso en minutos: 5, 10, 15, 30 o 60. Por defecto, 5.")] int? step,
        HttpContext http, PulseDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var stepMinutes = step ?? 5;
        if (!TimelineGrid.AllowedStepMinutes.Contains(stepMinutes))
        {
            errors["step"] = [$"Paso admitido: {string.Join(", ", TimelineGrid.AllowedStepMinutes)} minutos."];
        }

        if (!QueryParsing.TryParseInstant(from, clock.GetUtcNow(), out var requested, out var fromError))
        {
            errors["from"] = [fromError!];
        }
        else if (requested is null)
        {
            errors["from"] = ["Falta from: el primer paso, ISO 8601 con zona."];
        }

        if (errors.Count > 0 || requested is not { } start)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var source = await db.DataSources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (source is null)
        {
            return StationsEndpoints.SourceNotFound(id);
        }

        var stepSpan = TimeSpan.FromMinutes(stepMinutes);
        var (alignedFrom, _, _) = TimelineGrid.Align(start, start, stepSpan);
        // El último paso de la respuesta, incluido: el siguiente ya es de otra hora.
        var version = await DataVersion.ForRangeAsync(
            db, source, alignedFrom, alignedFrom + stepSpan * (FramesQuery.FramesPerResponse - 1), ct);
        if (HttpValidators.ClientHas(http, $"frames:{version}"))
        {
            return HttpValidators.NotModified();
        }

        return TypedResults.Ok(await FramesQuery.GetAsync(db, source, alignedFrom, stepSpan, ct));
    }
}
