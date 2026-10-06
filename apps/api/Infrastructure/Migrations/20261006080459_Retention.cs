using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Retention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "purged_at",
                table: "ingestion_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "observation_count",
                table: "data_sources",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            // Recuento inicial de lo que ya hay; desde aquí lo llevan la ingesta y la purga.
            migrationBuilder.Sql("""
                UPDATE data_sources d
                SET observation_count = (
                    SELECT count(*)
                    FROM station_observations o
                    JOIN stations s ON s.id = o.station_id
                    WHERE s.source_id = d.id);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "purged_at",
                table: "ingestion_runs");

            migrationBuilder.DropColumn(
                name: "observation_count",
                table: "data_sources");
        }
    }
}
