using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.Ingestion;

/// <summary>
/// Persiste un lote normalizado. Repetir el mismo lote no duplica nada:
/// las estaciones se identifican por (fuente, id de origen), las versiones solo se
/// crean si cambian los atributos y las observaciones por (estación, instante observado).
/// </summary>
public sealed class StationIngestor(PulseDbContext db, TimeProvider clock, ILogger<StationIngestor> logger)
{
    internal const int MaxStoredRejections = 1000;
    private const int InsertChunkSize = 5000;
    private const double CoordinateTolerance = 1e-7; // ~1 cm

    public async Task<IngestionRun> IngestAsync(IngestionBatch batch, string trigger, CancellationToken ct)
    {
        await UpsertSourceAsync(batch.Source, ct);

        var run = new IngestionRun
        {
            SourceId = batch.Source.Id,
            Adapter = batch.Adapter,
            AdapterVersion = batch.AdapterVersion,
            InputRef = batch.InputRef,
            InputSha256 = batch.InputSha256,
            Trigger = trigger,
            StartedAt = clock.GetUtcNow(),
            Status = IngestionStatus.Running,
            StationsReceived = batch.Stations.Count + batch.Rejected.Count(r => r.RecordKind == RecordKinds.Station),
            ObservationsReceived = batch.Observations.Count + batch.Rejected.Count(r => r.RecordKind == RecordKinds.Observation),
        };
        db.IngestionRuns.Add(run);
        await db.SaveChangesAsync(ct);

        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Una sola ingesta a la vez por fuente.
            await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtext({batch.Source.Id}))", ct);

            var rejections = new List<RejectedRecord>(batch.Rejected);
            var stations = await UpsertStationsAsync(batch, run, rejections, ct);
            await InsertObservationsAsync(batch, run, stations, rejections, ct);

            run.StationsRejected = rejections.Count(r => r.RecordKind == RecordKinds.Station);
            run.ObservationsRejected = rejections.Count(r => r.RecordKind == RecordKinds.Observation);
            db.IngestionRejections.AddRange(rejections.Take(MaxStoredRejections).Select(r => new IngestionRejection
            {
                IngestionRunId = run.Id,
                RecordKind = r.RecordKind,
                RecordRef = Truncate(r.RecordRef, 200),
                Reason = r.Reason,
                Detail = r.Detail is null ? null : Truncate(r.Detail, 500),
            }));

            run.Status = rejections.Count == 0 ? IngestionStatus.Succeeded : IngestionStatus.SucceededWithRejections;
            run.FinishedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            db.ChangeTracker.Clear();
            var error = ex is OperationCanceledException ? "Cancelada" : Truncate($"{ex.GetType().Name}: {ex.Message}", 2000);
            await db.IngestionRuns.Where(r => r.Id == run.Id).ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, IngestionStatus.Failed)
                .SetProperty(r => r.FinishedAt, clock.GetUtcNow())
                .SetProperty(r => r.Error, error), CancellationToken.None);
            logger.LogError(ex, "Ingesta {RunId} de {SourceId} fallida", run.Id, run.SourceId);
            throw;
        }

        logger.LogInformation(
            "Ingesta {RunId} de {SourceId} ({Adapter} v{AdapterVersion}): {Status}. Estaciones {StationsReceived} recibidas, {StationsRejected} rechazadas, {VersionsCreated} versiones nuevas. Observaciones {ObservationsReceived} recibidas, {Accepted} aceptadas, {Duplicates} duplicadas, {ObservationsRejected} rechazadas",
            run.Id, run.SourceId, run.Adapter, run.AdapterVersion, run.Status, run.StationsReceived, run.StationsRejected,
            run.StationVersionsCreated, run.ObservationsReceived, run.ObservationsAccepted, run.ObservationsDuplicate,
            run.ObservationsRejected);
        return run;
    }

    private async Task UpsertSourceAsync(SourceDescriptor d, CancellationToken ct)
    {
        var source = await db.DataSources.FindAsync([d.Id], ct);
        if (source is null)
        {
            db.DataSources.Add(new DataSource
            {
                Id = d.Id,
                Kind = d.Kind,
                Name = d.Name,
                Attribution = d.Attribution,
                License = d.License,
                Url = d.Url,
                StalenessTolerance = d.StalenessTolerance,
            });
        }
        else if (source.Kind != d.Kind)
        {
            // Una fuente nunca pasa de sintética a observada ni al revés.
            throw new InvalidOperationException(
                $"La fuente '{d.Id}' es {SnakeCaseEnum<SourceKind>.Name(source.Kind)} y el lote dice {SnakeCaseEnum<SourceKind>.Name(d.Kind)}.");
        }
        else
        {
            source.Name = d.Name;
            source.Attribution = d.Attribution;
            source.License = d.License;
            source.Url = d.Url;
            source.StalenessTolerance = d.StalenessTolerance;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task<Dictionary<string, Station>> UpsertStationsAsync(
        IngestionBatch batch, IngestionRun run, List<RejectedRecord> rejections, CancellationToken ct)
    {
        var stations = await db.Stations
            .Where(s => s.SourceId == batch.Source.Id)
            .Include(s => s.Versions)
            .ToDictionaryAsync(s => s.SourceStationId, StringComparer.Ordinal, ct);

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var pendingVersions = new List<(Station Station, StationVersion Version)>();

        foreach (var ns in batch.Stations)
        {
            if (!seen.Add(ns.SourceStationId))
            {
                rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.DuplicateInBatch));
                continue;
            }

            if (IngestionRules.CheckStation(ns) is { } rejected)
            {
                rejections.Add(rejected);
                continue;
            }

            if (!stations.TryGetValue(ns.SourceStationId, out var station))
            {
                station = new Station
                {
                    SourceId = batch.Source.Id,
                    SourceStationId = ns.SourceStationId,
                    FirstSeenAt = ns.SeenAt,
                    LastSeenAt = ns.SeenAt,
                };
                station.Versions.Add(NewVersion(ns, validFrom: null, run));
                db.Stations.Add(station);
                stations[ns.SourceStationId] = station;
                run.StationVersionsCreated++;
                continue;
            }

            var current = station.Versions.Single(v => v.ValidTo is null);
            if (SameAttributes(current, ns))
            {
                station.LastSeenAt = Max(station.LastSeenAt, ns.SeenAt);
                continue;
            }

            if (ns.SeenAt <= current.FirstSeenAt)
            {
                rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.MetadataOlderThanCurrent,
                    $"seenAt={ns.SeenAt:O}, vigente desde {current.FirstSeenAt:O}"));
                continue;
            }

            current.ValidTo = ns.SeenAt;
            station.LastSeenAt = Max(station.LastSeenAt, ns.SeenAt);
            pendingVersions.Add((station, NewVersion(ns, validFrom: ns.SeenAt, run)));
        }

        // Primero se cierran las versiones vigentes y después se abren las nuevas:
        // el índice único parcial solo admite una versión vigente por estación.
        await db.SaveChangesAsync(ct);
        foreach (var (station, version) in pendingVersions)
        {
            station.Versions.Add(version);
            run.StationVersionsCreated++;
        }

        await db.SaveChangesAsync(ct);
        return stations;
    }

    private async Task InsertObservationsAsync(
        IngestionBatch batch, IngestionRun run, Dictionary<string, Station> stations,
        List<RejectedRecord> rejections, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rows = new List<(long StationId, NormalizedObservation Observation, string Flags)>(batch.Observations.Count);

        foreach (var o in batch.Observations)
        {
            if (!stations.TryGetValue(o.SourceStationId, out var station) || station.Id == 0)
            {
                rejections.Add(new(RecordKinds.Observation,
                    IngestionRules.ObservationRef(o.SourceStationId, o.ObservedAt), RejectionReasons.UnknownStation));
                continue;
            }

            if (IngestionRules.CheckObservation(o, now) is { } rejected)
            {
                rejections.Add(rejected);
                continue;
            }

            var capacity = VersionAt(station, o.ObservedAt)?.Capacity;
            rows.Add((station.Id, o, string.Join(',', IngestionRules.FlagsFor(o, capacity))));
        }

        var inserted = 0;
        foreach (var chunk in rows.Chunk(InsertChunkSize))
        {
            inserted += await db.Database.ExecuteSqlRawAsync(InsertObservationsSql, BuildParameters(chunk, run, now), ct);
        }

        run.ObservationsAccepted = inserted;
        run.ObservationsDuplicate = rows.Count - inserted;
        if (rows.Count > 0)
        {
            run.PeriodFrom = rows.Min(r => r.Observation.ObservedAt);
            run.PeriodTo = rows.Max(r => r.Observation.ObservedAt);
        }
    }

    // ON CONFLICT DO NOTHING: una observación con la misma clave ya guardada (o repetida
    // en el mismo lote) se cuenta como duplicada y se conserva la primera.
    // Sin llaves literales: ExecuteSqlRaw trata el texto como cadena de formato.
    private const string InsertObservationsSql = """
        INSERT INTO station_observations (
            station_id, observed_at, ingested_at, ingestion_run_id, status,
            bikes_available, mechanical_bikes_available, ebikes_available,
            docks_available, bikes_disabled, docks_disabled, quality_flags)
        SELECT t.station_id, t.observed_at, @ingested_at, @run_id, t.status,
               t.bikes, t.mechanical, t.ebikes, t.docks, t.bikes_disabled, t.docks_disabled,
               coalesce(string_to_array(nullif(t.flags, ''), ','), ARRAY[]::text[])
        FROM unnest(@station_ids, @observed_ats, @statuses, @bikes, @mechanical, @ebikes,
                    @docks, @bikes_disabled, @docks_disabled, @flags)
             AS t(station_id, observed_at, status, bikes, mechanical, ebikes,
                  docks, bikes_disabled, docks_disabled, flags)
        ON CONFLICT (station_id, observed_at) DO NOTHING
        """;

    private static NpgsqlParameter[] BuildParameters(
        (long StationId, NormalizedObservation Observation, string Flags)[] chunk, IngestionRun run, DateTimeOffset now)
    {
        static NpgsqlParameter Ints(string name, IEnumerable<int?> values) =>
            new(name, NpgsqlDbType.Array | NpgsqlDbType.Integer) { Value = values.ToArray() };

        var obs = chunk.Select(r => r.Observation).ToArray();
        return
        [
            new("ingested_at", NpgsqlDbType.TimestampTz) { Value = now },
            new("run_id", NpgsqlDbType.Bigint) { Value = run.Id },
            new("station_ids", NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = chunk.Select(r => r.StationId).ToArray() },
            new("observed_ats", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = obs.Select(o => o.ObservedAt.ToUniversalTime()).ToArray() },
            new("statuses", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = obs.Select(o => SnakeCaseEnum<ObservationStatus>.Name(o.Status)).ToArray() },
            Ints("bikes", obs.Select(o => o.BikesAvailable)),
            Ints("mechanical", obs.Select(o => o.MechanicalBikesAvailable)),
            Ints("ebikes", obs.Select(o => o.EbikesAvailable)),
            Ints("docks", obs.Select(o => o.DocksAvailable)),
            Ints("bikes_disabled", obs.Select(o => o.BikesDisabled)),
            Ints("docks_disabled", obs.Select(o => o.DocksDisabled)),
            new("flags", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = chunk.Select(r => r.Flags).ToArray() },
        ];
    }

    internal static StationVersion? VersionAt(Station station, DateTimeOffset at) =>
        station.Versions.FirstOrDefault(v => (v.ValidFrom is null || v.ValidFrom <= at) && (v.ValidTo is null || v.ValidTo > at));

    private static StationVersion NewVersion(NormalizedStation ns, DateTimeOffset? validFrom, IngestionRun run) => new()
    {
        Name = ns.Name.Trim(),
        Address = string.IsNullOrWhiteSpace(ns.Address) ? null : ns.Address.Trim(),
        Location = Geo.Point(ns.Longitude, ns.Latitude),
        Capacity = ns.Capacity,
        ValidFrom = validFrom,
        FirstSeenAt = ns.SeenAt,
        IngestionRunId = run.Id,
    };

    private static bool SameAttributes(StationVersion v, NormalizedStation ns) =>
        string.Equals(v.Name, ns.Name.Trim(), StringComparison.Ordinal)
        && string.Equals(v.Address, string.IsNullOrWhiteSpace(ns.Address) ? null : ns.Address.Trim(), StringComparison.Ordinal)
        && v.Capacity == ns.Capacity
        && Math.Abs(v.Location.X - ns.Longitude) < CoordinateTolerance
        && Math.Abs(v.Location.Y - ns.Latitude) < CoordinateTolerance;

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
