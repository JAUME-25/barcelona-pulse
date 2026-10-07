using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.History;

/// <summary>Atributos de una estación durante la ventana: una entrada por versión vigente en algún paso.</summary>
/// <param name="Id">Identificador interno de la estación (el mismo en todas sus versiones).</param>
/// <param name="SourceStationId">Identificador tal como lo publica la fuente.</param>
/// <param name="Name">Nombre publicado por la fuente.</param>
/// <param name="Address">Dirección, si la fuente la publica.</param>
/// <param name="District">Distrito, si la fuente lo publica.</param>
/// <param name="Neighbourhood">Barrio, si la fuente lo publica.</param>
/// <param name="Longitude">Longitud WGS84.</param>
/// <param name="Latitude">Latitud WGS84.</param>
/// <param name="Capacity">Capacidad publicada; nula si la fuente no la da.</param>
/// <param name="Altitude">Altitud en metros publicada por la fuente; nula si no la da.</param>
/// <param name="AssumedUntil">
/// Si es la primera versión conocida, cuándo se publicó: en los pasos anteriores sus atributos se
/// asumen (lo mismo que <c>metadataAssumed</c> en GET /api/stations). Nulo en las demás.
/// </param>
public sealed record FrameStation(
    long Id,
    string SourceStationId,
    string Name,
    string? Address,
    string? District,
    string? Neighbourhood,
    double Longitude,
    double Latitude,
    int? Capacity,
    double? Altitude,
    DateTimeOffset? AssumedUntil);

/// <summary>Estado de una estación en un paso.</summary>
/// <param name="Station">Posición de la estación en <c>stations</c>.</param>
/// <param name="State">Estado en ese instante, con la misma regla que GET /api/stations.</param>
public sealed record FrameState(int Station, StationState State);

/// <summary>Un paso: las estaciones con versión vigente en ese instante y su estado.</summary>
public sealed record Frame(DateTimeOffset At, IReadOnlyList<FrameState> States);

/// <summary>Fotogramas seguidos de una fuente.</summary>
/// <param name="Source">Fuente consultada, con su tipo.</param>
/// <param name="From">Primer paso, alineado a la rejilla (UTC).</param>
/// <param name="StepMinutes">Minutos entre pasos.</param>
/// <param name="ToleranceMinutes">Antigüedad máxima de una observación para contar como dato.</param>
/// <param name="Truncated">Si había más estaciones que el máximo por respuesta.</param>
/// <param name="Stations">Atributos de las estaciones, una vez para todos los pasos.</param>
/// <param name="Frames">Los pasos, en orden.</param>
public sealed record FramesResponse(
    SourceRef Source,
    DateTimeOffset From,
    int StepMinutes,
    int ToleranceMinutes,
    bool Truncated,
    IReadOnlyList<FrameStation> Stations,
    IReadOnlyList<Frame> Frames);

/// <summary>
/// El estado de todas las estaciones de una fuente en <see cref="FramesPerResponse"/> pasos
/// seguidos: con pasos de 5 min, una hora por petición. Así la reproducción no hace una petición
/// por paso ni choca con el límite de la API. Cada estado sale de <see cref="StationStateRules"/>,
/// la misma regla que GET /api/stations?at=… (ADR 0005).
/// </summary>
public static class FramesQuery
{
    public const int FramesPerResponse = 12;

    private const string VersionsSql = """
        SELECT v.station_id, s.source_station_id, v.name, v.address, v.district, v.neighbourhood,
               ST_X(v.location), ST_Y(v.location), v.capacity, v.valid_from, v.valid_to, v.first_seen_at,
               v.altitude
        FROM station_versions v
        JOIN stations s ON s.id = v.station_id
        WHERE s.source_id = @source
          AND (v.valid_from IS NULL OR v.valid_from <= @to)
          AND (v.valid_to IS NULL OR v.valid_to > @from)
        ORDER BY v.name, v.station_id, v.first_seen_at
        LIMIT @limit
        """;

    // Por estación, la última observación ≤ @from (aunque sea vieja: decide si el estado es
    // «sin dato reciente») y las de (@from, @to]. Las dos bajan por el índice
    // (station_id, observed_at); no se recorre el histórico.
    private const string ObservationsSql = """
        SELECT s.id, o.observed_at, o.status, o.bikes_available, o.mechanical_bikes_available,
               o.ebikes_available, o.docks_available, o.bikes_disabled, o.docks_disabled,
               o.is_renting, o.is_returning, o.quality_flags
        FROM stations s
        CROSS JOIN LATERAL (
            (SELECT * FROM station_observations so
             WHERE so.station_id = s.id AND so.observed_at <= @from
             ORDER BY so.observed_at DESC
             LIMIT 1)
            UNION ALL
            (SELECT * FROM station_observations so
             WHERE so.station_id = s.id AND so.observed_at > @from AND so.observed_at <= @to)
        ) o
        WHERE s.source_id = @source
        ORDER BY s.id, o.observed_at
        """;

    private sealed record VersionRow(
        FrameStation Station, long StationId, DateTimeOffset? ValidFrom, DateTimeOffset? ValidTo);

    public static async Task<FramesResponse> GetAsync(
        PulseDbContext db, DataSource source, DateTimeOffset from, TimeSpan step, CancellationToken ct)
    {
        var instants = Enumerable.Range(0, FramesPerResponse).Select(k => from + (k * step)).ToArray();
        var to = instants[^1];

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            var versions = await ReadVersionsAsync(connection, source.Id, from, to, ct);
            var truncated = versions.Count > StationQueries.MaxStations;
            if (truncated) versions.RemoveRange(StationQueries.MaxStations, versions.Count - StationQueries.MaxStations);
            var observations = await ReadObservationsAsync(connection, source.Id, from, to, ct);

            var frames = instants.Select(at => new Frame(at, versions
                .Select((v, i) => (Version: v, Index: i))
                .Where(x => (x.Version.ValidFrom is null || x.Version.ValidFrom <= at)
                    && (x.Version.ValidTo is null || x.Version.ValidTo > at))
                .Select(x => new FrameState(x.Index, StationStateRules.Evaluate(
                    LatestAtOrBefore(observations, x.Version.StationId, at), at, source.StalenessTolerance)))
                .ToList())).ToList();

            return new FramesResponse(
                source.ToRef(), from, (int)step.TotalMinutes, (int)source.StalenessTolerance.TotalMinutes,
                truncated, versions.Select(v => v.Station).ToList(), frames);
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    private static StationObservation? LatestAtOrBefore(
        Dictionary<long, List<StationObservation>> observations, long stationId, DateTimeOffset at)
    {
        if (!observations.TryGetValue(stationId, out var list)) return null;
        for (var i = list.Count - 1; i >= 0; i--)
        {
            if (list[i].ObservedAt <= at) return list[i];
        }

        return null;
    }

    private static async Task<List<VersionRow>> ReadVersionsAsync(
        NpgsqlConnection connection, string sourceId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(VersionsSql, connection);
        command.CommandTimeout = StationQueries.QueryTimeoutSeconds;
        command.Parameters.Add(new NpgsqlParameter("source", NpgsqlDbType.Varchar) { Value = sourceId });
        command.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.TimestampTz) { Value = from.ToUniversalTime() });
        command.Parameters.Add(new NpgsqlParameter("to", NpgsqlDbType.TimestampTz) { Value = to.ToUniversalTime() });
        command.Parameters.Add(new NpgsqlParameter("limit", NpgsqlDbType.Integer) { Value = StationQueries.MaxStations + 1 });

        var rows = new List<VersionRow>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            DateTimeOffset? validFrom = reader.IsDBNull(9) ? null : reader.GetFieldValue<DateTimeOffset>(9);
            rows.Add(new VersionRow(
                new FrameStation(
                    Id: reader.GetInt64(0),
                    SourceStationId: reader.GetString(1),
                    Name: reader.GetString(2),
                    Address: reader.IsDBNull(3) ? null : reader.GetString(3),
                    District: reader.IsDBNull(4) ? null : reader.GetString(4),
                    Neighbourhood: reader.IsDBNull(5) ? null : reader.GetString(5),
                    Longitude: reader.GetDouble(6),
                    Latitude: reader.GetDouble(7),
                    Capacity: reader.IsDBNull(8) ? null : reader.GetInt32(8),
                    Altitude: reader.IsDBNull(12) ? null : reader.GetDouble(12),
                    AssumedUntil: validFrom is null ? reader.GetFieldValue<DateTimeOffset>(11) : null),
                StationId: reader.GetInt64(0),
                ValidFrom: validFrom,
                ValidTo: reader.IsDBNull(10) ? null : reader.GetFieldValue<DateTimeOffset>(10)));
        }

        return rows;
    }

    private static async Task<Dictionary<long, List<StationObservation>>> ReadObservationsAsync(
        NpgsqlConnection connection, string sourceId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(ObservationsSql, connection);
        command.CommandTimeout = StationQueries.QueryTimeoutSeconds;
        command.Parameters.Add(new NpgsqlParameter("source", NpgsqlDbType.Varchar) { Value = sourceId });
        command.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.TimestampTz) { Value = from.ToUniversalTime() });
        command.Parameters.Add(new NpgsqlParameter("to", NpgsqlDbType.TimestampTz) { Value = to.ToUniversalTime() });

        var byStation = new Dictionary<long, List<StationObservation>>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var stationId = reader.GetInt64(0);
            if (!byStation.TryGetValue(stationId, out var list))
            {
                list = [];
                byStation[stationId] = list;
            }

            list.Add(new StationObservation
            {
                StationId = stationId,
                ObservedAt = reader.GetFieldValue<DateTimeOffset>(1),
                Status = SnakeCaseEnum<ObservationStatus>.Parse(reader.GetString(2)),
                BikesAvailable = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                MechanicalBikesAvailable = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                EbikesAvailable = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                DocksAvailable = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                BikesDisabled = reader.IsDBNull(7) ? null : reader.GetInt32(7),
                DocksDisabled = reader.IsDBNull(8) ? null : reader.GetInt32(8),
                IsRenting = reader.IsDBNull(9) ? null : reader.GetBoolean(9),
                IsReturning = reader.IsDBNull(10) ? null : reader.GetBoolean(10),
                QualityFlags = reader.GetFieldValue<string[]>(11),
            });
        }

        return byStation;
    }
}
