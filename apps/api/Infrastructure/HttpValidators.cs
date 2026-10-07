namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Validadores HTTP para respuestas que solo dependen de los datos y de la petición (ADR 0014):
/// un ETag débil con la versión de los datos y <c>Cache-Control: private, no-cache</c>, que hace
/// que el navegador vuelva a preguntar cada vez pero se lleve un 304 sin cuerpo mientras la
/// versión no cambie (una respuesta de estado pesa 29 KB comprimida; una hora de fotogramas, 110).
/// </summary>
public static class HttpValidators
{
    public const string CacheControl = "private, no-cache";

    /// <summary>
    /// Pone las cabeceras y dice si el cliente ya tiene esta versión (<c>If-None-Match</c>): entonces
    /// basta responder 304 sin calcular nada.
    /// </summary>
    public static bool ClientHas(HttpContext http, string version)
    {
        var tag = $"W/\"{version}\"";
        http.Response.Headers.ETag = tag;
        http.Response.Headers.CacheControl = CacheControl;
        foreach (var header in http.Request.Headers.IfNoneMatch)
        {
            if (header is null)
            {
                continue;
            }

            foreach (var candidate in header.Split(','))
            {
                var value = candidate.Trim();
                if (value == tag || value == "*")
                {
                    return true;
                }
            }
        }

        return false;
    }

    public static Microsoft.AspNetCore.Http.HttpResults.StatusCodeHttpResult NotModified() =>
        TypedResults.StatusCode(StatusCodes.Status304NotModified);
}
