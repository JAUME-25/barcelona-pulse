using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BicingArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_ingestion_runs_status",
                table: "ingestion_runs");

            migrationBuilder.AddColumn<string>(
                name: "district",
                table: "station_versions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "neighbourhood",
                table: "station_versions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_renting",
                table: "station_observations",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_returning",
                table: "station_observations",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "observations_conflicting",
                table: "ingestion_runs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Renombrado: los conflictos también cuentan como incidencia, no solo los rechazos.
            migrationBuilder.Sql("UPDATE ingestion_runs SET status = 'succeeded_with_issues' WHERE status = 'succeeded_with_rejections';");

            migrationBuilder.AddCheckConstraint(
                name: "ck_ingestion_runs_status",
                table: "ingestion_runs",
                sql: "status IN ('running', 'succeeded', 'succeeded_with_issues', 'failed')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_ingestion_runs_status",
                table: "ingestion_runs");

            migrationBuilder.DropColumn(
                name: "district",
                table: "station_versions");

            migrationBuilder.DropColumn(
                name: "neighbourhood",
                table: "station_versions");

            migrationBuilder.DropColumn(
                name: "is_renting",
                table: "station_observations");

            migrationBuilder.DropColumn(
                name: "is_returning",
                table: "station_observations");

            migrationBuilder.DropColumn(
                name: "observations_conflicting",
                table: "ingestion_runs");

            migrationBuilder.Sql("UPDATE ingestion_runs SET status = 'succeeded_with_rejections' WHERE status = 'succeeded_with_issues';");

            migrationBuilder.AddCheckConstraint(
                name: "ck_ingestion_runs_status",
                table: "ingestion_runs",
                sql: "status IN ('running', 'succeeded', 'succeeded_with_rejections', 'failed')");
        }
    }
}
