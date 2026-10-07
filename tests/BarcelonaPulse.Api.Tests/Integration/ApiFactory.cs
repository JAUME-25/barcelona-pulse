using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BarcelonaPulse.Api.Tests.Integration;

internal sealed class ApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Postgres", connectionString);
        builder.UseSetting("RateLimiting:PermitPerMinute", "10000");
        // Sin cálculos en segundo plano mientras las pruebas leen y cambian la base de datos, ni
        // cierre de ingestas en marcha (hay pruebas que las dejan así a propósito).
        builder.UseSetting("Timeline:WarmUp", "false");
        builder.UseSetting("Ingestion:Janitor", "false");
    }
}
