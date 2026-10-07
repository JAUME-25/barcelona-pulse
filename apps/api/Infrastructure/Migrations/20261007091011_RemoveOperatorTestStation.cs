using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveOperatorTestStation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // La estación de pruebas del operador («Estación de TESTING (no usuarios)») no es
            // pública: el adaptador ya no la importa (BicingArchiveAdapter.IsOperatorTestStation) y
            // aquí se quita de lo ya importado, con sus observaciones y el recuento de la fuente,
            // que llevan la ingesta y la purga (ADR 0012).
            migrationBuilder.Sql("""
                CREATE TEMP TABLE operator_test_stations ON COMMIT DROP AS
                SELECT DISTINCT s.id, s.source_id
                FROM stations s
                JOIN station_versions v ON v.station_id = s.id
                WHERE s.source_id = 'bicing-bcn' AND v.name ~* '\mTESTING\M';

                WITH removed AS (
                    DELETE FROM station_observations o
                    USING operator_test_stations t
                    WHERE o.station_id = t.id
                    RETURNING t.source_id
                )
                UPDATE data_sources d
                SET observation_count = d.observation_count - c.n
                FROM (SELECT source_id, count(*) AS n FROM removed GROUP BY source_id) c
                WHERE d.id = c.source_id;

                DELETE FROM station_versions v USING operator_test_stations t WHERE v.station_id = t.id;
                DELETE FROM stations s USING operator_test_stations t WHERE s.id = t.id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Lo borrado no vuelve: no era una estación pública.
        }
    }
}
