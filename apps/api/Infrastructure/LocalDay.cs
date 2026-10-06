namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Un día natural en hora de Barcelona como intervalo de instantes UTC [inicio, fin).
/// Los días de cambio de hora duran 23 o 25 horas.
/// </summary>
public readonly record struct LocalDay(DateOnly Day, DateTimeOffset StartUtc, DateTimeOffset EndUtc)
{
    public const string TimeZoneId = "Europe/Madrid";

    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId);

    public static LocalDay For(DateOnly day) =>
        new(day, StartOf(day), StartOf(day.AddDays(1)));

    public bool Contains(DateTimeOffset instant) => instant >= StartUtc && instant < EndUtc;

    /// <summary>Fecha de Barcelona de un instante.</summary>
    public static DateOnly DateOf(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    /// <summary>Fechas de Barcelona que toca el periodo [desde, hasta), en orden.</summary>
    public static IEnumerable<DateOnly> DatesIn(DateTimeOffset from, DateTimeOffset to)
    {
        if (to <= from) yield break;
        var last = DateOf(to - TimeSpan.FromTicks(1));
        for (var day = DateOf(from); day <= last; day = day.AddDays(1))
        {
            yield return day;
        }
    }

    public TimeSpan Length => EndUtc - StartUtc;

    // Las 00:00 locales nunca caen en el hueco ni en la hora repetida en Europe/Madrid
    // (los cambios son a las 02:00 y a las 03:00), así que la conversión es única.
    private static DateTimeOffset StartOf(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, Zone.GetUtcOffset(local)).ToUniversalTime();
    }
}
