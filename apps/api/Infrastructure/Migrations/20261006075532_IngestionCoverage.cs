using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class IngestionCoverage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "covered_from",
                table: "ingestion_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "covered_to",
                table: "ingestion_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_ingestion_runs_covered",
                table: "ingestion_runs",
                sql: "(covered_from IS NULL AND covered_to IS NULL) OR covered_from < covered_to");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_ingestion_runs_covered",
                table: "ingestion_runs");

            migrationBuilder.DropColumn(
                name: "covered_from",
                table: "ingestion_runs");

            migrationBuilder.DropColumn(
                name: "covered_to",
                table: "ingestion_runs");
        }
    }
}
