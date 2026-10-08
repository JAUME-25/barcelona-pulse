using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TimelineSummaries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "timeline_summaries",
                columns: table => new
                {
                    source_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    stations_with_data = table.Column<int>(type: "integer", nullable: false),
                    stations_counted = table.Column<int>(type: "integer", nullable: false),
                    stations_empty = table.Column<int>(type: "integer", nullable: false),
                    stations_full = table.Column<int>(type: "integer", nullable: false),
                    bikes_available = table.Column<int>(type: "integer", nullable: true),
                    docks_available = table.Column<int>(type: "integer", nullable: true),
                    stations_counted_ebikes = table.Column<int>(type: "integer", nullable: false),
                    ebikes_available = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_timeline_summaries", x => new { x.source_id, x.at });
                    table.ForeignKey(
                        name: "fk_timeline_summaries_data_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "timeline_summaries");
        }
    }
}
