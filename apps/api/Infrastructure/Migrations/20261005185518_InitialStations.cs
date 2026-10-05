using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BarcelonaPulse.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialStations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "data_sources",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    attribution = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    license = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    staleness_tolerance = table.Column<TimeSpan>(type: "interval", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_sources", x => x.id);
                    table.CheckConstraint("ck_data_sources_kind", "kind IN ('observed', 'synthetic')");
                    table.CheckConstraint("ck_data_sources_tolerance", "staleness_tolerance > interval '0'");
                });

            migrationBuilder.CreateTable(
                name: "ingestion_runs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    source_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    adapter = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    adapter_version = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    input_ref = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    input_sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    trigger = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    period_from = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    period_to = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    stations_received = table.Column<int>(type: "integer", nullable: false),
                    stations_rejected = table.Column<int>(type: "integer", nullable: false),
                    station_versions_created = table.Column<int>(type: "integer", nullable: false),
                    observations_received = table.Column<int>(type: "integer", nullable: false),
                    observations_accepted = table.Column<int>(type: "integer", nullable: false),
                    observations_duplicate = table.Column<int>(type: "integer", nullable: false),
                    observations_rejected = table.Column<int>(type: "integer", nullable: false),
                    error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ingestion_runs", x => x.id);
                    table.CheckConstraint("ck_ingestion_runs_status", "status IN ('running', 'succeeded', 'succeeded_with_rejections', 'failed')");
                    table.ForeignKey(
                        name: "fk_ingestion_runs_data_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    source_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    source_station_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    first_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_stations", x => x.id);
                    table.ForeignKey(
                        name: "fk_stations_data_sources_source_id",
                        column: x => x.source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ingestion_rejections",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ingestion_run_id = table.Column<long>(type: "bigint", nullable: false),
                    record_kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    record_ref = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    detail = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ingestion_rejections", x => x.id);
                    table.ForeignKey(
                        name: "fk_ingestion_rejections_ingestion_runs_ingestion_run_id",
                        column: x => x.ingestion_run_id,
                        principalTable: "ingestion_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "station_observations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    station_id = table.Column<long>(type: "bigint", nullable: false),
                    observed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ingested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ingestion_run_id = table.Column<long>(type: "bigint", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    bikes_available = table.Column<int>(type: "integer", nullable: true),
                    mechanical_bikes_available = table.Column<int>(type: "integer", nullable: true),
                    ebikes_available = table.Column<int>(type: "integer", nullable: true),
                    docks_available = table.Column<int>(type: "integer", nullable: true),
                    bikes_disabled = table.Column<int>(type: "integer", nullable: true),
                    docks_disabled = table.Column<int>(type: "integer", nullable: true),
                    quality_flags = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_station_observations", x => x.id);
                    table.CheckConstraint("ck_station_observations_counts", "(bikes_available IS NULL OR bikes_available >= 0) AND (mechanical_bikes_available IS NULL OR mechanical_bikes_available >= 0) AND (ebikes_available IS NULL OR ebikes_available >= 0) AND (docks_available IS NULL OR docks_available >= 0) AND (bikes_disabled IS NULL OR bikes_disabled >= 0) AND (docks_disabled IS NULL OR docks_disabled >= 0)");
                    table.CheckConstraint("ck_station_observations_status", "status IN ('in_service', 'maintenance', 'closed', 'planned', 'unknown')");
                    table.ForeignKey(
                        name: "fk_station_observations_ingestion_runs_ingestion_run_id",
                        column: x => x.ingestion_run_id,
                        principalTable: "ingestion_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_station_observations_stations_station_id",
                        column: x => x.station_id,
                        principalTable: "stations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "station_versions",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    station_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    location = table.Column<Point>(type: "geometry(Point,4326)", nullable: false),
                    capacity = table.Column<int>(type: "integer", nullable: true),
                    valid_from = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    valid_to = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    first_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ingestion_run_id = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_station_versions", x => x.id);
                    table.CheckConstraint("ck_station_versions_capacity", "capacity IS NULL OR capacity >= 0");
                    table.CheckConstraint("ck_station_versions_validity", "valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to");
                    table.ForeignKey(
                        name: "fk_station_versions_ingestion_runs_ingestion_run_id",
                        column: x => x.ingestion_run_id,
                        principalTable: "ingestion_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_station_versions_stations_station_id",
                        column: x => x.station_id,
                        principalTable: "stations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ingestion_rejections_ingestion_run_id",
                table: "ingestion_rejections",
                column: "ingestion_run_id");

            migrationBuilder.CreateIndex(
                name: "ix_ingestion_runs_source_id_started_at",
                table: "ingestion_runs",
                columns: new[] { "source_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "ix_station_observations_ingestion_run_id",
                table: "station_observations",
                column: "ingestion_run_id");

            migrationBuilder.CreateIndex(
                name: "ux_station_observations_station_observed_at",
                table: "station_observations",
                columns: new[] { "station_id", "observed_at" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_station_versions_ingestion_run_id",
                table: "station_versions",
                column: "ingestion_run_id");

            migrationBuilder.CreateIndex(
                name: "ix_station_versions_location",
                table: "station_versions",
                column: "location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "ix_station_versions_one_current_per_station",
                table: "station_versions",
                column: "station_id",
                unique: true,
                filter: "valid_to IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_stations_source_id_source_station_id",
                table: "stations",
                columns: new[] { "source_id", "source_station_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ingestion_rejections");

            migrationBuilder.DropTable(
                name: "station_observations");

            migrationBuilder.DropTable(
                name: "station_versions");

            migrationBuilder.DropTable(
                name: "ingestion_runs");

            migrationBuilder.DropTable(
                name: "stations");

            migrationBuilder.DropTable(
                name: "data_sources");
        }
    }
}
