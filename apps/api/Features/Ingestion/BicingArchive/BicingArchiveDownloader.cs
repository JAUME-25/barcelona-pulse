using System.Net;
using SharpCompress.Archives.SevenZip;

namespace BarcelonaPulse.Api.Features.Ingestion.BicingArchive;

public enum BicingArchiveKind
{
    /// <summary>Estado de las estaciones (…_ESTACIONS.7z).</summary>
    Status,

    /// <summary>Información de las estaciones (…_INFORMACIO.7z).</summary>
    Info,
}

/// <summary>
/// Descarga los .7z del histórico. El portal responde 503 a ratos: se reintenta dos veces con
/// espera. Nunca más de un archivo a la vez ni más de lo necesario.
/// </summary>
public sealed class BicingArchiveDownloader(HttpClient http, ILogger<BicingArchiveDownloader> logger)
{
    private const string BaseUrl = "https://opendata-ajuntament.barcelona.cat/resources/bcn/BicingBCN/";

    private static readonly string[] MonthNames =
        ["Gener", "Febrer", "Marc", "Abril", "Maig", "Juny", "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"];

    private static readonly TimeSpan[] RetryDelays = [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5)];

    /// <summary>Nombres comprobados en CKAN: «2026_08_Agost_BicingNou_ESTACIONS.7z».</summary>
    public static Uri UrlFor(DateOnly month, BicingArchiveKind kind)
    {
        var suffix = kind == BicingArchiveKind.Status ? "ESTACIONS" : "INFORMACIO";
        return new Uri($"{BaseUrl}{month.Year:D4}_{month.Month:D2}_{MonthNames[month.Month - 1]}_BicingNou_{suffix}.7z");
    }

    /// <summary>Descarga a un archivo temporal y devuelve su ruta. Quien llama lo borra.</summary>
    public async Task<string> DownloadAsync(Uri url, long maxBytes, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await DownloadOnceAsync(url, maxBytes, ct);
            }
            catch (Exception ex) when (attempt < RetryDelays.Length && IsTransient(ex) && !ct.IsCancellationRequested)
            {
                logger.LogWarning("Descarga de {Url} fallida ({Error}); reintento en {Delay}", url, ex.Message, RetryDelays[attempt]);
                await Task.Delay(RetryDelays[attempt], ct);
            }
        }
    }

    private async Task<string> DownloadOnceAsync(Uri url, long maxBytes, CancellationToken ct)
    {
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FileNotFoundException($"El portal no tiene {url}. Comprueba que ese mes esté publicado.");
        }

        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > maxBytes)
        {
            throw new InvalidDataException($"{url} ocupa {response.Content.Headers.ContentLength} bytes; el máximo es {maxBytes}.");
        }

        var path = Path.Combine(Path.GetTempPath(), $"bicing-{Guid.NewGuid():N}.7z");
        try
        {
            await using (var source = await response.Content.ReadAsStreamAsync(ct))
            await using (var target = File.Create(path))
            {
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await source.ReadAsync(buffer, ct)) > 0)
                {
                    total += read;
                    if (total > maxBytes)
                    {
                        throw new InvalidDataException($"{url} supera {maxBytes} bytes.");
                    }

                    await target.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }

            // Un 200 con una página HTML de error no es un 7z.
            if (!SevenZipArchive.IsSevenZipFile(path))
            {
                throw new InvalidDataException($"{url} no ha devuelto un archivo 7z.");
            }

            return path;
        }
        catch
        {
            File.Delete(path);
            throw;
        }
    }

    private static bool IsTransient(Exception ex) => ex switch
    {
        FileNotFoundException => false, // 404: reintentar no lo arregla
        HttpRequestException { StatusCode: null or >= HttpStatusCode.InternalServerError } => true,
        TaskCanceledException => true, // tiempo de espera del HttpClient
        IOException => true,
        _ => false,
    };
}
