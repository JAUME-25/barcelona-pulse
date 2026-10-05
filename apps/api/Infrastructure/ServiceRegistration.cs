using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
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

    /// <summary>Límite por IP para la API pública. Sin cola: lo que excede recibe 429.</summary>
    public static IServiceCollection AddPulseRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var permitPerMinute = configuration.GetValue("RateLimiting:PermitPerMinute", 120);

        return services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(ApiRateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });
    }
}
