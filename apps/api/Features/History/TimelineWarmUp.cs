using System.Diagnostics;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BarcelonaPulse.Api.Features.History;

/// <summary>
/// Deja calculada la línea temporal que pide «Qué muestra y qué no» para su rejilla de huecos:
/// cada semana con días importados de cada fuente, de lunes a domingo en hora de Barcelona y cada
/// 15 minutos, igual que <c>apps/web/src/features/limits/quality.ts</c>. Sin esto, la primera
/// visita que abría la ficha después de arrancar la API esperaba unos 12 s en producción.
/// Lo comprueba al arrancar y cada 5 minutos, así que también la vuelve a calcular después de
/// importar o quitar días (la clave de la caché cambia) o si la caché la ha desalojado. Si la
/// semana ya está en la caché, no hace nada más que dos consultas pequeñas por fuente.
/// </summary>
public sealed class TimelineWarmUp(
    IServiceScopeFactory scopes, IMemoryCache cache, IConfiguration configuration, ILogger<TimelineWarmUp> logger)
    : BackgroundService
{
    public static readonly TimeSpan Step = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Las pruebas lo apagan: no quieren cálculos en segundo plano mientras cambian la base de datos.
        if (!configuration.GetValue("Timeline:WarmUp", true))
        {
            return;
        }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // Un fallo aquí no puede tumbar la API: la rejilla se calculará al abrir la ficha.
                logger.LogWarning(ex, "No se ha podido dejar calculada la rejilla de huecos; otra vez en {Interval}", Interval);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Calcula las semanas que falten en la caché y dice cuántas ha calculado.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PulseDbContext>();
        var sources = await db.DataSources.AsNoTracking().OrderBy(s => s.Id).ToListAsync(ct);
        var computed = 0;
        foreach (var source in sources)
        {
            var days = await SourceDays.GetAsync(db, source.Id, ct);
            foreach (var (monday, from, to) in Weeks(days))
            {
                if (cache.TryGetValue(await TimelineQuery.KeyAsync(db, source, from, to, Step, ct), out _))
                {
                    continue;
                }

                var started = Stopwatch.GetTimestamp();
                // Sin tope de espera por un hueco: a esto no le corre prisa y no debe fallar por
                // coincidir con peticiones de la web.
                await TimelineQuery.GetAsync(
                    db, cache, source, from, to, Step, ct, CacheItemPriority.High, Timeout.InfiniteTimeSpan);
                computed++;
                logger.LogInformation(
                    "Rejilla de huecos de {Source}, semana del {Monday:yyyy-MM-dd}: {Milliseconds} ms",
                    source.Id, monday, (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            }
        }

        return computed;
    }

    /// <summary>
    /// Semanas de lunes a domingo (hora de Barcelona) que tocan esos días: desde las 00:00 del lunes
    /// hasta el último paso antes de las 00:00 del lunes siguiente, como las pide la web. En las
    /// semanas con cambio de hora, 167 o 169 horas.
    /// </summary>
    public static IEnumerable<(DateOnly Monday, DateTimeOffset From, DateTimeOffset To)> Weeks(IEnumerable<DateOnly> days)
    {
        foreach (var monday in days.Select(MondayOf).Distinct().Order())
        {
            var (from, to, _) = TimelineGrid.Align(
                LocalDay.For(monday).StartUtc, LocalDay.For(monday.AddDays(7)).StartUtc - Step, Step);
            yield return (monday, from, to);
        }
    }

    private static DateOnly MondayOf(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
}
