using System.Globalization;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Punto de entrada controlado para operaciones que no se exponen por HTTP.
///   migrate                         aplica las migraciones pendientes
///   ingest demo                     importa el fixture sintético (idempotente)
///   ingest bicing-archive --day D   importa un día del histórico de Bicing (idempotente)
/// </summary>
public static class CommandLine
{
    private static readonly string[] Commands = ["migrate", "ingest"];

    /// <summary>Primer mes publicado del histórico de Bicing nuevo.</summary>
    private static readonly DateOnly FirstArchiveDay = new(2019, 3, 1);

    private static readonly TimeSpan ArchiveTimeout = TimeSpan.FromMinutes(15);

    private const string Usage = """
        Uso:
          migrate
              Aplica las migraciones pendientes.
          ingest demo
              Importa los datos sintéticos de demostración. Repetirlo no duplica nada.
          ingest bicing-archive --day AAAA-MM-DD [--status-file RUTA --info-file RUTA]
              Importa un día (hora de Barcelona) del histórico mensual de Bicing del Ajuntament.
              Sin rutas, descarga los dos .7z del mes. Repetirlo no duplica nada.
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

            case ["ingest", "bicing-archive", .. var options]:
                {
                    var run = await IngestBicingArchiveAsync(sp, ParseOptions(options), ct);
                    PrintSummary(run);
                    return 0;
                }

            default:
                await Console.Error.WriteLineAsync(Usage);
                return 2;
        }
    }

    private static async Task<IngestionRun> IngestBicingArchiveAsync(
        IServiceProvider sp, Dictionary<string, string> options, CancellationToken ct)
    {
        if (!options.TryGetValue("day", out var dayText)
            || !DateOnly.TryParseExact(dayText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        {
            throw new ArgumentException("Falta --day AAAA-MM-DD.");
        }

        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        if (day < FirstArchiveDay || day > yesterday)
        {
            throw new ArgumentException($"--day debe estar entre {FirstArchiveDay:yyyy-MM-dd} y {yesterday:yyyy-MM-dd}.");
        }

        options.TryGetValue("status-file", out var statusFile);
        options.TryGetValue("info-file", out var infoFile);
        if ((statusFile is null) != (infoFile is null))
        {
            throw new ArgumentException("--status-file e --info-file van juntos.");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ArchiveTimeout);
        var limits = new ArchiveLimits();
        var downloaded = new List<string>();
        string? statusName = null, infoName = null;
        try
        {
            if (statusFile is null || infoFile is null)
            {
                var downloader = sp.GetRequiredService<BicingArchiveDownloader>();
                var month = new DateOnly(day.Year, day.Month, 1);
                foreach (var kind in new[] { BicingArchiveKind.Status, BicingArchiveKind.Info })
                {
                    var url = BicingArchiveDownloader.UrlFor(month, kind);
                    Console.WriteLine($"Descargando {url}");
                    downloaded.Add(await downloader.DownloadAsync(url, limits.MaxArchiveBytes, timeout.Token));
                }

                (statusFile, infoFile) = (downloaded[0], downloaded[1]);
                statusName = Path.GetFileName(BicingArchiveDownloader.UrlFor(month, BicingArchiveKind.Status).LocalPath);
                infoName = Path.GetFileName(BicingArchiveDownloader.UrlFor(month, BicingArchiveKind.Info).LocalPath);
            }

            Console.WriteLine($"Leyendo el día {day:yyyy-MM-dd} ({LocalDay.TimeZoneId})…");
            var batch = BicingArchiveAdapter.Read(statusFile, infoFile, day, limits, timeout.Token, statusName, infoName);
            var ingestor = sp.GetRequiredService<StationIngestor>();
            return await ingestor.IngestAsync(batch, trigger: "cli", timeout.Token);
        }
        finally
        {
            foreach (var path in downloaded) File.Delete(path);
        }
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
