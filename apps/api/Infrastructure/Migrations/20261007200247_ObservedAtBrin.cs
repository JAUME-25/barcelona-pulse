using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ObservedAtBrin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_station_observations_observed_at_brin",
                table: "station_observations",
                column: "observed_at")
                .Annotation("Npgsql:IndexMethod", "brin")
                .Annotation("Npgsql:StorageParameter:pages_per_range", 32);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_station_observations_observed_at_brin",
                table: "station_observations");
        }
    }
}
