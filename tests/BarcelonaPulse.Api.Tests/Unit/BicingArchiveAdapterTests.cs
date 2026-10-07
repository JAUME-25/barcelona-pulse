using BarcelonaPulse.Api.Features.Ingestion;
using BarcelonaPulse.Api.Features.Ingestion.BicingArchive;
using BarcelonaPulse.Api.Features.Stations;
using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Tests.Unit;

/// <summary>Fixtures generados por scripts/make-bicing-archive-fixtures.mjs (ver sus comentarios).</summary>
internal static class BicingFixtures
{
    public static readonly DateOnly Day = new(2026, 8, 20);
    public static readonly DateTimeOffset S1 = new(2026, 8, 19, 22, 2, 30, TimeSpan.Zero);
    public static readonly DateTimeOffset S3 = new(2026, 8, 20, 12, 0, 0, TimeSpan.Zero);

    public static string Path(string name) =>
        System.IO.Path.Combine(AppContext.BaseDirectory, "Fixtures", "BicingArchive", name);

    public static string Status => Path("2026_08_Agost_BicingNou_ESTACIONS.7z");
    public static string Info => Path("2026_08_Agost_BicingNou_INFORMACIO.7z");

    public static IngestionBatch Read(ArchiveLimits? limits = null) =>
        BicingArchiveAdapter.Read(Status, Info, Day, limits ?? new ArchiveLimits(), CancellationToken.None);
}

public sealed class BicingArchiveAdapterTests
{
    [Fact]
    public void Station_metadata_is_reduced_to_the_moments_it_changes()
    {
        var batch = BicingFixtures.Read();

        Assert.Equal(["1", "2", "3", "3", "4"], batch.Stations.Select(s => s.SourceStationId).Order(StringComparer.Ordinal));
        var changes = batch.Stations.Where(s => s.SourceStationId == "3").OrderBy(s => s.SeenAt).ToList();
        Assert.Equal([30, 33], changes.Select(s => s.Capacity));
        Assert.Equal([BicingFixtures.S1, BicingFixtures.S3], changes.Select(s => s.SeenAt));
    }

    [Fact]
    public void District_and_neighbourhood_come_from_cross_street()
    {
        var stations = BicingFixtures.Read().Stations;

        var first = stations.Single(s => s.SourceStationId == "1");
        Assert.Equal("Eixample", first.District);
        Assert.Equal("el Fort Pienc", first.Neighbourhood);
        Assert.Equal("GRAN VIA CORTS CATALANES, 760", first.Name);

        var withoutArea = stations.Single(s => s.SourceStationId == "4");
        Assert.Null(withoutArea.District);
        Assert.Null(withoutArea.Capacity);
    }

    [Fact]
    public void Only_snapshots_of_the_requested_local_day_are_read()
    {
        var observations = BicingFixtures.Read().Observations;

        // 12 filas dentro del día, menos 2 que rechaza el propio adaptador.
        Assert.Equal(10, observations.Count);
        Assert.DoesNotContain(observations, o => o.BikesAvailable == 9 || o.BikesAvailable == 8);
    }

    [Fact]
    public void Statuses_flags_and_absent_values_are_mapped_without_inventing_zeros()
    {
        var observations = BicingFixtures.Read().Observations;

        var closed = observations.First(o => o.SourceStationId == "2");
        Assert.Equal(ObservationStatus.Closed, closed.Status);
        Assert.False(closed.IsRenting);
        Assert.False(closed.IsReturning);

        var returnOnly = observations.Single(o => o.SourceStationId == "3" && o.ObservedAt == BicingFixtures.S3.AddSeconds(-10));
        Assert.Equal(ObservationStatus.InService, returnOnly.Status);
        Assert.False(returnOnly.IsRenting);
        Assert.True(returnOnly.IsReturning);

        Assert.All(observations, o =>
        {
            Assert.Null(o.BikesDisabled);
            Assert.Null(o.DocksDisabled);
            Assert.Equal(TimeSpan.Zero, o.ObservedAt.Offset);
        });
    }

    [Fact]
    public void Rows_it_cannot_trust_are_rejected_with_their_reason()
    {
        var rejected = BicingFixtures.Read().Rejected;

        Assert.Contains(rejected, r => r.RecordKind == RecordKinds.Observation && r.Reason == RejectionReasons.MissingField && r.Detail == "last_reported");
        Assert.Contains(rejected, r => r.RecordKind == RecordKinds.Observation && r.Reason == RejectionReasons.InvalidValue && r.Detail == "status=BROKEN");
        Assert.Contains(rejected, r => r.RecordKind == RecordKinds.Station && r.RecordRef == "5" && r.Detail == "lat/lon");
        Assert.Equal(3, rejected.Count);
    }

    [Fact]
    public void The_operator_test_station_is_left_out_with_its_observations()
    {
        var batch = BicingFixtures.Read();

        Assert.DoesNotContain(batch.Stations, s => s.SourceStationId == "6");
        Assert.DoesNotContain(batch.Observations, o => o.SourceStationId == "6");
        // No es un rechazo: no se cuenta como fallo de la ingesta.
        Assert.DoesNotContain(batch.Rejected, r => r.RecordRef == "6" || r.RecordRef.StartsWith("6@", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("Estación de TESTING (no usuarios)", true)]
    [InlineData("estación de testing", true)]
    [InlineData("C/ CONTESTING, 3", false)]
    [InlineData("PG. DE GRÀCIA, 30", false)]
    public void Only_the_operator_test_station_is_recognised(string name, bool isTest) =>
        Assert.Equal(isTest, BicingArchiveAdapter.IsOperatorTestStation(name));

    [Fact]
    public void Swapped_files_are_detected_by_their_columns()
    {
        var ex = Assert.Throws<InvalidDataException>(() => BicingArchiveAdapter.Read(
            BicingFixtures.Info, BicingFixtures.Status, BicingFixtures.Day, new ArchiveLimits(), CancellationToken.None));
        Assert.Contains("faltan columnas", ex.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(100, long.MaxValue, long.MaxValue)] // archivo comprimido demasiado grande
    [InlineData(long.MaxValue, 500, long.MaxValue)] // contenido descomprimido demasiado grande
    [InlineData(long.MaxValue, long.MaxValue, 5)] // demasiadas filas
    public void Limits_stop_the_read(long archiveBytes, long uncompressedBytes, long rows)
    {
        Assert.Throws<InvalidDataException>(() => BicingFixtures.Read(new ArchiveLimits(archiveBytes, uncompressedBytes, rows)));
    }

    [Fact]
    public void A_file_that_is_not_7z_is_refused()
    {
        Assert.Throws<InvalidDataException>(() => BicingArchiveAdapter.Read(
            BicingFixtures.Path("2026_08_Agost_BicingNou_ESTACIONS.csv"), BicingFixtures.Info, BicingFixtures.Day,
            new ArchiveLimits(), CancellationToken.None));
    }
}

public sealed class BicingArchiveFormatTests
{
    [Fact]
    public void Csv_split_handles_quotes_commas_and_escaped_quotes()
    {
        Assert.Equal(["1", "GRAN VIA, 760", "NA", "dice \"hola\"", ""], Csv.Split("1,\"GRAN VIA, 760\",NA,\"dice \"\"hola\"\"\","));
    }

    [Theory]
    [InlineData("02-Eixample/05-el Fort Pienc", "Eixample", "el Fort Pienc")]
    [InlineData("10-Sant Martí/68-el Poblenou", "Sant Martí", "el Poblenou")]
    [InlineData("Eixample", null, null)]
    [InlineData(null, null, null)]
    public void Cross_street_is_parsed_or_left_empty(string? text, string? district, string? neighbourhood)
    {
        Assert.Equal((district, neighbourhood), BicingArchiveAdapter.ParseArea(text));
    }

    [Theory]
    [InlineData("IN_SERVICE", "1", ObservationStatus.InService)]
    [InlineData("IN_SERVICE", "0", ObservationStatus.Planned)]
    [InlineData("MAINTENANCE", "1", ObservationStatus.Maintenance)]
    [InlineData("NOT_IN_SERVICE", "1", ObservationStatus.Closed)]
    public void Known_statuses_are_mapped(string status, string installed, ObservationStatus expected)
    {
        Assert.True(BicingArchiveAdapter.TryStatus(status, installed, out var value));
        Assert.Equal(expected, value);
    }

    [Fact]
    public void Unknown_statuses_are_not_guessed()
    {
        Assert.False(BicingArchiveAdapter.TryStatus("BROKEN", "1", out _));
        Assert.False(BicingArchiveAdapter.TryStatus(null, "1", out _));
    }

    [Theory]
    [InlineData("12", true, 12)]
    [InlineData("0", true, 0)]
    [InlineData(null, true, null)]
    [InlineData("12.0", false, null)]
    [InlineData("doce", false, null)]
    public void Counts_are_integers_or_unknown_and_anything_else_is_not_guessed(string? text, bool valid, int? expected)
    {
        Assert.Equal(valid, BicingArchiveAdapter.TryCount(text, out var value));
        Assert.Equal(expected, value);
    }

    [Theory]
    [InlineData("1", true, true)]
    [InlineData("TRUE", true, true)]
    [InlineData("true", true, true)]
    [InlineData("0", true, false)]
    [InlineData("FALSE", true, false)]
    [InlineData(null, true, null)]
    [InlineData("sí", false, null)]
    public void Flags_are_read_in_either_case_and_anything_else_is_not_guessed(string? text, bool valid, bool? expected)
    {
        Assert.Equal(valid, BicingArchiveAdapter.TryFlag(text, out var value));
        Assert.Equal(expected, value);
    }

    [Theory]
    [InlineData("1787263200", true)] // 20-8-2026
    [InlineData("0", false)] // 1970: estiraba el periodo de la ingesta
    [InlineData("1787263200000", false)] // en milisegundos
    [InlineData("999999999999999", false)] // hacía saltar FromUnixTimeSeconds y tumbaba el día
    [InlineData("-5", false)]
    public void Instants_outside_this_archive_are_refused_without_throwing(string text, bool valid)
    {
        Assert.Equal(valid, BicingArchiveAdapter.TryInstant(text, out _));
    }

    [Theory]
    [InlineData(2026, 8, "2026_08_Agost_BicingNou_ESTACIONS.7z")]
    [InlineData(2022, 3, "2022_03_Marc_BicingNou_ESTACIONS.7z")]
    [InlineData(2025, 9, "2025_09_Setembre_BicingNou_ESTACIONS.7z")]
    public void Archive_urls_use_the_published_catalan_month_names(int year, int month, string file)
    {
        var url = BicingArchiveDownloader.UrlFor(new DateOnly(year, month, 1), BicingArchiveKind.Status);
        Assert.Equal($"https://opendata-ajuntament.barcelona.cat/resources/bcn/BicingBCN/{file}", url.ToString());
    }
}

public sealed class LocalDayTests
{
    [Fact]
    public void A_summer_day_starts_at_22_utc_the_day_before()
    {
        var day = LocalDay.For(new DateOnly(2026, 8, 20));
        Assert.Equal(new DateTimeOffset(2026, 8, 19, 22, 0, 0, TimeSpan.Zero), day.StartUtc);
        Assert.Equal(TimeSpan.FromHours(24), day.Length);
        Assert.True(day.Contains(day.StartUtc));
        Assert.False(day.Contains(day.EndUtc));
    }

    [Fact]
    public void The_march_change_day_has_23_hours()
    {
        var day = LocalDay.For(new DateOnly(2026, 3, 29));
        Assert.Equal(new DateTimeOffset(2026, 3, 28, 23, 0, 0, TimeSpan.Zero), day.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 22, 0, 0, TimeSpan.Zero), day.EndUtc);
        Assert.Equal(TimeSpan.FromHours(23), day.Length);
    }

    [Fact]
    public void The_october_change_day_has_25_hours()
    {
        var day = LocalDay.For(new DateOnly(2026, 10, 25));
        Assert.Equal(new DateTimeOffset(2026, 10, 24, 22, 0, 0, TimeSpan.Zero), day.StartUtc);
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 23, 0, 0, TimeSpan.Zero), day.EndUtc);
        Assert.Equal(TimeSpan.FromHours(25), day.Length);
    }

    [Fact]
    public void A_period_covers_the_barcelona_dates_it_touches()
    {
        var day = LocalDay.For(new DateOnly(2026, 10, 25));
        Assert.Equal([new DateOnly(2026, 10, 25)], LocalDay.DatesIn(day.StartUtc, day.EndUtc));

        // El demo: de 06:00 a 09:00 UTC del 10-3-2026, que en Barcelona sigue siendo ese día.
        Assert.Equal(
            [new DateOnly(2026, 3, 10)],
            LocalDay.DatesIn(new(2026, 3, 10, 6, 0, 0, TimeSpan.Zero), new(2026, 3, 10, 9, 0, 0, TimeSpan.Zero)));

        Assert.Equal(
            [new DateOnly(2026, 8, 20), new DateOnly(2026, 8, 21)],
            LocalDay.DatesIn(LocalDay.For(new DateOnly(2026, 8, 20)).StartUtc, LocalDay.For(new DateOnly(2026, 8, 21)).EndUtc));
        Assert.Empty(LocalDay.DatesIn(day.EndUtc, day.StartUtc));
    }
}
