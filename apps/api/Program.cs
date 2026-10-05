using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddJsonConsole();
}

builder.Services.AddPulseDatabase();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<StationIngestor>();
builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(o => ServiceRegistration.ConfigureApiJson(o.SerializerOptions));
builder.Services.AddOpenApi(o => o.AddDocumentTransformer((document, _, _) =>
{
    document.Info.Title = "Barcelona Pulse API";
    document.Info.Version = "v1";
    document.Info.Description =
        "Estaciones de Bicing y su estado. Distingue datos observados de datos sintéticos de demostración.";
    return Task.CompletedTask;
}));
builder.Services.AddHealthChecks().AddDbContextCheck<PulseDbContext>("database", tags: ["ready"]);
builder.Services.AddPulseCors(builder.Configuration);
builder.Services.AddPulseRateLimiting(builder.Configuration);

var app = builder.Build();

// Comandos de operación (migrate, ingest). No se exponen por HTTP.
if (CommandLine.IsCommand(args))
{
    return await CommandLine.RunAsync(app.Services, args);
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();

app.MapOpenApi();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });

var api = app.MapGroup("/api").RequireRateLimiting(ServiceRegistration.ApiRateLimitPolicy);
api.MapSourcesEndpoints();
api.MapStationsEndpoints();

await app.RunAsync();
return 0;
