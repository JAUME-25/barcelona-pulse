using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Punto de entrada controlado para operaciones que no se exponen por HTTP.
///   migrate       aplica las migraciones pendientes
///   ingest demo   importa el fixture sintético (idempotente)
/// </summary>
public static class CommandLine
{
    private static readonly string[] Commands = ["migrate", "ingest"];

    private const string Usage = """
        Uso:
          migrate       Aplica las migraciones pendientes.
          ingest demo   Importa los datos sintéticos de demostración. Repetirlo no duplica nada.
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
                    Console.WriteLine($"""
                        Ingesta {run.Id} ({run.Adapter} v{run.AdapterVersion}) de '{run.SourceId}': {SnakeCaseEnum<IngestionStatus>.Name(run.Status)}
                          Entrada:       {run.InputRef} (sha256 {run.InputSha256?[..12]}…)
                          Periodo:       {run.PeriodFrom:O} → {run.PeriodTo:O}
                          Estaciones:    {run.StationsReceived} recibidas, {run.StationsRejected} rechazadas, {run.StationVersionsCreated} versiones nuevas
                          Observaciones: {run.ObservationsReceived} recibidas, {run.ObservationsAccepted} nuevas, {run.ObservationsDuplicate} ya existentes, {run.ObservationsRejected} rechazadas
                        """);
                    return 0;
                }

            default:
                await Console.Error.WriteLineAsync(Usage);
                return 2;
        }
    }
}
