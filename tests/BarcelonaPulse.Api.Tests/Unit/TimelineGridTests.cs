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
    public void The_gaps_grid_asks_for_whole_weeks_from_monday_also_across_a_time_change()
    {
        // Como apps/web/src/features/limits/quality.ts: de las 00:00 del lunes al último paso antes
        // de las 00:00 del lunes siguiente, en hora de Barcelona. El 29-3-2026 cambia la hora.
        var weeks = TimelineWarmUp.Weeks([new DateOnly(2026, 3, 30), new DateOnly(2026, 3, 25), new DateOnly(2026, 3, 26)])
            .ToList();

        Assert.Equal(
            [
                (new DateOnly(2026, 3, 23), DateTimeOffset.Parse("2026-03-22T23:00:00Z"), DateTimeOffset.Parse("2026-03-29T21:45:00Z")),
                (new DateOnly(2026, 3, 30), DateTimeOffset.Parse("2026-03-29T22:00:00Z"), DateTimeOffset.Parse("2026-04-05T21:45:00Z")),
            ],
            weeks);
    }
}
