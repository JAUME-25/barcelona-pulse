using System.IO.Compression;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.ResponseCompression;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddJsonConsole();
}

builder.Services.AddPulseDatabase();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<StationIngestor>();
builder.Services.AddHttpClient<BicingArchiveDownloader>(http =>
{
    http.Timeout = TimeSpan.FromMinutes(5);
    http.DefaultRequestHeaders.UserAgent.ParseAdd("BarcelonaPulse/0.1 (+https://github.com/JAUME-25/barcelona-pulse)");
});
builder.Services.AddProblemDetails();
// Las respuestas de estaciones pesan ~280 KB sin comprimir con datos reales. La API no usa
// cookies ni datos secretos, así que comprimir también en HTTPS no expone nada (BREACH).
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/problem+json"]);
});
// Con el nivel por defecto (el más rápido), Brotli comprimía peor que gzip (67 KB frente a 45 KB).
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
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

app.UseResponseCompression();
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
