using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <summary>
    /// Dos versiones de la misma estación no pueden estar vigentes a la vez. La ingesta ya lo
    /// evita; si un caso no previsto lo rompiera, el mapa duplicaría la estación sin aviso. Con
    /// la restricción, la ingesta falla y se deshace. Diferida al commit: dentro de la
    /// transacción, la ingesta cierra y abre versiones en varios pasos. Sin `valid_from` es
    /// vigente hacia atrás y sin `valid_to`, hacia delante; el fin va excluido, así que dos
    /// versiones seguidas que comparten el instante no se solapan.
    /// </summary>
    public partial class VersionsNoOverlap : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Para comparar station_id (bigint) con = en un índice GiST.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");
            migrationBuilder.Sql("""
                ALTER TABLE station_versions
                ADD CONSTRAINT ex_station_versions_no_overlap
                EXCLUDE USING gist (
                    station_id WITH =,
                    tstzrange(
                        coalesce(valid_from, '-infinity'::timestamptz),
                        coalesce(valid_to, 'infinity'::timestamptz),
                        '[)') WITH &&
                ) DEFERRABLE INITIALLY DEFERRED;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE station_versions DROP CONSTRAINT ex_station_versions_no_overlap;");
        }
    }
}
