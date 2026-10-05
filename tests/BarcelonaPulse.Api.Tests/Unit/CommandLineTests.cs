using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Tests.Unit;

public sealed class CommandLineTests
{
    private static Dictionary<string, string> Options(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);

    [Fact]
    public void A_day_is_a_one_day_period()
    {
        var (from, to) = CommandLine.ParsePeriod(Options(("day", "2026-08-20")));
        Assert.Equal(new DateOnly(2026, 8, 20), from);
        Assert.Equal(from, to);
    }

    [Fact]
    public void A_period_keeps_both_ends()
    {
        var (from, to) = CommandLine.ParsePeriod(Options(("from", "2026-08-17"), ("to", "2026-08-23")));
        Assert.Equal(new DateOnly(2026, 8, 17), from);
        Assert.Equal(new DateOnly(2026, 8, 23), to);
    }

    [Theory]
    [InlineData("2026-08-23", "2026-08-17")] // al revés
    [InlineData("2026-07-01", "2026-08-31")] // más de 31 días
    [InlineData("2019-02-28", "2019-03-01")] // antes del primer mes publicado
    [InlineData("2026-08-20", "2099-01-01")] // en el futuro
    public void Invalid_periods_are_refused_with_a_message(string from, string to)
    {
        var ex = Assert.Throws<ArgumentException>(() => CommandLine.ParsePeriod(Options(("from", from), ("to", to))));
        Assert.False(string.IsNullOrWhiteSpace(ex.Message));
    }

    [Fact]
    public void Day_and_period_options_cannot_be_mixed()
    {
        Assert.Throws<ArgumentException>(() =>
            CommandLine.ParsePeriod(Options(("day", "2026-08-20"), ("from", "2026-08-17"))));
    }

    [Theory]
    [InlineData("20-08-2026")]
    [InlineData("2026-8-20")]
    [InlineData("ayer")]
    public void Dates_must_be_iso(string day)
    {
        Assert.Throws<ArgumentException>(() => CommandLine.ParsePeriod(Options(("day", day))));
    }
}
