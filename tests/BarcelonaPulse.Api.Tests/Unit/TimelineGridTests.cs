using BarcelonaPulse.Api.Features.History;

namespace BarcelonaPulse.Api.Tests.Unit;

public sealed class TimelineGridTests
{
    [Fact]
    public void Steps_are_aligned_to_the_grid_in_utc()
    {
        var (from, to, points) = TimelineGrid.Align(
            new DateTimeOffset(2026, 8, 20, 10, 7, 30, TimeSpan.FromHours(2)),
            new DateTimeOffset(2026, 8, 20, 11, 59, 0, TimeSpan.FromHours(2)),
            TimeSpan.FromMinutes(15));

        Assert.Equal(new DateTimeOffset(2026, 8, 20, 8, 0, 0, TimeSpan.Zero), from);
        Assert.Equal(new DateTimeOffset(2026, 8, 20, 9, 45, 0, TimeSpan.Zero), to);
        Assert.Equal(8, points);
    }

    [Fact]
    public void The_october_change_day_has_25_hours_of_steps()
    {
        // De medianoche a medianoche en Barcelona el 25-10-2026: 25 horas.
        var (_, _, points) = TimelineGrid.Align(
            new DateTimeOffset(2026, 10, 25, 0, 0, 0, TimeSpan.FromHours(2)),
            new DateTimeOffset(2026, 10, 26, 0, 0, 0, TimeSpan.FromHours(1)),
            TimeSpan.FromMinutes(15));

        Assert.Equal((25 * 4) + 1, points);
    }

    [Fact]
    public void The_march_change_day_has_23_hours_of_steps()
    {
        var (_, _, points) = TimelineGrid.Align(
            new DateTimeOffset(2026, 3, 29, 0, 0, 0, TimeSpan.FromHours(1)),
            new DateTimeOffset(2026, 3, 30, 0, 0, 0, TimeSpan.FromHours(2)),
            TimeSpan.FromMinutes(60));

        Assert.Equal(23 + 1, points);
    }

    [Fact]
    public void The_week_of_the_october_time_change_fits_in_one_request()
    {
        // Como la pide apps/web/src/features/limits/quality.ts: del lunes 20-10-2025 a las 00:00 al
        // domingo 26 a las 23:45, hora de Barcelona. El domingo tiene 25 h: son 168 h 45 min.
        var from = DateTimeOffset.Parse("2025-10-19T22:00:00Z");
        var to = DateTimeOffset.Parse("2025-10-26T22:45:00Z");

        Assert.True(to - from <= TimelineGrid.MaxRange);
        Assert.Equal(6 * 96 + 100, TimelineGrid.Align(from, to, TimeSpan.FromMinutes(15)).Points);
    }
}
