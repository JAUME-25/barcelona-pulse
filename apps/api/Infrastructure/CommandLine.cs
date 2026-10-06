using System.Globalization;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using BarcelonaPulse.Api.Features.Scenarios;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Punto de entrada controlado para operaciones que no se exponen por HTTP.
///   migrate                         aplica las migraciones pendientes
///   ingest demo                     importa el fixture sintético (idempotente)
///   ingest bicing-archive --day D   importa un día del histórico de Bicing (idempotente)
///   ingest bicing-archive --from A --to B   importa un periodo, un día por ingesta
///   purge FUENTE --day D [--yes]    quita días de una fuente (sin --yes, solo cuenta)
/// </summary>
public static class CommandLine
{
    private static readonly string[] Commands = ["migrate", "ingest", "purge"];

    /// <summary>Primer mes publicado del histórico de Bicing nuevo.</summary>
    private static readonly DateOnly FirstArchiveDay = new(2019, 3, 1);

    private static readonly TimeSpan ArchiveTimeout = TimeSpan.FromMinutes(15);

    private const string Usage = """
        Uso:
          migrate
              Aplica las migraciones pendientes.
          ingest demo
              Importa los datos sintéticos de demostración. Repetirlo no duplica nada.
          ingest study-areas
              Carga las áreas de estudio de la cobertura (Barcelona y sus 10 distritos) desde el
              archivo oficial del Ajuntament que va dentro de la API. Repetirlo deja lo mismo.
          ingest bicing-archive (--day AAAA-MM-DD | --from AAAA-MM-DD --to AAAA-MM-DD)
                                [--status-file RUTA --info-file RUTA]
              Importa días naturales (hora de Barcelona) del histórico mensual de Bicing del
              Ajuntament, hasta 31 por comando. Sin rutas, descarga los dos .7z de cada mes.
              Repetirlo no duplica nada.
          purge FUENTE (--day AAAA-MM-DD | --from AAAA-MM-DD --to AAAA-MM-DD) [--yes]
              Quita días enteros (hora de Barcelona) de una fuente, hasta 31 por comando: sus
              observaciones y la posibilidad de reproducirlos. Sin --yes solo dice qué borraría.
              Volver a importar esos días los recupera.
        """;

    public static bool IsCommand(string[] args) => args.Length > 0 && Commands.Contains(args[0]);

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        await using var scope = services.CreateAsyncScope();
        try
        {
            return await RunCommandAsync(scope.ServiceProvider, args, cts.Token);
        }
        catch (ArgumentException ex)
        {
            await Console.Error.WriteLineAsync($"{ex.Message}\n\n{Usage}");
            return 2;
        }
        catch (Exception ex)
        {
            // El detalle ya está en el log y, si es una ingesta, en ingestion_runs.error.
            await Console.Error.WriteLineAsync($"Error: {ex.GetType().Name}: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> RunCommandAsync(IServiceProvider sp, string[] args, CancellationToken ct)
    {
        switch (args)
        {
            case ["migrate"]:
                {
                    var db = sp.GetRequiredService<PulseDbContext>();
                    // Sin tabla de historial, todas están pendientes (y consultarla registraría un error).
                    var historyExists = await db.GetService<IHistoryRepository>().ExistsAsync(ct);
                    var pending = historyExists
                        ? (await db.Database.GetPendingMigrationsAsync(ct)).ToList()
                        : db.Database.GetMigrations().ToList();
                    await db.Database.MigrateAsync(ct);
                    Console.WriteLine(pending.Count == 0
                        ? "Base de datos al día: ninguna migración pendiente."
                        : $"Migraciones aplicadas: {string.Join(", ", pending)}");
                    return 0;
                }

            case ["ingest", "demo"]:
                {
                    var ingestor = sp.GetRequiredService<StationIngestor>();
                    var run = await ingestor.IngestAsync(DemoFixtureAdapter.LoadEmbedded(), trigger: "cli", ct);
                    PrintSummary(run);
                    return 0;
                }

            case ["ingest", "study-areas"]:
                {
                    var loader = sp.GetRequiredService<StudyAreaLoader>();
                    var areas = await loader.LoadEmbeddedAsync(ct);
                    foreach (var area in areas)
                    {
                        Console.WriteLine($"  {area.Id,-14} {area.Name,-22} {area.AreaSquareMeters / 1e6,8:0.000} km²");
                    }

                    Console.WriteLine($"Áreas de estudio: {areas.Count}. Fuente de los datos: Ayuntamiento de Barcelona (CC BY 4.0).");
                    return 0;
                }

            case ["ingest", "bicing-archive", .. var options]:
                {
                    var runs = await IngestBicingArchiveAsync(sp, ParseOptions(options), ct);
                    if (runs.Count > 1)
                    {
                        Console.WriteLine($"Periodo: {runs.Count} días, {runs.Sum(r => r.ObservationsAccepted)} observaciones nuevas, " +
                            $"{runs.Sum(r => r.ObservationsDuplicate)} ya existentes, {runs.Sum(r => r.ObservationsConflicting)} en conflicto, " +
                            $"{runs.Sum(r => r.ObservationsRejected)} rechazadas.");
                    }

                    return 0;
                }

            case ["purge", var sourceId, .. var options] when !sourceId.StartsWith("--", StringComparison.Ordinal):
                {
                    var apply = options.Contains("--yes");
                    var (from, to) = ParsePeriod(ParseOptions([.. options.Where(o => o != "--yes")]));
                    var purger = sp.GetRequiredService<ObservationPurger>();
                    var result = await purger.PurgeAsync(sourceId, from, to, apply, ct);
                    Console.WriteLine(result.Applied
                        ? $"Quitados de '{sourceId}' los días {from:yyyy-MM-dd} a {to:yyyy-MM-dd} (hora de Barcelona): " +
                          $"{result.Observations} observaciones borradas y {result.Ingestions} ingestas marcadas."
                        : $"Sin --yes no se borra nada. Se borrarían {result.Observations} observaciones de '{sourceId}' " +
                          $"entre el {from:yyyy-MM-dd} y el {to:yyyy-MM-dd} (hora de Barcelona), y {result.Ingestions} " +
                          "ingestas dejarían de poderse reproducir. Repite con --yes para hacerlo.");
                    return 0;
                }

            default:
                await Console.Error.WriteLineAsync(Usage);
                return 2;
        }
    }

    private sealed record MonthFiles(string Status, string Info, string? StatusName, string? InfoName);

    /// <summary>
    /// Un día (--day) o un periodo (--from/--to, máximo <see cref="MaxDaysPerCommand"/> días).
    /// Cada día es una ingesta propia: si uno falla, los anteriores quedan guardados y repetir
    /// el comando no duplica nada. Los .7z de cada mes se descargan una sola vez.
    /// </summary>
    private static async Task<List<IngestionRun>> IngestBicingArchiveAsync(
        IServiceProvider sp, Dictionary<string, string> options, CancellationToken ct)
    {
        var (from, to) = ParsePeriod(options);
        var days = to.DayNumber - from.DayNumber + 1;

        options.TryGetValue("status-file", out var statusFile);
        options.TryGetValue("info-file", out var infoFile);
        if ((statusFile is null) != (infoFile is null))
        {
            throw new ArgumentException("--status-file e --info-file van juntos.");
        }

        if (statusFile is not null && (from.Year != to.Year || from.Month != to.Month))
        {
            throw new ArgumentException("Con archivos locales, el periodo debe estar dentro de un mismo mes.");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ArchiveTimeout + TimeSpan.FromMinutes(2 * days));
        var limits = new ArchiveLimits();
        var downloaded = new List<string>();
        var months = new Dictionary<DateOnly, MonthFiles>();
        var runs = new List<IngestionRun>();
        try
        {
            for (var day = from; day <= to; day = day.AddDays(1))
            {
                var month = new DateOnly(day.Year, day.Month, 1);
                if (!months.TryGetValue(month, out var files))
                {
                    files = statusFile is not null && infoFile is not null
                        ? new MonthFiles(statusFile, infoFile, null, null)
                        : await DownloadMonthAsync(sp, month, limits, downloaded, timeout.Token);
                    months[month] = files;
                }

                Console.WriteLine($"Leyendo el día {day:yyyy-MM-dd} ({LocalDay.TimeZoneId})…");
                var batch = BicingArchiveAdapter.Read(
                    files.Status, files.Info, day, limits, timeout.Token, files.StatusName, files.InfoName);

                // Un contexto de datos por día: la memoria no crece con el periodo.
                await using var scope = sp.GetRequiredService<IServiceScopeFactory>().CreateAsyncScope();
                var ingestor = scope.ServiceProvider.GetRequiredService<StationIngestor>();
                var run = await ingestor.IngestAsync(batch, trigger: "cli", timeout.Token);
                PrintSummary(run);
                runs.Add(run);
            }

            return runs;
        }
        finally
        {
            foreach (var path in downloaded) File.Delete(path);
        }
    }

    private static async Task<MonthFiles> DownloadMonthAsync(
        IServiceProvider sp, DateOnly month, ArchiveLimits limits, List<string> downloaded, CancellationToken ct)
    {
        var downloader = sp.GetRequiredService<BicingArchiveDownloader>();
        var paths = new List<string>();
        foreach (var kind in new[] { BicingArchiveKind.Status, BicingArchiveKind.Info })
        {
            var url = BicingArchiveDownloader.UrlFor(month, kind);
            Console.WriteLine($"Descargando {url}");
            var path = await downloader.DownloadAsync(url, limits.MaxArchiveBytes, ct);
            downloaded.Add(path);
            paths.Add(path);
        }

        return new MonthFiles(
            paths[0], paths[1],
            Path.GetFileName(BicingArchiveDownloader.UrlFor(month, BicingArchiveKind.Status).LocalPath),
            Path.GetFileName(BicingArchiveDownloader.UrlFor(month, BicingArchiveKind.Info).LocalPath));
    }

    internal const int MaxDaysPerCommand = 31;

    internal static (DateOnly From, DateOnly To) ParsePeriod(Dictionary<string, string> options)
    {
        static DateOnly Parse(Dictionary<string, string> options, string name) =>
            options.TryGetValue(name, out var text)
            && DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var value)
                ? value
                : throw new ArgumentException($"Falta --{name} AAAA-MM-DD.");

        DateOnly from, to;
        if (options.ContainsKey("day"))
        {
            if (options.ContainsKey("from") || options.ContainsKey("to"))
            {
                throw new ArgumentException("Usa --day o --from/--to, no los dos.");
            }

            from = to = Parse(options, "day");
        }
        else
        {
            from = Parse(options, "from");
            to = Parse(options, "to");
        }

        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        if (from > to)
        {
            throw new ArgumentException("--from debe ser anterior o igual a --to.");
        }

        if (from < FirstArchiveDay || to > yesterday)
        {
            throw new ArgumentException($"Las fechas deben estar entre {FirstArchiveDay:yyyy-MM-dd} y {yesterday:yyyy-MM-dd}.");
        }

        if (to.DayNumber - from.DayNumber + 1 > MaxDaysPerCommand)
        {
            throw new ArgumentException($"Como máximo {MaxDaysPerCommand} días por comando.");
        }

        return (from, to);
    }

    private static Dictionary<string, string> ParseOptions(string[] options)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 0; i < options.Length; i++)
        {
            if (!options[i].StartsWith("--", StringComparison.Ordinal) || i + 1 >= options.Length)
            {
                throw new ArgumentException($"Opción no válida: {options[i]}");
            }

            result[options[i][2..]] = options[++i];
        }

        return result;
    }

    private static void PrintSummary(IngestionRun run) => Console.WriteLine($"""
        Ingesta {run.Id} ({run.Adapter} v{run.AdapterVersion}) de '{run.SourceId}': {SnakeCaseEnum<IngestionStatus>.Name(run.Status)}
          Entrada:       {run.InputRef}
          Periodo:       {run.PeriodFrom:O} → {run.PeriodTo:O}
          Estaciones:    {run.StationsReceived} recibidas, {run.StationsRejected} rechazadas, {run.StationVersionsCreated} versiones nuevas
          Observaciones: {run.ObservationsReceived} recibidas, {run.ObservationsAccepted} nuevas, {run.ObservationsDuplicate} ya existentes, {run.ObservationsConflicting} en conflicto, {run.ObservationsRejected} rechazadas
        """);
}
