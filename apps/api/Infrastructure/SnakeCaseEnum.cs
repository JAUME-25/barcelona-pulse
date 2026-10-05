using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BarcelonaPulse.Api.Infrastructure;

/// <summary>
/// Un mismo nombre para cada valor de enum en base de datos y en JSON:
/// <c>InService</c> se guarda y se sirve como <c>in_service</c>.
/// </summary>
public static class SnakeCaseEnum<TEnum> where TEnum : struct, Enum
{
    private static readonly Dictionary<TEnum, string> ToName = Enum.GetValues<TEnum>()
        .ToDictionary(v => v, v => JsonNamingPolicy.SnakeCaseLower.ConvertName(v.ToString()));

    private static readonly Dictionary<string, TEnum> FromName = ToName
        .ToDictionary(kv => kv.Value, kv => kv.Key, StringComparer.Ordinal);

    public static IReadOnlyCollection<string> Names => ToName.Values;

    public static string Name(TEnum value) => ToName[value];

    public static TEnum Parse(string name) =>
        FromName.TryGetValue(name, out var value)
            ? value
            : throw new FormatException($"Valor desconocido para {typeof(TEnum).Name}: '{name}'.");

    public static bool TryParse(string? name, out TEnum value)
    {
        value = default;
        return name is not null && FromName.TryGetValue(name, out value);
    }

    /// <summary>Expresión SQL para una restricción CHECK con los valores permitidos.</summary>
    public static string CheckSql(string column) =>
        $"{column} IN ({string.Join(", ", Names.Select(n => $"'{n}'"))})";
}

public sealed class SnakeCaseEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    v => SnakeCaseEnum<TEnum>.Name(v),
    s => SnakeCaseEnum<TEnum>.Parse(s))
    where TEnum : struct, Enum;
