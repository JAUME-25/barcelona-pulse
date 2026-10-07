using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// La base de datos no admite dos versiones de una estación vigentes a la vez (migración
/// <c>VersionsNoOverlap</c>): si la ingesta fallara en un caso no previsto, se deshace en vez de
/// duplicar la estación en el mapa. Diferida al commit: dentro de la transacción se cierra y se
/// abre en cualquier orden.
/// </summary>
public sealed class VersionsNoOverlapTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Two_versions_cannot_be_in_force_at_once_but_consecutive_ones_can()
    {
        database.RequireAvailable();
        var ct = TestContext.Current.CancellationToken;
        const string source = "no-overlap";
        var window = LocalDay.For(new DateOnly(2026, 8, 19));
        long stationId;
        long runId;
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(Now), NullLogger<StationIngestor>.Instance);
            var batch = Batch([Station("s1")], [Observation("s1", window.StartUtc.AddHours(10))], source: Source(source));
            var run = await ingestor.IngestAsync(
                batch with { Covers = new CoveredPeriod(window.StartUtc, window.EndUtc) }, "test", ct);
            runId = run.Id;
            stationId = await db.Stations.Where(s => s.SourceId == source).Select(s => s.Id).SingleAsync(ct);
        }

        var at = window.StartUtc.AddHours(12);
        var later = at.AddHours(1);

        // La primera versión es vigente hacia atrás y hacia delante: otra que la solape se rechaza.
        await using (var db = database.CreateContext())
        {
            var error = await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlAsync($"""
                INSERT INTO station_versions
                    (station_id, name, location, valid_from, valid_to, first_seen_at, ingestion_run_id)
                VALUES ({stationId}, 'OTRA', ST_SetSRID(ST_MakePoint(2.17, 41.39), 4326), {at}, {later}, {at}, {runId})
                """, ct));
            Assert.Equal(PostgresErrorCodes.ExclusionViolation, error.SqlState);
        }

        // En una transacción, primero la nueva y después cerrar la vigente en el mismo instante:
        // al confirmar no se solapan (el fin va excluido), y pasa.
        await using (var db = database.CreateContext())
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlAsync($"""
                INSERT INTO station_versions
                    (station_id, name, location, valid_from, valid_to, first_seen_at, ingestion_run_id)
                VALUES ({stationId}, 'OTRA', ST_SetSRID(ST_MakePoint(2.17, 41.39), 4326), {at}, {later}, {at}, {runId})
                """, ct);
            await db.Database.ExecuteSqlAsync(
                $"UPDATE station_versions SET valid_to = {at} WHERE station_id = {stationId} AND valid_from IS NULL", ct);
            await tx.CommitAsync(ct);
            Assert.Equal(2, await db.Set<StationVersion>().CountAsync(v => v.StationId == stationId, ct));
        }
    }
}
