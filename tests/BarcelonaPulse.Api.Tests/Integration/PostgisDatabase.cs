using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// Base de datos PostGIS temporal por clase de prueba, con las migraciones aplicadas.
/// Requiere BP_TEST_POSTGRES (conexión de administración). Sin ella las pruebas de
/// integración se marcan como omitidas, nunca como pasadas; con BP_REQUIRE_DB=true fallan.
/// </summary>
public sealed class PostgisDatabase : IAsyncLifetime
{
    private const string AdminVariable = "BP_TEST_POSTGRES";
    private string? _adminConnectionString;
    private string? _databaseName;

    public string ConnectionString { get; private set; } = string.Empty;

    public bool Available => _databaseName is not null;

    public async ValueTask InitializeAsync()
    {
        _adminConnectionString = Environment.GetEnvironmentVariable(AdminVariable);
        if (string.IsNullOrWhiteSpace(_adminConnectionString))
        {
            return;
        }

        var name = $"bp_test_{Guid.NewGuid():N}"[..20];
        await using (var admin = new NpgsqlConnection(_adminConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        _databaseName = name;
        ConnectionString = new NpgsqlConnectionStringBuilder(_adminConnectionString) { Database = name }.ConnectionString;

        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (_databaseName is null)
        {
            return;
        }

        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(_adminConnectionString);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", admin);
        await drop.ExecuteNonQueryAsync();
    }

    /// <summary>Llamar al principio de cada prueba de integración.</summary>
    public void RequireAvailable()
    {
        if (Available)
        {
            return;
        }

        const string reason = $"Sin PostgreSQL de pruebas: define {AdminVariable} (ver README, «Pruebas»).";
        if (string.Equals(Environment.GetEnvironmentVariable("BP_REQUIRE_DB"), "true", StringComparison.OrdinalIgnoreCase))
        {
            Assert.Fail(reason);
        }

        Assert.Skip(reason);
    }

    public PulseDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<PulseDbContext>()
            .UseNpgsql(ConnectionString, o => o.UseNetTopologySuite())
            .UseSnakeCaseNamingConvention()
            .Options);
}
