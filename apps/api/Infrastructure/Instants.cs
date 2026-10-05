using System.Globalization;
using System.Text.RegularExpressions;

namespace BarcelonaPulse.Api.Infrastructure;

public static partial class Instants
{
    /// <summary>
    /// Solo instantes inequívocos: ISO 8601 con «Z» o desfase explícito. Una hora local
    /// sin zona no se convierte a UTC por suposición. Devuelve el instante en UTC.
    /// </summary>
    public static bool TryParseExplicit(string? text, out DateTimeOffset value)
    {
        value = default;
        if (text is null || !ExplicitOffset().IsMatch(text))
        {
            return false;
        }

        if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return false;
        }

        value = parsed.ToUniversalTime();
        return true;
    }

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})$")]
    private static partial Regex ExplicitOffset();
}
