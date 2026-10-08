using System.Data.Common;
using BarcelonaPulse.Api.Features.History;
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
            if (run.PeriodFrom is { } periodFrom && run.PeriodTo is { } periodTo)
            {
                // El resumen de la línea temporal (ADR 0015), en la misma transacción: los pasos que
                // tocan las observaciones nuevas. Sin filas nuevas no cambia nada.
                await TimelineSummaries.RefreshAsync(db, batch.Source.Id, batch.Source.StalenessTolerance, periodFrom, periodTo, ct);
            }

            // El recuento de la fuente se lleva aquí, en la misma transacción (ADR 0012).
            await db.DataSources.Where(s => s.Id == batch.Source.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.ObservationCount, x => x.ObservationCount + run.ObservationsAccepted), ct);

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

    /// <summary>
    /// Deja constancia de una ingesta que no llegó a empezar (la descarga falló): una ejecución
    /// fallida con su error, para que el registro de ingestas cuente también los intentos.
    /// </summary>
    public async Task<IngestionRun> RecordFailureAsync(
        SourceDescriptor source, string adapter, string adapterVersion, string inputRef, string trigger,
        string error, CancellationToken ct)
    {
        await UpsertSourceAsync(source, ct);
        var now = clock.GetUtcNow();
        var run = new IngestionRun
        {
            SourceId = source.Id,
            Adapter = adapter,
            AdapterVersion = adapterVersion,
            InputRef = Truncate(inputRef, 500),
            Trigger = trigger,
            StartedAt = now,
            FinishedAt = now,
            Status = IngestionStatus.Failed,
            Error = Truncate(error, 2000),
        };
        db.IngestionRuns.Add(run);
        await db.SaveChangesAsync(ct);
        logger.LogWarning("Ingesta de {SourceId} fallida antes de empezar: {Error}", source.Id, run.Error);
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
        // Periodos ya importados (terminados y sin purgar): un cambio que llega fuera de orden no
        // se alarga sobre lo que ellos publicaron.
        var imported = await db.IngestionRuns
            .Where(r => r.SourceId == batch.Source.Id && r.Id != run.Id && r.PurgedAt == null
                && (r.Status == IngestionStatus.Succeeded || r.Status == IngestionStatus.SucceededWithIssues)
                && r.CoveredFrom != null && r.CoveredTo != null)
            .Select(r => new CoveredPeriod(r.CoveredFrom!.Value, r.CoveredTo!.Value))
            .ToListAsync(ct);

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
            // Lo último que se sabía de la estación: una publicación anterior viene de un periodo
            // importado fuera de orden.
            var latestKnown = station.LastSeenAt;
            station.FirstSeenAt = Min(station.FirstSeenAt, ns.SeenAt);
            station.LastSeenAt = Max(station.LastSeenAt, ns.SeenAt);

            if (ns.SeenAt < active.FirstSeenAt || ns.SeenAt < latestKnown)
            {
                // Importar un periodo antiguo o intermedio después de uno reciente: completa la
                // historia en vez de descartarse o de cambiar lo que ya se conocía después.
                run.StationVersionsCreated += FillInHistory(
                    station, ns, latestKnown, batch.Covers, imported, run, rejections);
                continue;
            }

            if (SameAttributes(active, ns))
            {
                FillAltitude(active, ns);
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
    /// Inserta en la historia una publicación anterior a lo último que se sabía de la estación.
    /// Devuelve cuántas versiones creó. Solo añade versiones cerradas (con fin), así que no choca
    /// con el índice de una versión vigente por estación.
    /// </summary>
    private static int FillInHistory(
        Station station, NormalizedStation ns, DateTimeOffset latestKnown, CoveredPeriod? covers,
        IReadOnlyList<CoveredPeriod> imported, IngestionRun run, List<RejectedRecord> rejections)
    {
        var known = VersionAt(station, ns.SeenAt);
        if (known is null)
        {
            rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.MetadataOlderThanCurrent,
                $"ninguna versión cubre {ns.SeenAt:O}"));
            return 0;
        }

        // Ya se sabía: reimportar un periodo conocido no crea nada. Si es anterior a la primera
        // vez que se vio, ahora se sabe desde antes: lo que llegue después, aún más antiguo y
        // distinto, acabará aquí y no donde se vio por primera vez.
        if (SameAttributes(known, ns))
        {
            FillAltitude(known, ns);
            if (ns.SeenAt < known.FirstSeenAt)
            {
                known.FirstSeenAt = ns.SeenAt;
            }

            return 0;
        }

        // El periodo anterior acabó con estos mismos atributos y este empieza en la vuelta a los
        // de antes que se supuso entonces: no se vuelve atrás a medianoche (quedaban unos minutos
        // con los atributos viejos, o el día se rechazaba si publicaba a las 00:00 en punto).
        if (covers is not null && known.ValidFrom == covers.From
            && station.Versions.FirstOrDefault(v => v.ValidTo == covers.From) is { } previous
            && SameAttributes(previous, ns))
        {
            FillAltitude(previous, ns);
            ContinuePrevious(station, previous, known, ns, latestKnown, covers, imported, rejections);
            return 0;
        }

        if (ns.SeenAt < known.FirstSeenAt && known.ValidFrom is null)
        {
            // Antes de la primera publicación conocida. La que se suponía vigente hacia atrás
            // pasa a empezar cuando se vio por primera vez; la nueva ocupa lo anterior.
            var older = NewVersion(ns, validFrom: null, run);
            older.ValidTo = known.FirstSeenAt;
            known.ValidFrom = known.FirstSeenAt;
            station.Versions.Add(older);
            return 1;
        }

        if (ns.SeenAt > known.FirstSeenAt)
        {
            return SplitKnownSpan(station, known, ns, latestKnown, covers, imported, run, rejections);
        }

        rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.DuplicateInBatch,
            $"dos versiones distintas publicadas en {ns.SeenAt:O}"));
        return 0;
    }

    /// <summary>
    /// Un cambio dentro de un tramo ya conocido, publicado en un periodo que no se había
    /// importado. Dura hasta el final de ese periodo (lo que el lote dice cubrir); después siguen
    /// los atributos de antes, que se vieron más tarde. Un lote sin periodo deja el cambio hasta
    /// el final del tramo si está cerrado; dentro de la versión vigente no se puede acotar y se
    /// rechaza en vez de cambiar lo que ya se conocía después.
    /// </summary>
    private static int SplitKnownSpan(
        Station station, StationVersion known, NormalizedStation ns, DateTimeOffset latestKnown,
        CoveredPeriod? covers, IReadOnlyList<CoveredPeriod> imported, IngestionRun run, List<RejectedRecord> rejections)
    {
        var periodEnd = covers is { } c && c.To > ns.SeenAt ? c.To : (DateTimeOffset?)null;

        if (known.ValidTo is { } spanEnd)
        {
            var end = ChangeEnd(station, ns, periodEnd, spanEnd, imported);
            var middle = NewVersion(ns, validFrom: ns.SeenAt, run);
            middle.ValidTo = end;
            known.ValidTo = ns.SeenAt;
            station.Versions.Add(middle);
            if (end == spanEnd)
            {
                return 1;
            }

            station.Versions.Add(CopyOf(known, validFrom: end, validTo: spanEnd, firstSeenAt: end));
            return 2;
        }

        // La vigente: se sabe que seguía así en latestKnown, después del periodo importado.
        if (periodEnd is not { } resume || resume > latestKnown)
        {
            rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.MetadataInsideKnownPeriod,
                $"cambio en {ns.SeenAt:O} dentro de la versión vigente, sin un periodo que lo acote"));
            return 0;
        }

        var before = CopyOf(known, validFrom: known.ValidFrom, validTo: ns.SeenAt, firstSeenAt: known.FirstSeenAt);
        var change = NewVersion(ns, validFrom: ns.SeenAt, run);
        change.ValidTo = resume;
        known.ValidFrom = resume;
        known.FirstSeenAt = resume;
        station.Versions.Add(before);
        station.Versions.Add(change);
        return 2;
    }

    /// <summary>
    /// Lo publicado al acabar el periodo anterior sigue al empezar este (ver FillInHistory): ese
    /// tramo se alarga hasta el final de este periodo y la vuelta a los atributos de antes se
    /// corre hasta ahí. Con la vigente, solo si se sabe que seguía así después (latestKnown).
    /// </summary>
    private static void ContinuePrevious(
        Station station, StationVersion previous, StationVersion known, NormalizedStation ns,
        DateTimeOffset latestKnown, CoveredPeriod covers, IReadOnlyList<CoveredPeriod> imported,
        List<RejectedRecord> rejections)
    {
        if (known.ValidTo is { } spanEnd)
        {
            var end = ChangeEnd(station, ns, covers.To, spanEnd, imported);
            previous.ValidTo = end;
            if (end == spanEnd)
            {
                // Todo lo que se suponía queda bajo lo que se ha visto: el tramo sobra.
                station.Versions.Remove(known);
            }
            else
            {
                known.ValidFrom = end;
                known.FirstSeenAt = end;
            }

            return;
        }

        if (covers.To > latestKnown)
        {
            rejections.Add(new(RecordKinds.Station, ns.SourceStationId, RejectionReasons.MetadataInsideKnownPeriod,
                $"cambio en {ns.SeenAt:O} dentro de la versión vigente, sin un periodo que lo acote"));
            return;
        }

        previous.ValidTo = covers.To;
        known.ValidFrom = covers.To;
        known.FirstSeenAt = covers.To;
    }

    /// <summary>
    /// Hasta dónde dura un cambio que llega dentro de un tramo cerrado: hasta el final del periodo
    /// del lote, y después vuelve lo que ya se sabía. Pero si lo siguiente que se sabe (la versión
    /// que empieza en <paramref name="spanEnd"/>) ya tiene estos atributos y entre medias no hay
    /// nada importado, el cambio llega hasta ahí: suponer que se volvió a lo de antes no tiene
    /// ningún dato a favor y dejaba los atributos viejos en días ya importados.
    /// </summary>
    private static DateTimeOffset ChangeEnd(
        Station station, NormalizedStation ns, DateTimeOffset? periodEnd, DateTimeOffset spanEnd,
        IReadOnlyList<CoveredPeriod> imported)
    {
        if (periodEnd is not { } end || end >= spanEnd) return spanEnd;
        var next = station.Versions.FirstOrDefault(v => v.ValidFrom == spanEnd);
        if (next is null || !SameAttributes(next, ns)) return end;
        // Un periodo importado que empieza justo antes de spanEnd no cuenta: su primera
        // publicación (unos minutos después de medianoche) es la que abrió esa versión.
        var seenInBetween = imported.Any(p => p.To > end && p.From < spanEnd - FirstPublicationSlack);
        return seenInBetween ? end : spanEnd;
    }

    /// <summary>Lo que puede tardar la primera publicación de un periodo importado.</summary>
    private static readonly TimeSpan FirstPublicationSlack = TimeSpan.FromMinutes(30);

    /// <summary>Los mismos atributos en otro tramo, con la ingesta que los trajo.</summary>
    private static StationVersion CopyOf(
        StationVersion v, DateTimeOffset? validFrom, DateTimeOffset validTo, DateTimeOffset firstSeenAt)
    {
        return new()
        {
            Name = v.Name,
            Address = v.Address,
            District = v.District,
            Neighbourhood = v.Neighbourhood,
            Location = Geo.Point(v.Location.X, v.Location.Y),
            Capacity = v.Capacity,
            Altitude = v.Altitude,
            ValidFrom = validFrom,
            ValidTo = validTo,
            FirstSeenAt = firstSeenAt,
            IngestionRunId = v.IngestionRunId,
        };
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
        DateTimeOffset? periodFrom = null;
        DateTimeOffset? periodTo = null;
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        foreach (var chunk in rows.Values.Chunk(InsertChunkSize))
        {
            await using var command = new NpgsqlCommand(InsertObservationsSql, connection, (NpgsqlTransaction)tx.GetDbTransaction());
            command.Parameters.AddRange(BuildParameters(chunk, run, now));
            await using DbDataReader reader = await command.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            inserted += (int)reader.GetInt64(0);
            conflictsWithStored += (int)reader.GetInt64(1);
            if (!reader.IsDBNull(2))
            {
                var from = reader.GetFieldValue<DateTimeOffset>(2);
                var to = reader.GetFieldValue<DateTimeOffset>(3);
                if (periodFrom is null || from < periodFrom) periodFrom = from;
                if (periodTo is null || to > periodTo) periodTo = to;
            }
        }

        run.ObservationsAccepted = inserted;
        run.ObservationsConflicting = conflictsInBatch + conflictsWithStored;
        run.ObservationsDuplicate = duplicatesInBatch + (rows.Count - inserted - conflictsWithStored);
        // El periodo es el de las observaciones nuevas, no el de todo el lote: el histórico repite
        // en cada archivo el `last_reported` de una estación que no informa desde 2025, y con él
        // todas las ingestas «tocaban» cualquier rango y la versión de los datos (ADR 0014) no
        // acotaba nada. Lo repetido o en conflicto no cambia nada guardado.
        run.PeriodFrom = periodFrom;
        run.PeriodTo = periodTo;
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
            RETURNING observed_at
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
                OR o.is_returning IS DISTINCT FROM i.can_return),
            (SELECT min(observed_at) FROM inserted),
            (SELECT max(observed_at) FROM inserted)
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
        Altitude = ns.Altitude,
        ValidFrom = validFrom,
        FirstSeenAt = ns.SeenAt,
        IngestionRunId = run.Id,
    };

    /// <summary>
    /// Los mismos atributos. La altitud cuenta solo si las dos partes la publican: una versión
    /// guardada sin ella (importada antes de leerla del archivo) sigue siendo la misma estación.
    /// </summary>
    private static bool SameAttributes(StationVersion v, NormalizedStation ns) =>
        string.Equals(v.Name, ns.Name.Trim(), StringComparison.Ordinal)
        && string.Equals(v.Address, Clean(ns.Address), StringComparison.Ordinal)
        && string.Equals(v.District, Clean(ns.District), StringComparison.Ordinal)
        && string.Equals(v.Neighbourhood, Clean(ns.Neighbourhood), StringComparison.Ordinal)
        && v.Capacity == ns.Capacity
        && Math.Abs(v.Location.X - ns.Longitude) < CoordinateTolerance
        && Math.Abs(v.Location.Y - ns.Latitude) < CoordinateTolerance
        && (v.Altitude is null || ns.Altitude is null || Math.Abs(v.Altitude.Value - ns.Altitude.Value) < AltitudeTolerance);

    /// <summary>Metros por debajo de los cuales dos altitudes son la misma (el archivo las publica enteras).</summary>
    private const double AltitudeTolerance = 0.5;

    /// <summary>
    /// Una versión guardada sin altitud la toma de una publicación con los mismos atributos: la
    /// altitud del sitio no cambia, solo se conoce más tarde (reimportar un día la completa).
    /// </summary>
    private static void FillAltitude(StationVersion v, NormalizedStation ns)
    {
        if (v.Altitude is null && ns.Altitude is not null) v.Altitude = ns.Altitude;
    }

    private static bool SameValues(NormalizedObservation a, NormalizedObservation b) =>
        a with { SourceStationId = b.SourceStationId } == b;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;

    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
