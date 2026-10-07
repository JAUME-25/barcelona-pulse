using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;

namespace BarcelonaPulse.Api.Tests;

internal sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

internal static class TestData
{
    public static readonly DateTimeOffset T0 = new(2026, 3, 10, 6, 0, 0, TimeSpan.Zero);

    public static SourceDescriptor Source(string id = "test", SourceKind kind = SourceKind.Synthetic) =>
        new(id, kind, $"Fuente {id}", "Atribución de prueba", null, null, TimeSpan.FromMinutes(30));

    public static NormalizedStation Station(
        string id, double lon = 2.17, double lat = 41.39, int? capacity = 20, DateTimeOffset? seenAt = null, string? name = null,
        double? altitude = null) =>
        new(id, name ?? $"Estación {id}", null, lon, lat, capacity, seenAt ?? T0, Altitude: altitude);

    public static NormalizedObservation Observation(
        string stationId, DateTimeOffset at, int? bikes = 5, int? docks = 10,
        ObservationStatus status = ObservationStatus.InService,
        int? mechanical = null, int? ebike = null, int? bikesDisabled = 0, int? docksDisabled = 0) =>
        new(stationId, at, status, bikes, mechanical, ebike, docks, bikesDisabled, docksDisabled);

    public static IngestionBatch Batch(
        IEnumerable<NormalizedStation> stations,
        IEnumerable<NormalizedObservation>? observations = null,
        IEnumerable<RejectedRecord>? rejected = null,
        SourceDescriptor? source = null) =>
        new(source ?? Source(), "test-adapter", "1", "memory:test", null,
            [.. stations], [.. observations ?? []], [.. rejected ?? []]);
}
