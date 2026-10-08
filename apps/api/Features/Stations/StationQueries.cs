using System.Text;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace BarcelonaPulse.Api.Features.Stations;

/// <summary>Consultas de estaciones en un instante, acotadas por fuente y, opcionalmente, por zona.</summary>
public static class StationQueries
{
    public const int MaxStations = 1000;

    /// <summary>
    /// Tope de las consultas de estado y fotogramas (segundos). Tardan milisegundos; si un día
    /// se atascan, mejor un fallo claro de la API a los 10 s que el corte de nginx a los 30.
    /// </summary>
    public const int QueryTimeoutSeconds = 10;

    /// <summary>
    /// Instante por defecto: en una fuente sintética, el final de sus datos (la demo nunca se
    /// presenta como «ahora»); en una observada, el momento actual, para que un dato viejo
    /// aparezca como desconocido.
    /// </summary>
    public static async Task<(DateTimeOffset At, InstantBasis Basis)> ResolveInstantAsync(
        PulseDbContext db, DataSource source, DateTimeOffset? requested, DateTimeOffset now, CancellationToken ct)
    {
        if (requested is { } at)
        {
            return (at, InstantBasis.Requested);
        }

        if (source.Kind == SourceKind.Synthetic && await LatestObservationAsync(db, source.Id, ct) is { } latest)
        {
            return (latest, InstantBasis.LatestObservation);
        }

        return (now, InstantBasis.Now);
    }

    /// <summary>
    /// Instante de la última observación de la fuente. Se calcula por estación para que baje por
    /// el índice (station_id, observed_at): el MAX sobre el join recorría todo el histórico
    /// (97 ms frente a 4 ms con una semana real).
    /// </summary>
    public static Task<DateTimeOffset?> LatestObservationAsync(PulseDbContext db, string sourceId, CancellationToken ct) =>
        db.Stations
            .Where(s => s.SourceId == sourceId)
            .Select(s => db.StationObservations.Where(o => o.StationId == s.Id).Max(o => (DateTimeOffset?)o.ObservedAt))
            .MaxAsync(ct);

    /// <summary>Instante de la primera observación de la fuente, también por estación.</summary>
    public static Task<DateTimeOffset?> EarliestObservationAsync(PulseDbContext db, string sourceId, CancellationToken ct) =>
        db.Stations
            .Where(s => s.SourceId == sourceId)
            .Select(s => db.StationObservations.Where(o => o.StationId == s.Id).Min(o => (DateTimeOffset?)o.ObservedAt))
            .MinAsync(ct);

    /// <summary>
    /// SQL explícito a propósito (ADR 0005): por cada versión vigente en @at, la última
    /// observación ≤ @at con LATERAL … LIMIT 1, que baja por el índice único
    /// (station_id, observed_at). La traducción de EF usaba ROW_NUMBER() sobre todas las
    /// observaciones de todas las fuentes y crecía con el histórico (100 ms con un día).
    /// </summary>
    private const string StatesSql = """
        SELECT v.station_id, s.source_station_id, v.name, v.address, v.district, v.neighbourhood,
               ST_X(v.location), ST_Y(v.location), v.capacity,
               v.valid_from IS NULL AND v.first_seen_at > @at,
               o.observed_at, o.status, o.bikes_available, o.mechanical_bikes_available, o.ebikes_available,
               o.docks_available, o.bikes_disabled, o.docks_disabled, o.is_renting, o.is_returning, o.quality_flags,
               v.altitude, s.first_seen_at, s.last_seen_at
        FROM station_versions v
        JOIN stations s ON s.id = v.station_id
        LEFT JOIN LATERAL (
            SELECT *
            FROM station_observations so
            WHERE so.station_id = v.station_id AND so.observed_at <= @at
            ORDER BY so.observed_at DESC
            LIMIT 1
        ) o ON true
        WHERE s.source_id = @source
          AND (v.valid_from IS NULL OR v.valid_from <= @at)
          AND (v.valid_to IS NULL OR v.valid_to > @at)
        """;

    /// <summary>
    /// Estaciones con la versión vigente en <paramref name="at"/> y su última observación
    /// con instante ≤ <paramref name="at"/>. Devuelve hasta <paramref name="limit"/> + 1 filas
    /// para poder indicar truncado.
    /// </summary>
    public static async Task<List<StationItem>> StatesAtAsync(
        PulseDbContext db, DataSource source, DateTimeOffset at, BoundingBox? bbox, long? stationId, int limit,
        CancellationToken ct)
    {
        var sql = new StringBuilder(StatesSql);
        var parameters = new List<NpgsqlParameter>
        {
            new("at", NpgsqlDbType.TimestampTz) { Value = at.ToUniversalTime() },
            new("source", NpgsqlDbType.Varchar) { Value = source.Id },
            new("limit", NpgsqlDbType.Integer) { Value = limit + 1 },
        };

        if (bbox is { } b)
        {
            // ST_Intersects usa el índice GiST de location; incluye los puntos del borde.
            sql.AppendLine("  AND ST_Intersects(v.location, ST_MakeEnvelope(@min_lon, @min_lat, @max_lon, @max_lat, 4326))");
            parameters.Add(new("min_lon", NpgsqlDbType.Double) { Value = b.MinLon });
            parameters.Add(new("min_lat", NpgsqlDbType.Double) { Value = b.MinLat });
            parameters.Add(new("max_lon", NpgsqlDbType.Double) { Value = b.MaxLon });
            parameters.Add(new("max_lat", NpgsqlDbType.Double) { Value = b.MaxLat });
        }

        if (stationId is { } id)
        {
            sql.AppendLine("  AND v.station_id = @station_id");
            parameters.Add(new("station_id", NpgsqlDbType.Bigint) { Value = id });
        }

        sql.AppendLine("ORDER BY v.name, v.station_id LIMIT @limit");

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = new NpgsqlCommand(sql.ToString(), connection);
            command.CommandTimeout = QueryTimeoutSeconds;
            command.Parameters.AddRange(parameters.ToArray());
            await using var reader = await command.ExecuteReaderAsync(ct);

            var items = new List<StationItem>();
            while (await reader.ReadAsync(ct))
            {
                StationObservation? latest = reader.IsDBNull(10)
                    ? null
                    : new StationObservation
                    {
                        ObservedAt = reader.GetFieldValue<DateTimeOffset>(10),
                        Status = SnakeCaseEnum<ObservationStatus>.Parse(reader.GetString(11)),
                        BikesAvailable = NullableInt(reader, 12),
                        MechanicalBikesAvailable = NullableInt(reader, 13),
                        EbikesAvailable = NullableInt(reader, 14),
                        DocksAvailable = NullableInt(reader, 15),
                        BikesDisabled = NullableInt(reader, 16),
                        DocksDisabled = NullableInt(reader, 17),
                        IsRenting = reader.IsDBNull(18) ? null : reader.GetBoolean(18),
                        IsReturning = reader.IsDBNull(19) ? null : reader.GetBoolean(19),
                        QualityFlags = reader.GetFieldValue<string[]>(20),
                    };

                items.Add(new StationItem(
                    Id: reader.GetInt64(0),
                    SourceStationId: reader.GetString(1),
                    Name: reader.GetString(2),
                    Address: NullableString(reader, 3),
                    District: NullableString(reader, 4),
                    Neighbourhood: NullableString(reader, 5),
                    Longitude: reader.GetDouble(6),
                    Latitude: reader.GetDouble(7),
                    Capacity: NullableInt(reader, 8),
                    Altitude: reader.IsDBNull(21) ? null : reader.GetDouble(21),
                    MetadataAssumed: reader.GetBoolean(9),
                    State: StationStateRules.Evaluate(latest, at, source.StalenessTolerance),
                    FirstSeenAt: reader.GetFieldValue<DateTimeOffset>(22),
                    LastSeenAt: reader.GetFieldValue<DateTimeOffset>(23)));
            }

            return items;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    private static int? NullableInt(NpgsqlDataReader reader, int i) => reader.IsDBNull(i) ? null : reader.GetInt32(i);

    private static string? NullableString(NpgsqlDataReader reader, int i) => reader.IsDBNull(i) ? null : reader.GetString(i);

    public static SourceRef ToRef(this DataSource s) => new(s.Id, s.Kind, s.Name, s.Attribution, s.License, s.Url);
}
