using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NetTopologySuite.Geometries;

namespace BarcelonaPulse.Api.Features.Stations;

/// <summary>Identidad estable de una estación dentro de su fuente.</summary>
public sealed class Station
{
    public long Id { get; private set; }
    public required string SourceId { get; init; }
    public DataSource Source { get; private set; } = null!;

    /// <summary>Identificador tal como lo publica la fuente. No se presupone numérico.</summary>
    public required string SourceStationId { get; init; }

    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public List<StationVersion> Versions { get; } = [];
}

/// <summary>
/// Atributos de una estación durante un intervalo. Un cambio de nombre, ubicación o
/// capacidad cierra la versión vigente y abre otra.
/// </summary>
public sealed class StationVersion
{
    public long Id { get; private set; }
    public long StationId { get; init; }
    public Station Station { get; init; } = null!;

    public required string Name { get; init; }
    public string? Address { get; init; }

    /// <summary>Distrito y barrio, si la fuente los publica (orientan al leer el nombre).</summary>
    public string? District { get; init; }
    public string? Neighbourhood { get; init; }

    /// <summary>Punto WGS84 (SRID 4326): X = longitud, Y = latitud.</summary>
    public required Point Location { get; init; }

    public int? Capacity { get; init; }

    /// <summary>
    /// Inicio de vigencia. Nulo en la primera versión conocida: no sabemos desde cuándo
    /// existe y se asume vigente hacia atrás (se marca al servirla para instantes anteriores).
    /// Si después se importa algo anterior, pasa a ser el momento en que se vio por primera vez.
    /// </summary>
    public DateTimeOffset? ValidFrom { get; set; }

    /// <summary>Fin de vigencia (excluido). Nulo en la versión actual.</summary>
    public DateTimeOffset? ValidTo { get; set; }

    /// <summary>Primera vez que la fuente publicó estos atributos.</summary>
    public DateTimeOffset FirstSeenAt { get; init; }

    public long IngestionRunId { get; init; }
}

/// <summary>
/// Estado de una estación publicado por la fuente en un instante. Un recuento nulo
/// significa «no informado», nunca cero.
/// </summary>
public sealed class StationObservation
{
    public long Id { get; private set; }
    public long StationId { get; init; }
    public DateTimeOffset ObservedAt { get; init; }
    public DateTimeOffset IngestedAt { get; init; }
    public long IngestionRunId { get; init; }
    public ObservationStatus Status { get; init; }
    public int? BikesAvailable { get; init; }
    public int? MechanicalBikesAvailable { get; init; }
    public int? EbikesAvailable { get; init; }
    public int? DocksAvailable { get; init; }
    public int? BikesDisabled { get; init; }
    public int? DocksDisabled { get; init; }

    /// <summary>Si permite coger bicis. Nulo si la fuente no lo dice.</summary>
    public bool? IsRenting { get; init; }

    /// <summary>Si permite devolver bicis. Nulo si la fuente no lo dice.</summary>
    public bool? IsReturning { get; init; }

    public string[] QualityFlags { get; init; } = [];
}

public enum ObservationStatus
{
    InService,
    Maintenance,
    Closed,
    Planned,
    Unknown,
}

internal sealed class StationConfiguration : IEntityTypeConfiguration<Station>
{
    public void Configure(EntityTypeBuilder<Station> b)
    {
        b.Property(x => x.SourceId).HasMaxLength(64);
        b.Property(x => x.SourceStationId).HasMaxLength(100);
        b.HasIndex(x => new { x.SourceId, x.SourceStationId }).IsUnique();
        b.HasOne(x => x.Source).WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
        b.HasMany(x => x.Versions).WithOne(x => x.Station).HasForeignKey(x => x.StationId);
    }
}

internal sealed class StationVersionConfiguration : IEntityTypeConfiguration<StationVersion>
{
    public void Configure(EntityTypeBuilder<StationVersion> b)
    {
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Address).HasMaxLength(300);
        b.Property(x => x.District).HasMaxLength(100);
        b.Property(x => x.Neighbourhood).HasMaxLength(100);
        b.Property(x => x.Location).HasColumnType("geometry(Point,4326)");
        b.HasIndex(x => x.Location).HasMethod("gist");
        b.HasIndex(x => x.StationId).IsUnique().HasFilter("valid_to IS NULL")
            .HasDatabaseName("ix_station_versions_one_current_per_station");
        b.HasOne<IngestionRun>().WithMany().HasForeignKey(x => x.IngestionRunId).OnDelete(DeleteBehavior.Restrict);
        b.ToTable(t =>
        {
            t.HasCheckConstraint("ck_station_versions_capacity", "capacity IS NULL OR capacity >= 0");
            t.HasCheckConstraint("ck_station_versions_validity", "valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to");
        });
    }
}

internal sealed class StationObservationConfiguration : IEntityTypeConfiguration<StationObservation>
{
    public void Configure(EntityTypeBuilder<StationObservation> b)
    {
        // Clave de idempotencia: la estación y el instante que declara la fuente.
        // Volver a descargar el mismo dato no crea otra fila.
        b.HasIndex(x => new { x.StationId, x.ObservedAt }).IsUnique()
            .HasDatabaseName("ux_station_observations_station_observed_at");
        b.HasOne<Station>().WithMany().HasForeignKey(x => x.StationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<IngestionRun>().WithMany().HasForeignKey(x => x.IngestionRunId).OnDelete(DeleteBehavior.Restrict);
        b.Property(x => x.QualityFlags).HasDefaultValueSql("'{}'::text[]");
        b.ToTable(t =>
        {
            t.HasCheckConstraint("ck_station_observations_status", SnakeCaseEnum<ObservationStatus>.CheckSql("status"));
            t.HasCheckConstraint("ck_station_observations_counts",
                "(bikes_available IS NULL OR bikes_available >= 0) AND " +
                "(mechanical_bikes_available IS NULL OR mechanical_bikes_available >= 0) AND " +
                "(ebikes_available IS NULL OR ebikes_available >= 0) AND " +
                "(docks_available IS NULL OR docks_available >= 0) AND " +
                "(bikes_disabled IS NULL OR bikes_disabled >= 0) AND " +
                "(docks_disabled IS NULL OR docks_disabled >= 0)");
        });
    }
}
