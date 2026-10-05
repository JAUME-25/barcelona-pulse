using System.Text;
using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.Demo;
using BarcelonaPulse.Api.Features.Sources;
using BarcelonaPulse.Api.Features.Stations;

namespace BarcelonaPulse.Api.Tests.Unit;

public sealed class DemoFixtureAdapterTests
{
    private static IngestionBatch ParseJson(string json) =>
        DemoFixtureAdapter.Parse(Encoding.UTF8.GetBytes(json), "memory:test");

    private static string Fixture(string stations, string observations) => $$"""
        {
          "format": "barcelona-pulse/demo-fixture",
          "formatVersion": 1,
          "source": { "id": "demo", "name": "Demo", "attribution": "x", "stalenessToleranceMinutes": 30 },
          "stationsSeenAt": "2026-03-10T06:00:00Z",
          "stations": [{{stations}}],
          "observations": [{{observations}}]
        }
        """;

    [Fact]
    public void The_embedded_fixture_is_synthetic_and_complete()
    {
        var batch = DemoFixtureAdapter.LoadEmbedded();

        Assert.Equal(SourceKind.Synthetic, batch.Source.Kind);
        Assert.Equal(46, batch.Stations.Count);
        Assert.Equal(572, batch.Observations.Count);
        Assert.Empty(batch.Rejected);
        Assert.Equal(64, batch.InputSha256!.Length);
        Assert.All(batch.Observations, o => Assert.Equal(TimeSpan.Zero, o.ObservedAt.Offset));
        Assert.All(batch.Stations, s => Assert.StartsWith("demo-", s.SourceStationId, StringComparison.Ordinal));
    }

    [Fact]
    public void The_embedded_fixture_is_deterministic()
    {
        Assert.Equal(DemoFixtureAdapter.LoadEmbedded().InputSha256, DemoFixtureAdapter.LoadEmbedded().InputSha256);
    }

    [Fact]
    public void Timestamps_with_offset_are_normalized_to_utc()
    {
        var batch = ParseJson(Fixture(
            """{ "id": "1", "name": "A", "lat": 41.39, "lon": 2.17 }""",
            """{ "station": "1", "at": "2026-03-29T03:30:00+02:00", "status": "in_service", "mechanical": 1, "ebike": 2, "docks": 3 }"""));

        var o = Assert.Single(batch.Observations);
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 30, 0, TimeSpan.Zero), o.ObservedAt);
        Assert.Equal(TimeSpan.Zero, o.ObservedAt.Offset);
        Assert.Equal(3, o.BikesAvailable);
    }

    [Fact]
    public void A_local_time_without_zone_is_rejected_not_guessed()
    {
        var batch = ParseJson(Fixture(
            """{ "id": "1", "name": "A", "lat": 41.39, "lon": 2.17 }""",
            """{ "station": "1", "at": "2026-03-29T02:30:00", "status": "in_service" }"""));

        Assert.Empty(batch.Observations);
        var rejected = Assert.Single(batch.Rejected);
        Assert.Equal(RejectionReasons.AmbiguousTimestamp, rejected.Reason);
    }

    [Fact]
    public void Missing_fields_and_unknown_status_are_rejected_with_their_reason()
    {
        var batch = ParseJson(Fixture(
            """{ "id": "1", "name": "A", "lat": 41.39, "lon": 2.17 }, { "id": "2", "name": "B", "lat": 41.39 }""",
            """{ "station": "1", "status": "in_service" }, { "station": "1", "at": "2026-03-10T06:00:00Z", "status": "broken" }"""));

        Assert.Single(batch.Stations);
        Assert.Empty(batch.Observations);
        Assert.Equal(
            [RejectionReasons.MissingField, RejectionReasons.MissingField, RejectionReasons.InvalidValue],
            batch.Rejected.Select(r => r.Reason).ToArray());
    }

    [Fact]
    public void Absent_counts_stay_null_instead_of_zero()
    {
        var batch = ParseJson(Fixture(
            """{ "id": "1", "name": "A", "lat": 41.39, "lon": 2.17 }""",
            """{ "station": "1", "at": "2026-03-10T06:00:00Z" }"""));

        var o = Assert.Single(batch.Observations);
        Assert.Equal(ObservationStatus.Unknown, o.Status);
        Assert.Null(o.BikesAvailable);
        Assert.Null(o.DocksAvailable);
    }

    [Fact]
    public void An_unknown_format_or_an_oversized_input_is_refused_as_a_whole()
    {
        Assert.Throws<InvalidDataException>(() => ParseJson("""{ "format": "otro", "formatVersion": 1 }"""));
        Assert.Throws<InvalidDataException>(() =>
            DemoFixtureAdapter.Parse(new byte[DemoFixtureAdapter.MaxInputBytes + 1], "memory:big"));
    }
}
