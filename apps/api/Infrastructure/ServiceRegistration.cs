using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Infrastructure;

public static class ServiceRegistration
{
    public const string ApiRateLimitPolicy = "api";

    public static IServiceCollection AddPulseDatabase(this IServiceCollection services) =>
        services.AddDbContext<PulseDbContext>((sp, options) =>
        {
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Postgres");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "Falta ConnectionStrings:Postgres. En Docker Compose sale de .env (ver .env.example).");
            }

            options
                .UseNpgsql(connectionString, npgsql => npgsql.UseNetTopologySuite())
                .UseSnakeCaseNamingConvention();
        });

    /// <summary>Mismas reglas de JSON para respuestas y para el documento OpenAPI.</summary>
    public static void ConfigureApiJson(JsonSerializerOptions options)
    {
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        // Los números son números: sin esto el contrato los declara también como texto.
        options.NumberHandling = JsonNumberHandling.Strict;
        options.RespectNullableAnnotations = true;
        options.RespectRequiredConstructorParameters = true;
    }

    /// <summary>CORS solo para lectura y solo para los orígenes configurados.</summary>
    public static IServiceCollection AddPulseCors(this IServiceCollection services, IConfiguration configuration)
    {
        var origins = (configuration["Cors:AllowedOrigins"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return services.AddCors(o => o.AddDefaultPolicy(policy =>
        {
            if (origins.Length > 0)
            {
                policy.WithOrigins(origins).WithMethods("GET").WithHeaders("Content-Type");
            }
        }));
    }

    /// <summary>
    /// Detrás de un proxy (nginx en el servidor), la IP del cliente llega en X-Forwarded-For. Solo
    /// se cree a los proxies de las redes de <c>ForwardedHeaders:KnownNetworks</c> (CIDR separados
    /// por comas; p. ej. la red de Docker) y a localhost. Sin esto, el límite por IP sería uno solo
    /// para todas las visitas.
    /// </summary>
    public static IServiceCollection AddPulseForwardedHeaders(this IServiceCollection services, IConfiguration configuration)
    {
        var networks = (configuration["ForwardedHeaders:KnownNetworks"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(System.Net.IPNetwork.Parse)
            .ToList();

        return services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // nginx sustituye la cabecera por la IP que ve ($remote_addr): una sola entrada.
            o.ForwardLimit = 1;
            foreach (var network in networks)
            {
                o.KnownIPNetworks.Add(network);
            }
        });
    }

    /// <summary>
    /// Límite por IP para la API pública. Sin cola: lo que excede recibe 429, con Retry-After
    /// (los segundos que faltan para la ventana siguiente).
    /// </summary>
    public static IServiceCollection AddPulseRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var permitPerMinute = configuration.GetValue("RateLimiting:PermitPerMinute", 120);

        return services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = (context, _) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                }

                return ValueTask.CompletedTask;
            };
            o.AddPolicy(ApiRateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
                RateLimitKey(http.Connection.RemoteIpAddress),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });
    }

    /// <summary>
    /// A quién se cuenta el límite. Una IPv6, por su /64: un cliente suele tener el /64 entero y,
    /// cambiando de dirección dentro de él, tendría un cupo nuevo en cada petición.
    /// </summary>
    internal static string RateLimitKey(IPAddress? address)
    {
        if (address is null) return "unknown";
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (address.AddressFamily != AddressFamily.InterNetworkV6) return address.ToString();
        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"{new IPAddress(bytes)}/64";
    }
}
