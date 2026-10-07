using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>
/// Al arrancar, cierra como fallidas las ingestas que se quedaron «en marcha» porque el proceso
/// terminó sin cerrarlas (memoria agotada, <c>docker stop</c>): la ejecución se guarda antes de
/// abrir la transacción y, sin esto, <c>/api/sources</c> la daría por última ingesta para
/// siempre. Una ingesta de verdad dura minutos: pasada una hora, no sigue.
/// </summary>
public sealed class IngestionJanitor(
    IServiceScopeFactory scopes, TimeProvider clock, IConfiguration configuration, ILogger<IngestionJanitor> logger)
    : BackgroundService
{
    public static readonly TimeSpan MaxRunning = TimeSpan.FromHours(1);
    public const string InterruptedError = "Interrumpida: el proceso terminó sin cerrar la ingesta.";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Las pruebas lo apagan: cambiaría ejecuciones que ellas mismas dejan en marcha.
        if (!configuration.GetValue("Ingestion:Janitor", true))
        {
            return;
        }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<PulseDbContext>();
            var closed = await CloseInterruptedAsync(db, clock.GetUtcNow(), stoppingToken);
            if (closed > 0)
            {
                logger.LogWarning("{Count} ingestas se quedaron en marcha sin acabar: cerradas como fallidas", closed);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Parando la API.
        }
        catch (Exception ex)
        {
            // Un fallo aquí no puede tumbar la API.
            logger.LogWarning(ex, "No se han podido revisar las ingestas en marcha");
        }
    }

    /// <summary>Cierra como fallidas las que llevan más de <see cref="MaxRunning"/> en marcha; dice cuántas.</summary>
    public static Task<int> CloseInterruptedAsync(PulseDbContext db, DateTimeOffset now, CancellationToken ct)
    {
        var limit = now - MaxRunning;
        return db.IngestionRuns
            .Where(r => r.Status == IngestionStatus.Running && r.StartedAt < limit)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, IngestionStatus.Failed)
                .SetProperty(r => r.FinishedAt, now)
                .SetProperty(r => r.Error, InterruptedError), ct);
    }
}
