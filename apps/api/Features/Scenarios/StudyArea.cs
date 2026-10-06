using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NetTopologySuite.Geometries;

namespace BarcelonaPulse.Api.Features.Scenarios;

/// <summary>
/// Área de estudio declarada para la cobertura (B4): el denominador de cualquier porcentaje. Se
/// guarda en EPSG:25831, como la publica el Ajuntament y como se mide (ADR 0004).
/// </summary>
public sealed class StudyArea
{
    /// <summary>«barcelona» o «districte-01» … «districte-10».</summary>
    public required string Id { get; init; }
    public required string Name { get; set; }
    public required StudyAreaKind Kind { get; set; }

    /// <summary>Polígono en EPSG:25831 (metros).</summary>
    public required MultiPolygon Geometry { get; set; }

    public double AreaSquareMeters { get; set; }

    /// <summary>De dónde sale: conjunto de datos y recurso.</summary>
    public required string Source { get; set; }
    public required string Attribution { get; set; }
    public string? License { get; set; }

    /// <summary>Cómo se ha construido, si no es tal cual (p. ej. la unión de los distritos).</summary>
    public string? Note { get; set; }

    public required string InputSha256 { get; set; }
    public DateTimeOffset LoadedAt { get; set; }
}

public enum StudyAreaKind
{
    Municipality,
    District,
}

internal sealed class StudyAreaConfiguration : IEntityTypeConfiguration<StudyArea>
{
    public void Configure(EntityTypeBuilder<StudyArea> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasMaxLength(64);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Geometry).HasColumnType("geometry(MultiPolygon,25831)");
        b.Property(x => x.Source).HasMaxLength(500);
        b.Property(x => x.Attribution).HasMaxLength(500);
        b.Property(x => x.License).HasMaxLength(100);
        b.Property(x => x.Note).HasMaxLength(500);
        b.Property(x => x.InputSha256).HasMaxLength(64);
        b.ToTable(t => t.HasCheckConstraint("ck_study_areas_kind", SnakeCaseEnum<StudyAreaKind>.CheckSql("kind")));
    }
}
