using System.ComponentModel;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.History;

public static class TimelineEndpoints
{
    private static readonly TimeSpan DefaultRange = TimeSpan.FromHours(24);

    public static RouteGroupBuilder MapTimelineEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sources/{id}/timeline", GetTimeline)
            .WithTags("History")
            .WithName("GetTimeline")
            .WithSummary("Línea temporal de una fuente: estaciones con dato y totales en cada paso")
            .WithDescription(
                "Aplica en cada paso la misma regla que GET /api/stations: última observación ≤ instante " +
                "dentro de la tolerancia. Los huecos se ven como pasos con menos estaciones con dato. " +
                "Máximo 7 días por petición. Lleva ETag: con If-None-Match responde 304 mientras no " +
                "entren ni salgan datos del rango.")
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);
        return api;
    }

    private static async Task<Results<Ok<TimelineResponse>, StatusCodeHttpResult, ValidationProblem, ProblemHttpResult>> GetTimeline(
        [Description("Identificador de la fuente.")] string id,
        [Description("Inicio ISO 8601 con zona. Sin from ni to: las últimas 24 h con datos de la fuente.")] string? from,
        [Description("Fin ISO 8601 con zona (incluido).")] string? to,
        [Description("Paso en minutos: 5, 10, 15, 30 o 60. Por defecto, 5.")] int? step,
        HttpContext http, PulseDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var errors = new Dictionary<string, string[]>();
        var stepMinutes = step ?? 5;
        if (!TimelineGrid.AllowedStepMinutes.Contains(stepMinutes))
        {
            errors["step"] = [$"Paso admitido: {string.Join(", ", TimelineGrid.AllowedStepMinutes)} minutos."];
        }

        if (!QueryParsing.TryParseInstant(from, now, out var fromValue, out var fromError))
        {
            errors["from"] = [fromError!];
        }

        if (!QueryParsing.TryParseInstant(to, now, out var toValue, out var toError))
        {
            errors["to"] = [toError!];
        }

        if ((fromValue is null) != (toValue is null) && errors.Count == 0)
        {
            errors["from"] = ["from y to van juntos."];
        }
        else if (fromValue is { } f && toValue is { } t)
        {
            if (f >= t)
            {
                errors["from"] = ["from debe ser anterior a to."];
            }
            else if (t - f > TimelineGrid.MaxRange)
            {
                errors["to"] = ["Como máximo 7 días por petición."];
            }
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var source = await db.DataSources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (source is null)
        {
            return StationsEndpoints.SourceNotFound(id);
        }

        var stepSpan = TimeSpan.FromMinutes(stepMinutes);
        DateTimeOffset rangeFrom, rangeTo;
        if (fromValue is { } requestedFrom && toValue is { } requestedTo)
        {
            (rangeFrom, rangeTo) = (requestedFrom, requestedTo);
        }
        else
        {
            rangeTo = await StationQueries.LatestObservationAsync(db, source.Id, ct) ?? now;
            rangeFrom = rangeTo - DefaultRange;
        }

        var (alignedFrom, alignedTo, _) = TimelineGrid.Align(rangeFrom, rangeTo, stepSpan);
        var version = await DataVersion.ForRangeAsync(db, source, alignedFrom, alignedTo, ct);
        if (HttpValidators.ClientHas(http, $"timeline:{version}"))
        {
            return HttpValidators.NotModified();
        }

        var points = await TimelineQuery.GetAsync(db, source, alignedFrom, alignedTo, stepSpan, ct);
        return TypedResults.Ok(new TimelineResponse(
            source.ToRef(), alignedFrom, alignedTo, stepMinutes, (int)source.StalenessTolerance.TotalMinutes, points));
    }
}
