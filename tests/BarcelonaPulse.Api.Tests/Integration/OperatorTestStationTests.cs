using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Logging.Abstractions;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// La estación de pruebas del operador ya importada se quita con la migración
/// RemoveOperatorTestStation, sin tocar las demás y descontando sus observaciones del recuento.
/// </summary>
public sealed class OperatorTestStationTests(PostgisDatabase database) : IClassFixture<PostgisDatabase>
{
    private const string MigrationBefore = "20261006082342_StudyAreas";
    private const string MigrationUnderTest = "20261007091011_RemoveOperatorTestStation";

    [Fact]
    public async Task The_migration_removes_the_operator_test_station_and_its_observations()
    {
        database.RequireAvailable();
        var ct = TestContext.Current.CancellationToken;
        await using (var db = database.CreateContext())
        {
            await db.GetService<IMigrator>().MigrateAsync(MigrationBefore, ct);
            // El modelo de hoy ya tiene purge_generation (ADR 0014) y la ingesta lee data_sources con
            // él: se añade a mano, como lo haría su migración, que aquí no se aplica.
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE data_sources ADD COLUMN purge_generation integer NOT NULL DEFAULT 0", ct);
            // Y la altitud de las versiones (migración StationAltitude), por lo mismo.
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE station_versions ADD COLUMN altitude double precision NULL", ct);
            // Y el resumen de la línea temporal (migración TimelineSummaries), que la ingesta mantiene.
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TABLE timeline_summaries (source_id character varying(64) NOT NULL REFERENCES data_sources(id), " +
                "at timestamp with time zone NOT NULL, stations_with_data integer NOT NULL, stations_counted integer NOT NULL, " +
                "stations_empty integer NOT NULL, stations_full integer NOT NULL, bikes_available integer NULL, " +
                "docks_available integer NULL, stations_counted_ebikes integer NOT NULL, ebikes_available integer NULL, " +
                "PRIMARY KEY (source_id, at))", ct);
        }

        // Como estaba en mayo de 2026: la 536 entre las demás, con sus observaciones.
        var source = Source("bicing-bcn", SourceKind.Observed);
        await using (var db = database.CreateContext())
        {
            var ingestor = new StationIngestor(db, new FixedClock(T0.AddDays(1)), NullLogger<StationIngestor>.Instance);
            await ingestor.IngestAsync(Batch(
                [Station("1"), Station("536", name: "Estación de TESTING (no usuarios)", capacity: 2)],
                [
                    Observation("1", T0), Observation("1", T0.AddMinutes(5)),
                    Observation("536", T0, bikes: 2, docks: 0), Observation("536", T0.AddMinutes(5), bikes: 2, docks: 0),
                    Observation("536", T0.AddMinutes(10), bikes: 2, docks: 0),
                ],
                source: source), "test", ct);
            // Sin seguimiento: la ingesta lleva el recuento con ExecuteUpdate, que no pasa por el contexto.
            Assert.Equal(5, (await db.DataSources.AsNoTracking().SingleAsync(s => s.Id == "bicing-bcn", ct)).ObservationCount);
        }

        await using (var db = database.CreateContext())
        {
            await db.GetService<IMigrator>().MigrateAsync(MigrationUnderTest, ct);
        }

        await using (var db = database.CreateContext())
        {
            Assert.Equal(["1"], await db.Stations.Where(s => s.SourceId == "bicing-bcn").Select(s => s.SourceStationId).ToListAsync(ct));
            Assert.False(await db.StationVersions.AnyAsync(v => v.Name.Contains("TESTING"), ct));
            Assert.Equal(2, await db.StationObservations.CountAsync(ct));
            Assert.Equal(2, (await db.DataSources.SingleAsync(s => s.Id == "bicing-bcn", ct)).ObservationCount);
        }
    }
}
