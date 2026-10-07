using System.Diagnostics;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Deja rastro de lo que merece mirarse en producción: peticiones lentas, rechazadas por el límite
/// (429), sin hueco para calcular (503) y fallos (5xx), con método, ruta, estado y duración. Nada
/// de quién las hizo: la API no rastrea visitantes. El resto del tráfico no se registra (el log de
/// ASP.NET va en Warning, <c>appsettings.json</c>).
/// </summary>
public static class RequestLogging
{
    /// <summary>A partir de aquí una petición es «lenta»: el estado tarda 15 ms y una semana de línea temporal, 2–4 s.</summary>
    public static readonly TimeSpan SlowThreshold = TimeSpan.FromSeconds(1);

    public static IApplicationBuilder UsePulseRequestLogging(this IApplicationBuilder app)
    {
        var logger = app.ApplicationServices.GetRequiredService<ILoggerFactory>().CreateLogger("BarcelonaPulse.Requests");
        return app.Use(async (http, next) =>
        {
            var started = Stopwatch.GetTimestamp();
            await next(http);
            var elapsed = Stopwatch.GetElapsedTime(started);
            var status = http.Response.StatusCode;
            var reason = status switch
            {
                >= 500 => "con fallo",
                StatusCodes.Status429TooManyRequests => "rechazada por el límite",
                _ when elapsed >= SlowThreshold => "lenta",
                _ => null,
            };
            if (reason is null)
            {
                return;
            }

            logger.LogWarning(
                "Petición {Reason}: {Method} {Path}{Query} → {Status} en {Milliseconds} ms",
                reason, http.Request.Method, http.Request.Path.Value, http.Request.QueryString.Value,
                status, (long)elapsed.TotalMilliseconds);
        });
    }
}
