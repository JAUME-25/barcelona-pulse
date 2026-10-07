using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BarcelonaPulse.Api.Features.Sources;

/// <summary>
/// Origen de unos datos de estaciones. Las observaciones reales y la demo sintética
/// nunca comparten fuente; los escenarios hipotéticos tendrán sus propias tablas (B4).
/// </summary>
public sealed class DataSource
{
    public required string Id { get; init; }
    public required SourceKind Kind { get; set; }
    public required string Name { get; set; }
    public required string Attribution { get; set; }
    public string? License { get; set; }
    public string? Url { get; set; }

    /// <summary>
    /// Antigüedad máxima de una observación para darla por vigente en un instante.
    /// Fuera de ella, el estado de la estación es desconocido.
    /// </summary>
    public required TimeSpan StalenessTolerance { get; set; }

    /// <summary>
    /// Observaciones guardadas. La ingesta suma las nuevas y la purga resta las borradas, en la
    /// misma transacción: así /api/sources no las cuenta en cada petición (ADR 0012).
    /// </summary>
    public long ObservationCount { get; set; }

    /// <summary>
    /// Cuántas purgas ha habido (ADR 0014). Una purga borra observaciones sin dejar ingesta
    /// nueva: este contador hace que cambie la versión de los datos de cualquier rango, y con
    /// ella las cachés y los ETag.
    /// </summary>
    public int PurgeGeneration { get; set; }
}

public enum SourceKind
{
    Observed,
    Synthetic,
}

internal sealed class DataSourceConfiguration : IEntityTypeConfiguration<DataSource>
{
    public void Configure(EntityTypeBuilder<DataSource> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasMaxLength(64);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Attribution).HasMaxLength(500);
        b.Property(x => x.License).HasMaxLength(200);
        b.Property(x => x.Url).HasMaxLength(500);
        b.ToTable(t =>
        {
            t.HasCheckConstraint("ck_data_sources_kind", SnakeCaseEnum<SourceKind>.CheckSql("kind"));
            t.HasCheckConstraint("ck_data_sources_tolerance", "staleness_tolerance > interval '0'");
        });
    }
}
