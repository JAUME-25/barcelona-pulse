using System.Data.Common;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
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
            InputRef = Truncate(batch.InputRef, 500),
            InputSha256 = batch.InputSha256,
            Trigger = trigger,
            StartedAt = clock.GetUtcNow(),
            Status = IngestionStatus.Running,
            CoveredFrom = batch.Covers?.From,
            CoveredTo = batch.Covers?.To,
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
            await InsertObservationsAsync(batch, run, stations, rejections, tx, ct);

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

            run.Status = rejections.Count == 0 && run.ObservationsConflicting == 0
                ? IngestionStatus.Succeeded
                : IngestionStatus.SucceededWithIssues;
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
            "Ingesta {RunId} de {SourceId} ({Adapter} v{AdapterVersion}): {Status}. Estaciones {StationsReceived} recibidas, {StationsRejected} rechazadas, {VersionsCreated} versiones nuevas. Observaciones {ObservationsReceived} recibidas, {Accepted} nuevas, {Duplicates} ya existentes, {Conflicts} en conflicto, {ObservationsRejected} rechazadas",
            run.Id, run.SourceId, run.Adapter, run.AdapterVersion, run.Status, run.StationsReceived, run.StationsRejected,
            run.StationVersionsCreated, run.ObservationsReceived, run.ObservationsAccepted, run.ObservationsDuplicate,
            run.ObservationsConflicting, run.ObservationsRejected);
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

    /// <summary>
    /// Un lote puede traer varias publicaciones de la misma estación; se procesan en orden de
    /// tiempo y cada cambio de atributos abre una versión. Lo anterior a lo ya conocido
    /// completa la historia (ver FillInHistory).
    /// </summary>
    private async Task<Dictionary<string, Station>> UpsertStationsAsync(
        IngestionBatch batch, IngestionRun run, List<RejectedRecord> rejections, CancellationToken ct)
    {
        var stations = await db.Stations
            .Where(s => s.SourceId == batch.Source.Id)
            .Include(s => s.Versions)
            .ToDictionaryAsync(s => s.SourceStationId, StringComparer.Ordinal, ct);

        var current = new Dictionary<string, StationVersion>(StringComparer.Ordinal);
        var createdHere = new HashSet<string>(StringComparer.Ordinal);
        var pendingVersions = new List<(Station Station, StationVersion Version)>();

        foreach (var ns in batch.Stations.OrderBy(s => s.SourceStationId, StringComparer.Ordinal).ThenBy(s => s.SeenAt))
        {
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
                var first = NewVersion(ns, validFrom: null, run);
                station.Versions.Add(first);
                db.Stations.Add(station);
                stations[ns.SourceStationId] = station;
                current[ns.SourceStationId] = first;
                createdHere.Add(ns.SourceStationId);
                run.StationVersionsCreated++;
                continue;
            }

            var active = current.GetValueOrDefault(ns.SourceStationId) ?? station.Versions.Single(v => v.ValidTo is null);
            station.FirstSeenAt = Min(station.FirstSeenAt, ns.SeenAt);
            station.LastSeenAt = Max(station.LastSeenAt, ns.SeenAt);

            if (ns.SeenAt < active.FirstSeenAt)
            {
                // Publicación anterior a la versión vigente (importar un periodo antiguo después
                // de uno reciente): completa la historia en vez de descartarse.
                if (FillInHistory(station, ns, run, rejections))
                {
                    run.StationVersionsCreated++;
                }

                continue;
            }

            if (SameAttributes(active, ns))
            {
                continue;
            }

            if (ns.SeenAt == active.FirstSeenAt)
            {
                rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.DuplicateInBatch,
                    $"dos versiones distintas publicadas en {ns.SeenAt:O}"));
                continue;
            }

            active.ValidTo = ns.SeenAt;
            var next = NewVersion(ns, validFrom: ns.SeenAt, run);
            if (createdHere.Contains(ns.SourceStationId))
            {
                station.Versions.Add(next);
            }
            else
            {
                pendingVersions.Add((station, next));
            }

            current[ns.SourceStationId] = next;
            run.StationVersionsCreated++;
        }

        // Primero se cierran las versiones vigentes y después se abren las nuevas:
        // el índice único parcial solo admite una versión vigente por estación.
        await db.SaveChangesAsync(ct);
        foreach (var (station, version) in pendingVersions)
        {
            station.Versions.Add(version);
        }

        await db.SaveChangesAsync(ct);
        return stations;
    }

    /// <summary>
    /// Inserta en la historia una publicación anterior a la versión vigente. Devuelve si creó
    /// una versión. Solo añade versiones cerradas (con fin), así que no choca con el índice de
    /// una versión vigente por estación.
    /// </summary>
    private static bool FillInHistory(
        Station station, NormalizedStation ns, IngestionRun run, List<RejectedRecord> rejections)
    {
        var known = VersionAt(station, ns.SeenAt);
        if (known is null)
        {
            rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.MetadataOlderThanCurrent,
                $"ninguna versión cubre {ns.SeenAt:O}"));
            return false;
        }

        // Ya se sabía: reimportar un periodo conocido no crea nada.
        if (SameAttributes(known, ns))
        {
            return false;
        }

        if (ns.SeenAt < known.FirstSeenAt && known.ValidFrom is null)
        {
            // Antes de la primera publicación conocida. La que se suponía vigente hacia atrás
            // pasa a empezar cuando se vio por primera vez; la nueva ocupa lo anterior.
            var older = NewVersion(ns, validFrom: null, run);
            older.ValidTo = known.FirstSeenAt;
            known.ValidFrom = known.FirstSeenAt;
            station.Versions.Add(older);
            return true;
        }

        if (ns.SeenAt > known.FirstSeenAt && known.ValidTo is not null)
        {
            // Un cambio dentro de un tramo ya conocido: se parte en dos.
            var middle = NewVersion(ns, validFrom: ns.SeenAt, run);
            middle.ValidTo = known.ValidTo;
            known.ValidTo = ns.SeenAt;
            station.Versions.Add(middle);
            return true;
        }

        rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.DuplicateInBatch,
            $"dos versiones distintas publicadas en {ns.SeenAt:O}"));
        return false;
    }

    private sealed record ObservationRow(long StationId, NormalizedObservation Observation, string Flags);

    private async Task InsertObservationsAsync(
        IngestionBatch batch, IngestionRun run, Dictionary<string, Station> stations,
        List<RejectedRecord> rejections, IDbContextTransaction tx, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // Una fila por clave (estación, instante). Las repeticiones idénticas son duplicados;
        // si los valores difieren es un conflicto y se conserva la primera.
        var rows = new Dictionary<(long, DateTimeOffset), ObservationRow>();
        var duplicatesInBatch = 0;
        var conflictsInBatch = 0;

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

            var key = (station.Id, o.ObservedAt.ToUniversalTime());
            if (rows.TryGetValue(key, out var existing))
            {
                if (SameValues(existing.Observation, o)) duplicatesInBatch++;
                else conflictsInBatch++;
                continue;
            }

            var capacity = VersionAt(station, o.ObservedAt)?.Capacity;
            rows[key] = new ObservationRow(station.Id, o, string.Join(',', IngestionRules.FlagsFor(o, capacity)));
        }

        var inserted = 0;
        var conflictsWithStored = 0;
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        foreach (var chunk in rows.Values.Chunk(InsertChunkSize))
        {
            await using var command = new NpgsqlCommand(InsertObservationsSql, connection, (NpgsqlTransaction)tx.GetDbTransaction());
            command.Parameters.AddRange(BuildParameters(chunk, run, now));
            await using DbDataReader reader = await command.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            inserted += (int)reader.GetInt64(0);
            conflictsWithStored += (int)reader.GetInt64(1);
        }

        run.ObservationsAccepted = inserted;
        run.ObservationsConflicting = conflictsInBatch + conflictsWithStored;
        run.ObservationsDuplicate = duplicatesInBatch + (rows.Count - inserted - conflictsWithStored);
        if (rows.Count > 0)
        {
            run.PeriodFrom = rows.Values.Min(r => r.Observation.ObservedAt);
            run.PeriodTo = rows.Values.Max(r => r.Observation.ObservedAt);
        }
    }

    // ON CONFLICT DO NOTHING: si la clave ya existe se conserva la fila guardada. La segunda
    // columna cuenta las que ya existían con valores distintos (conflictos). El SELECT final no
    // ve las filas que inserta esta misma sentencia, así que solo compara con lo anterior.
    private const string InsertObservationsSql = """
        WITH input AS (
            SELECT * FROM unnest(@station_ids, @observed_ats, @statuses, @bikes, @mechanical, @ebikes,
                                 @docks, @bikes_disabled, @docks_disabled, @renting, @returning, @flags)
                AS t(station_id, observed_at, status, bikes, mechanical, ebikes,
                     docks, bikes_disabled, docks_disabled, can_rent, can_return, flags)
        ),
        inserted AS (
            INSERT INTO station_observations (
                station_id, observed_at, ingested_at, ingestion_run_id, status,
                bikes_available, mechanical_bikes_available, ebikes_available,
                docks_available, bikes_disabled, docks_disabled, is_renting, is_returning, quality_flags)
            SELECT i.station_id, i.observed_at, @ingested_at, @run_id, i.status,
                   i.bikes, i.mechanical, i.ebikes, i.docks, i.bikes_disabled, i.docks_disabled,
                   i.can_rent, i.can_return,
                   coalesce(string_to_array(nullif(i.flags, ''), ','), ARRAY[]::text[])
            FROM input i
            ON CONFLICT (station_id, observed_at) DO NOTHING
            RETURNING 1
        )
        SELECT
            (SELECT count(*) FROM inserted),
            (SELECT count(*)
             FROM input i
             JOIN station_observations o ON o.station_id = i.station_id AND o.observed_at = i.observed_at
             WHERE o.status IS DISTINCT FROM i.status
                OR o.bikes_available IS DISTINCT FROM i.bikes
                OR o.mechanical_bikes_available IS DISTINCT FROM i.mechanical
                OR o.ebikes_available IS DISTINCT FROM i.ebikes
                OR o.docks_available IS DISTINCT FROM i.docks
                OR o.bikes_disabled IS DISTINCT FROM i.bikes_disabled
                OR o.docks_disabled IS DISTINCT FROM i.docks_disabled
                OR o.is_renting IS DISTINCT FROM i.can_rent
                OR o.is_returning IS DISTINCT FROM i.can_return)
        """;

    private static NpgsqlParameter[] BuildParameters(ObservationRow[] chunk, IngestionRun run, DateTimeOffset now)
    {
        static NpgsqlParameter Ints(string name, IEnumerable<int?> values) =>
            new(name, NpgsqlDbType.Array | NpgsqlDbType.Integer) { Value = values.ToArray() };

        static NpgsqlParameter Bools(string name, IEnumerable<bool?> values) =>
            new(name, NpgsqlDbType.Array | NpgsqlDbType.Boolean) { Value = values.ToArray() };

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
            Bools("renting", obs.Select(o => o.IsRenting)),
            Bools("returning", obs.Select(o => o.IsReturning)),
            new("flags", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = chunk.Select(r => r.Flags).ToArray() },
        ];
    }

    internal static StationVersion? VersionAt(Station station, DateTimeOffset at) =>
        station.Versions.FirstOrDefault(v => (v.ValidFrom is null || v.ValidFrom <= at) && (v.ValidTo is null || v.ValidTo > at));

    private static StationVersion NewVersion(NormalizedStation ns, DateTimeOffset? validFrom, IngestionRun run) => new()
    {
        Name = ns.Name.Trim(),
        Address = Clean(ns.Address),
        District = Clean(ns.District),
        Neighbourhood = Clean(ns.Neighbourhood),
        Location = Geo.Point(ns.Longitude, ns.Latitude),
        Capacity = ns.Capacity,
        ValidFrom = validFrom,
        FirstSeenAt = ns.SeenAt,
        IngestionRunId = run.Id,
    };

    private static bool SameAttributes(StationVersion v, NormalizedStation ns) =>
        string.Equals(v.Name, ns.Name.Trim(), StringComparison.Ordinal)
        && string.Equals(v.Address, Clean(ns.Address), StringComparison.Ordinal)
        && string.Equals(v.District, Clean(ns.District), StringComparison.Ordinal)
        && string.Equals(v.Neighbourhood, Clean(ns.Neighbourhood), StringComparison.Ordinal)
        && v.Capacity == ns.Capacity
        && Math.Abs(v.Location.X - ns.Longitude) < CoordinateTolerance
        && Math.Abs(v.Location.Y - ns.Latitude) < CoordinateTolerance;

    private static bool SameValues(NormalizedObservation a, NormalizedObservation b) =>
        a with { SourceStationId = b.SourceStationId } == b;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;

    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
