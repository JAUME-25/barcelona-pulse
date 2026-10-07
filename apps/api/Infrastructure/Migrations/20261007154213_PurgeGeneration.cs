using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PurgeGeneration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "purge_generation",
                table: "data_sources",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "purge_generation",
                table: "data_sources");
        }
    }
}
