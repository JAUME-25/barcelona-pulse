using System.ComponentModel;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BarcelonaPulse.Api.Features.Stations;

public static class StationsEndpoints
{
    private const string BboxDescription =
        "Opcional. Zona minLon,minLat,maxLon,maxLat en grados WGS84 (máximo 1° de lado).";

    private const string AtDescription =
        "Opcional. Instante ISO 8601 con zona explícita. Sin él: fuente sintética, final de sus datos; " +
        "fuente observada, ahora. La respuesta lo indica en atBasis.";

    public static RouteGroupBuilder MapStationsEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/stations").WithTags("Stations");

        group.MapGet("/", ListStations)
            .WithName("ListStations")
            .WithSummary("Estaciones de una fuente y su estado en un instante")
            .WithDescription(
                "Devuelve la versión vigente de cada estación y su última observación anterior o igual a `at`. " +
                "Fuera de la tolerancia de la fuente el estado es `unknown` y los recuentos son nulos. " +
                "Cada estación lleva la primera y la última vez que la fuente la publicó en lo importado " +
                "(`firstSeenAt`, `lastSeenAt`): con días importados antes de la primera o después de la última, " +
                "la fuente no la listaba en ellos. " +
                "Con `at` (o una fuente sintética) lleva ETag: con If-None-Match responde 304 mientras no " +
                "entren ni salgan datos de la fuente (cualquier día puede cambiar `lastSeenAt`).")
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/{id:long}", GetStation)
            .WithName("GetStation")
            .WithSummary("Una estación, su estado en un instante y sus versiones")
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/{id:long}/pattern", GetStationPattern)
            .WithName("GetStationPattern")
            .WithSummary("Cómo estuvo una estación a cada hora en los días importados")
            .WithDescription(
                "Su estado cada 15 minutos de cada día importado de su fuente, con la misma regla que el mapa, " +
                "contado por hora (de Barcelona) en laborables y en fines de semana. Es lo que pasó, no una " +
                "previsión; los pasos sin dato van en `unknown`, no como cero. Lleva ETag: con If-None-Match " +
                "responde 304 mientras la fuente no cambie.")
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        return api;
    }

    private static async Task<Results<Ok<StationPatternResponse>, StatusCodeHttpResult, ProblemHttpResult>> GetStationPattern(
        [Description("Identificador interno de la estación.")] long id,
        HttpContext http, PulseDbContext db, IMemoryCache cache, CancellationToken ct)
    {
        var station = await db.Stations.AsNoTracking()
            .Include(s => s.Source)
            .FirstOrDefaultAsync(s => s.Id == id, ct);
        if (station is null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
                title: "Estación no encontrada", detail: $"No existe la estación {id}.");
        }

        // El patrón mira todos los días importados: la versión de toda la fuente.
        var version = await DataVersion.ForAllAsync(db, station.Source, ct);
        if (HttpValidators.ClientHas(http, $"pattern:{id}:{version}"))
        {
            return HttpValidators.NotModified();
        }

        try
        {
            return TypedResults.Ok(await StationPattern.GetAsync(db, cache, station, version, ct));
        }
        catch (ComputationBusyException busy)
        {
            return busy.ToProblem(http);
        }
    }

    /// <summary>
    /// Un estado en un instante pedido (o el final de los datos de una fuente sintética) solo
    /// depende de los datos: lleva ETag. «Ahora» cambia con el reloj y no se valida. La versión
    /// es la de toda la fuente, no la del instante: la primera y la última publicación de cada
    /// estación y, en el detalle, sus versiones cambian con cualquier día que entre (ADR 0014).
    /// </summary>
    private static async Task<bool> ClientHasStateAsync(
        HttpContext http, PulseDbContext db, DataSource source, DateTimeOffset instant, InstantBasis basis,
        string what, CancellationToken ct)
    {
        if (basis == InstantBasis.Now)
        {
            return false;
        }

        var version = await DataVersion.ForAllAsync(db, source, ct);
        return HttpValidators.ClientHas(http, $"{what}:{instant:O}:{version}");
    }

    private static async Task<Results<Ok<StationsResponse>, StatusCodeHttpResult, ValidationProblem, ProblemHttpResult>> ListStations(
        [Description("Obligatorio. Identificador de la fuente (ver GET /api/sources).")] string? source,
        [Description(BboxDescription)] string? bbox,
        [Description(AtDescription)] string? at,
        HttpContext http, PulseDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(source) || source.Length > 64)
        {
            errors["source"] = ["Indica la fuente, p. ej. source=demo."];
        }

        if (!QueryParsing.TryParseBoundingBox(bbox, out var box, out var bboxError))
        {
            errors["bbox"] = [bboxError!];
        }

        if (!QueryParsing.TryParseInstant(at, now, out var requested, out var atError))
        {
            errors["at"] = [atError!];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var dataSource = await db.DataSources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == source, ct);
        if (dataSource is null)
        {
            return SourceNotFound(source!);
        }

        var (instant, basis) = await StationQueries.ResolveInstantAsync(db, dataSource, requested, now, ct);
        if (await ClientHasStateAsync(http, db, dataSource, instant, basis, "stations", ct))
        {
            return HttpValidators.NotModified();
        }

        var items = await StationQueries.StatesAtAsync(db, dataSource, instant, box, stationId: null, StationQueries.MaxStations, ct);
        var truncated = items.Count > StationQueries.MaxStations;
        if (truncated)
        {
            items.RemoveAt(items.Count - 1);
        }

        return TypedResults.Ok(new StationsResponse(
            dataSource.ToRef(), instant, basis, (int)dataSource.StalenessTolerance.TotalMinutes,
            items.Count, truncated, items));
    }

    private static async Task<Results<Ok<StationDetailResponse>, StatusCodeHttpResult, ValidationProblem, ProblemHttpResult>> GetStation(
        [Description("Identificador interno de la estación.")] long id,
        [Description(AtDescription)] string? at,
        HttpContext http, PulseDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (!QueryParsing.TryParseInstant(at, now, out var requested, out var atError))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["at"] = [atError!] });
        }

        var station = await db.Stations.AsNoTracking()
            .Include(s => s.Source)
            .Include(s => s.Versions)
            .FirstOrDefaultAsync(s => s.Id == id, ct);
        if (station is null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
                title: "Estación no encontrada", detail: $"No existe la estación {id}.");
        }

        var (instant, basis) = await StationQueries.ResolveInstantAsync(db, station.Source, requested, now, ct);
        if (await ClientHasStateAsync(http, db, station.Source, instant, basis, $"station:{id}", ct))
        {
            return HttpValidators.NotModified();
        }

        var items = await StationQueries.StatesAtAsync(db, station.Source, instant, bbox: null, station.Id, limit: 1, ct);
        var item = items.FirstOrDefault();
        if (item is null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
                title: "Sin versión en ese instante", detail: $"La estación {id} no tiene atributos vigentes en {instant:O}.");
        }

        var versions = station.Versions
            .OrderBy(v => v.ValidFrom ?? DateTimeOffset.MinValue)
            .Select(v => new StationVersionItem(v.Name, v.Address, v.District, v.Neighbourhood, v.Location.X, v.Location.Y, v.Capacity,
                v.Altitude, v.ValidFrom, v.ValidTo, v.FirstSeenAt))
            .ToList();

        return TypedResults.Ok(new StationDetailResponse(
            station.Source.ToRef(), instant, basis, (int)station.Source.StalenessTolerance.TotalMinutes, item, versions));
    }

    internal static ProblemHttpResult SourceNotFound(string source) =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound,
            title: "Fuente no encontrada", detail: $"No existe la fuente '{source}'.");
}
