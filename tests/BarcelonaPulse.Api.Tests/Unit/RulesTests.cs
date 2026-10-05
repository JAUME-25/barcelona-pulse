using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;
using static BarcelonaPulse.Api.Tests.TestData;

namespace BarcelonaPulse.Api.Tests.Unit;

public sealed class InstantsTests
{
    [Theory]
    [InlineData("2026-03-10T09:00:00Z", "2026-03-10T09:00:00Z")]
    [InlineData("2026-03-10T10:00:00+01:00", "2026-03-10T09:00:00Z")]
    [InlineData("2026-10-25T02:30:00+02:00", "2026-10-25T00:30:00Z")] // primera 02:30 del cambio de hora
    [InlineData("2026-10-25T02:30:00+01:00", "2026-10-25T01:30:00Z")] // segunda 02:30
    [InlineData("2026-03-10T09:00Z", "2026-03-10T09:00:00Z")]
    public void Explicit_offsets_are_parsed_to_utc(string text, string expectedUtc)
    {
        Assert.True(Instants.TryParseExplicit(text, out var value));
        Assert.Equal(DateTimeOffset.Parse(expectedUtc, System.Globalization.CultureInfo.InvariantCulture), value);
        Assert.Equal(TimeSpan.Zero, value.Offset);
    }

    [Theory]
    [InlineData("2026-10-25T02:30:00")] // ambigua en Europe/Madrid
    [InlineData("2026-03-10")]
    [InlineData("10/03/2026 09:00")]
    [InlineData("1773133200")]
    [InlineData("")]
    public void Ambiguous_or_foreign_formats_are_refused(string text)
    {
        Assert.False(Instants.TryParseExplicit(text, out _));
    }
}

public sealed class IngestionRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(2.17, 41.39, null)]
    [InlineData(-3.70, 40.42, RejectionReasons.OutsideServiceArea)]
    [InlineData(41.39, 2.17, RejectionReasons.OutsideServiceArea)]
    [InlineData(0, 0, RejectionReasons.OutsideServiceArea)]
    [InlineData(2.17, 95, RejectionReasons.CoordinatesOutOfRange)]
    [InlineData(double.NaN, 41.39, RejectionReasons.CoordinatesOutOfRange)]
    public void Station_coordinates(double lon, double lat, string? expectedReason)
    {
        Assert.Equal(expectedReason, IngestionRules.CheckStation(Station("1", lon, lat))?.Reason);
    }

    [Fact]
    public void Observations_from_the_future_or_with_negative_counts_are_rejected()
    {
        Assert.Null(IngestionRules.CheckObservation(Observation("1", Now.AddMinutes(4)), Now));
        Assert.Equal(RejectionReasons.TimestampInFuture,
            IngestionRules.CheckObservation(Observation("1", Now.AddMinutes(6)), Now)?.Reason);
        Assert.Equal(RejectionReasons.NegativeCount,
            IngestionRules.CheckObservation(Observation("1", Now, docks: -1), Now)?.Reason);
    }

    [Fact]
    public void Counts_below_capacity_are_normal_and_not_flagged()
    {
        // 5 + 3 + 0 + 2 = 10 de 20: hay elementos que la fuente no cuenta. No se fuerza a cuadrar.
        Assert.Empty(IngestionRules.FlagsFor(Observation("1", Now, bikes: 5, docks: 3, docksDisabled: 2), 20));
        Assert.Empty(IngestionRules.FlagsFor(Observation("1", Now, bikes: 10, docks: 10), 20));
        Assert.Empty(IngestionRules.FlagsFor(Observation("1", Now, bikes: 30, docks: 30), capacity: null));
    }

    [Fact]
    public void Counts_above_capacity_and_inconsistent_bike_types_are_flagged()
    {
        Assert.Equal([QualityFlags.CountsExceedCapacity],
            IngestionRules.FlagsFor(Observation("1", Now, bikes: 15, docks: 6), 20));
        Assert.Equal([QualityFlags.BikeTypesMismatch],
            IngestionRules.FlagsFor(Observation("1", Now, bikes: 5, mechanical: 2, ebike: 2), 20));
    }
}

public sealed class StationStateRulesTests
{
    private static readonly DateTimeOffset At = new(2026, 3, 10, 9, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Tolerance = TimeSpan.FromMinutes(30);

    private static StationObservation Obs(DateTimeOffset at, int? bikes = 4) => new()
    {
        ObservedAt = at,
        Status = ObservationStatus.InService,
        BikesAvailable = bikes,
        DocksAvailable = 6,
    };

    [Fact]
    public void Without_observation_the_state_is_unknown_and_counts_are_null()
    {
        var s = StationStateRules.Evaluate(null, At, Tolerance);
        Assert.Equal(Freshness.None, s.Freshness);
        Assert.Equal(ObservationStatus.Unknown, s.Status);
        Assert.Null(s.BikesAvailable);
        Assert.Null(s.LastObservedAt);
    }

    [Fact]
    public void An_observation_exactly_at_the_tolerance_limit_is_current()
    {
        var s = StationStateRules.Evaluate(Obs(At - Tolerance), At, Tolerance);
        Assert.Equal(Freshness.Current, s.Freshness);
        Assert.Equal(4, s.BikesAvailable);
    }

    [Fact]
    public void Past_the_tolerance_the_state_becomes_unknown_but_keeps_its_date()
    {
        var observedAt = At - Tolerance - TimeSpan.FromSeconds(1);
        var s = StationStateRules.Evaluate(Obs(observedAt), At, Tolerance);
        Assert.Equal(Freshness.Stale, s.Freshness);
        Assert.Equal(ObservationStatus.Unknown, s.Status);
        Assert.Null(s.BikesAvailable);
        Assert.Null(s.DocksAvailable);
        Assert.Equal(observedAt, s.LastObservedAt);
    }

    [Fact]
    public void A_zero_is_kept_as_zero()
    {
        Assert.Equal(0, StationStateRules.Evaluate(Obs(At, bikes: 0), At, Tolerance).BikesAvailable);
    }

    [Fact]
    public void An_observation_after_the_instant_is_a_programming_error()
    {
        Assert.Throws<ArgumentException>(() => StationStateRules.Evaluate(Obs(At.AddSeconds(1)), At, Tolerance));
    }
}

public sealed class QueryParsingTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_valid_bbox_is_parsed_with_invariant_culture()
    {
        Assert.True(QueryParsing.TryParseBoundingBox("2.1,41.3,2.25,41.47", out var box, out _));
        Assert.Equal(new BoundingBox(2.1, 41.3, 2.25, 41.47), box);
    }

    [Theory]
    [InlineData("2,1,41,3,2,25,41,47")]
    [InlineData("2.2,41.3,2.1,41.4")]
    [InlineData("2.1,41.3,3.2,41.4")]
    [InlineData("2.1,41.3,2.2")]
    [InlineData("-181,41.3,2.2,41.4")]
    public void Invalid_bboxes_are_refused_with_a_message(string text)
    {
        Assert.False(QueryParsing.TryParseBoundingBox(text, out _, out var error));
        Assert.False(string.IsNullOrEmpty(error));
    }

    [Fact]
    public void Instants_far_in_the_future_are_refused()
    {
        Assert.True(QueryParsing.TryParseInstant("2026-10-05T13:00:00Z", Now, out _, out _));
        Assert.False(QueryParsing.TryParseInstant("2026-10-07T12:00:00Z", Now, out _, out _));
    }
}
