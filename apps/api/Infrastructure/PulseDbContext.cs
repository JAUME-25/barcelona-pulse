using BarcelonaPulse.Api.Features.History;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Scenarios;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using Microsoft.EntityFrameworkCore;

namespace BarcelonaPulse.Api.Infrastructure;

public sealed class PulseDbContext(DbContextOptions<PulseDbContext> options) : DbContext(options)
{
    public DbSet<DataSource> DataSources => Set<DataSource>();
    public DbSet<Station> Stations => Set<Station>();
    public DbSet<StationVersion> StationVersions => Set<StationVersion>();
    public DbSet<StationObservation> StationObservations => Set<StationObservation>();
    public DbSet<IngestionRun> IngestionRuns => Set<IngestionRun>();
    public DbSet<IngestionRejection> IngestionRejections => Set<IngestionRejection>();
    public DbSet<StudyArea> StudyAreas => Set<StudyArea>();
    public DbSet<TimelineSummary> TimelineSummaries => Set<TimelineSummary>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PulseDbContext).Assembly);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<SourceKind>().HaveConversion<SnakeCaseEnumConverter<SourceKind>>().HaveMaxLength(32);
        configurationBuilder.Properties<ObservationStatus>().HaveConversion<SnakeCaseEnumConverter<ObservationStatus>>().HaveMaxLength(32);
        configurationBuilder.Properties<IngestionStatus>().HaveConversion<SnakeCaseEnumConverter<IngestionStatus>>().HaveMaxLength(32);
        configurationBuilder.Properties<StudyAreaKind>().HaveConversion<SnakeCaseEnumConverter<StudyAreaKind>>().HaveMaxLength(32);
    }
}
