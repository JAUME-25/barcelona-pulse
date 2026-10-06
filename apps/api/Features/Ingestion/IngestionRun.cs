using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>Registro de cada ingesta: qué entró, de dónde, con qué adaptador y cómo acabó.</summary>
public sealed class IngestionRun
{
    public long Id { get; private set; }
    public required string SourceId { get; init; }
    public required string Adapter { get; init; }
    public required string AdapterVersion { get; init; }

    /// <summary>Referencia legible a la entrada: archivo, URL o recurso embebido.</summary>
    public required string InputRef { get; init; }
    public string? InputSha256 { get; init; }
    public required string Trigger { get; init; }

    public DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset? FinishedAt { get; set; }
    public IngestionStatus Status { get; set; }

    /// <summary>Rango de instantes observados en la entrada aceptada.</summary>
    public DateTimeOffset? PeriodFrom { get; set; }
    public DateTimeOffset? PeriodTo { get; set; }

    /// <summary>
    /// Periodo [desde, hasta) que dice cubrir la entrada (un día del histórico). Nulo en las
    /// ingestas anteriores a este dato: reimportar, que es idempotente, lo completa.
    /// </summary>
    public DateTimeOffset? CoveredFrom { get; init; }
    public DateTimeOffset? CoveredTo { get; init; }

    public int StationsReceived { get; set; }
    public int StationsRejected { get; set; }
    public int StationVersionsCreated { get; set; }
    public int ObservationsReceived { get; set; }
    public int ObservationsAccepted { get; set; }
    public int ObservationsDuplicate { get; set; }

    /// <summary>Misma estación e instante que otra ya vista, pero con valores distintos. Se conserva la primera.</summary>
    public int ObservationsConflicting { get; set; }

    public int ObservationsRejected { get; set; }
    public string? Error { get; set; }
}

public enum IngestionStatus
{
    Running,
    Succeeded,
    /// <summary>Terminada, pero con registros rechazados o en conflicto (ver recuentos).</summary>
    SucceededWithIssues,
    Failed,
}

/// <summary>Registro rechazado y su motivo. Se guarda un máximo por ingesta; el total va en el recuento.</summary>
public sealed class IngestionRejection
{
    public long Id { get; private set; }
    public long IngestionRunId { get; init; }
    public required string RecordKind { get; init; }
    public required string RecordRef { get; init; }
    public required string Reason { get; init; }
    public string? Detail { get; init; }
}

internal sealed class IngestionRunConfiguration : IEntityTypeConfiguration<IngestionRun>
{
    public void Configure(EntityTypeBuilder<IngestionRun> b)
    {
        b.Property(x => x.SourceId).HasMaxLength(64);
        b.Property(x => x.Adapter).HasMaxLength(100);
        b.Property(x => x.AdapterVersion).HasMaxLength(50);
        b.Property(x => x.InputRef).HasMaxLength(500);
        b.Property(x => x.InputSha256).HasMaxLength(64);
        b.Property(x => x.Trigger).HasMaxLength(50);
        b.Property(x => x.Error).HasMaxLength(2000);
        b.HasOne<DataSource>().WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.SourceId, x.StartedAt });
        b.ToTable(t =>
        {
            t.HasCheckConstraint("ck_ingestion_runs_status", SnakeCaseEnum<IngestionStatus>.CheckSql("status"));
            t.HasCheckConstraint("ck_ingestion_runs_covered",
                "(covered_from IS NULL AND covered_to IS NULL) OR covered_from < covered_to");
        });
    }
}

internal sealed class IngestionRejectionConfiguration : IEntityTypeConfiguration<IngestionRejection>
{
    public void Configure(EntityTypeBuilder<IngestionRejection> b)
    {
        b.Property(x => x.RecordKind).HasMaxLength(50);
        b.Property(x => x.RecordRef).HasMaxLength(200);
        b.Property(x => x.Reason).HasMaxLength(100);
        b.Property(x => x.Detail).HasMaxLength(500);
        b.HasOne<IngestionRun>().WithMany().HasForeignKey(x => x.IngestionRunId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => x.IngestionRunId);
    }
}
