using System.Globalization;
using Microsoft.AspNetCore.Http.HttpResults;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Cuántos cálculos caros de un tipo (hoy, el patrón de una estación; hasta el 9-10-2026 también
/// la línea temporal, que ahora lee de un resumen) corren a la vez, y cuánto espera una petición
/// por un hueco antes de rendirse. Sin tope de espera, una ráfaga de peticiones distintas (cada
/// una, otra clave de caché) dejaba a las demás colgadas hasta que nginx cortaba a los 30 s.
/// Pasado el tope, la petición responde 503 con <c>Retry-After</c>; lo que ya está en la caché
/// nunca pasa por aquí.
/// </summary>
public sealed class ComputationGate(int concurrency, TimeSpan maxWait)
{
    private readonly SemaphoreSlim semaphore = new(concurrency);

    /// <summary>Cuánto espera una petición por un hueco, si no pide otra cosa.</summary>
    public TimeSpan MaxWait { get; } = maxWait;

    /// <summary>
    /// Un hueco, que se devuelve al liberar el resultado. Si no llega en <paramref name="maxWait"/>
    /// (o en <see cref="MaxWait"/>), <see cref="ComputationBusyException"/>. Con
    /// <see cref="Timeout.InfiniteTimeSpan"/> espera sin tope, para quien no tenga prisa.
    /// </summary>
    public async Task<IDisposable> EnterAsync(CancellationToken ct, TimeSpan? maxWait = null)
    {
        var wait = maxWait ?? MaxWait;
        if (!await semaphore.WaitAsync(wait, ct))
        {
            throw new ComputationBusyException(wait);
        }

        return new Lease(semaphore);
    }

    private sealed class Lease(SemaphoreSlim semaphore) : IDisposable
    {
        private int released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref released, 1) == 0)
            {
                semaphore.Release();
            }
        }
    }
}

/// <summary>No había hueco para calcular a tiempo: la API responde 503 y sugiere cuándo volver.</summary>
public sealed class ComputationBusyException(TimeSpan waited)
    : Exception($"Sin hueco para calcular tras esperar {waited.TotalSeconds:0} s.")
{
    /// <summary>Segundos que se sugiere esperar: la mitad de lo esperado, y al menos uno.</summary>
    public int RetryAfterSeconds { get; } = Math.Max(1, (int)Math.Ceiling(waited.TotalSeconds / 2));

    /// <summary>La respuesta: 503 en <c>problem+json</c> con <c>Retry-After</c>.</summary>
    public ProblemHttpResult ToProblem(HttpContext http)
    {
        http.Response.Headers.RetryAfter = RetryAfterSeconds.ToString(CultureInfo.InvariantCulture);
        return TypedResults.Problem(
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "La API está ocupada",
            detail: "Hay demasiados cálculos a la vez. Vuelve a intentarlo en unos segundos.");
    }
}
