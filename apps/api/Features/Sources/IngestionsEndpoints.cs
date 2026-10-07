using System.ComponentModel;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Sources;

/// <summary>Las ingestas terminadas de una fuente: lo que entró, lo que se repitió y lo que no entró, y por qué.</summary>
public sealed record IngestionsResponse(SourceRef Source, IReadOnlyList<IngestionItem> Ingestions);

/// <summary>Una ingesta terminada con el periodo que decía cubrir (un día del histórico).</summary>
/// <param name="Id">Identificador de la ejecución.</param>
/// <param name="StartedAt">Cuándo empezó.</param>
/// <param name="FinishedAt">Cuándo acabó.</param>
/// <param name="Status">Cómo acabó: bien, con incidencias (rechazos o conflictos) o fallida.</param>
/// <param name="CoveredFrom">Inicio del periodo que cubre la entrada.</param>
/// <param name="CoveredTo">Fin (excluido) del periodo que cubre la entrada.</param>
/// <param name="Days">Días (hora de Barcelona) de ese periodo.</param>
/// <param name="PurgedAt">Cuándo se quitaron sus días con <c>purge</c>; nulo si siguen.</param>
/// <param name="StationsReceived">Registros de estación leídos.</param>
/// <param name="StationsRejected">Registros de estación rechazados.</param>
/// <param name="StationVersionsCreated">Versiones de estación nuevas.</param>
/// <param name="ObservationsReceived">Observaciones leídas.</param>
/// <param name="ObservationsAccepted">Observaciones nuevas guardadas.</param>
/// <param name="ObservationsDuplicate">Repetidas: ya estaban, con los mismos valores.</param>
/// <param name="ObservationsConflicting">En conflicto: ya estaban, con otros valores; se conservó la primera.</param>
/// <param name="ObservationsRejected">Observaciones rechazadas.</param>
/// <param name="Rejections">Rechazos agrupados por tipo de registro y motivo. Se guardan como máximo 1000 por ingesta: los totales son los recuentos de arriba.</param>
public sealed record IngestionItem(
    long Id,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    IngestionStatus Status,
    DateTimeOffset CoveredFrom,
    DateTimeOffset CoveredTo,
    IReadOnlyList<DateOnly> Days,
    DateTimeOffset? PurgedAt,
    int StationsReceived,
    int StationsRejected,
    int StationVersionsCreated,
    int ObservationsReceived,
    int ObservationsAccepted,
    int ObservationsDuplicate,
    int ObservationsConflicting,
    int ObservationsRejected,
    IReadOnlyList<RejectionGroup> Rejections);

/// <summary>Cuántos registros de un tipo se rechazaron por un motivo.</summary>
/// <param name="RecordKind"><c>station</c>, <c>observation</c> o <c>input</c>.</param>
/// <param name="Reason">Motivo, tal como lo registra la ingesta (<c>outside_service_area</c>, <c>negative_count</c>…).</param>
/// <param name="Count">Registros rechazados por ese motivo.</param>
public sealed record RejectionGroup(string RecordKind, string Reason, int Count);

public static class IngestionsEndpoints
{
    public static RouteGroupBuilder MapIngestionsEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sources/{id}/ingestions", ListIngestions)
            .WithTags("Sources")
            .WithName("ListIngestions")
            .WithSummary("Ingestas terminadas de una fuente: periodo cubierto, recuentos y rechazos por motivo")
            .WithDescription(
                "Solo las que han terminado y dicen qué periodo cubren (un día del histórico), en orden de periodo. " +
                "Las purgadas se conservan con la fecha de la purga. Repetir una importación no duplica: sale como repetidas.")
            .ProducesProblem(StatusCodes.Status404NotFound);
        return api;
    }

    private static async Task<Results<Ok<IngestionsResponse>, ProblemHttpResult>> ListIngestions(
        [Description("Identificador de la fuente.")] string id, PulseDbContext db, CancellationToken ct)
    {
        var source = await db.DataSources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (source is null)
        {
            return StationsEndpoints.SourceNotFound(id);
        }

        var runs = await db.IngestionRuns.AsNoTracking()
            .Where(r => r.SourceId == id && r.Status != IngestionStatus.Running && r.CoveredFrom != null && r.CoveredTo != null)
            .OrderBy(r => r.CoveredFrom).ThenBy(r => r.StartedAt).ThenBy(r => r.Id)
            .ToListAsync(ct);
        var ids = runs.Select(r => r.Id).ToList();
        var rejections = await db.IngestionRejections.AsNoTracking()
            .Where(r => ids.Contains(r.IngestionRunId))
            .GroupBy(r => new { r.IngestionRunId, r.RecordKind, r.Reason })
            .Select(g => new { g.Key.IngestionRunId, g.Key.RecordKind, g.Key.Reason, Count = g.Count() })
            .ToListAsync(ct);
        var byRun = rejections.ToLookup(r => r.IngestionRunId);

        var items = runs.Select(r => new IngestionItem(
            r.Id, r.StartedAt, r.FinishedAt, r.Status, r.CoveredFrom!.Value, r.CoveredTo!.Value,
            LocalDay.DatesIn(r.CoveredFrom.Value, r.CoveredTo.Value).ToList(), r.PurgedAt,
            r.StationsReceived, r.StationsRejected, r.StationVersionsCreated,
            r.ObservationsReceived, r.ObservationsAccepted, r.ObservationsDuplicate, r.ObservationsConflicting, r.ObservationsRejected,
            byRun[r.Id]
                .OrderBy(g => g.RecordKind, StringComparer.Ordinal).ThenByDescending(g => g.Count).ThenBy(g => g.Reason, StringComparer.Ordinal)
                .Select(g => new RejectionGroup(g.RecordKind, g.Reason, g.Count)).ToList())).ToList();

        return TypedResults.Ok(new IngestionsResponse(source.ToRef(), items));
    }
}
