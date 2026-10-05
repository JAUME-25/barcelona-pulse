using System.Text;
using SharpCompress.Archives.SevenZip;

namespace BarcelonaPulse.Api.Features.Ingestion.BicingArchive;

/// <summary>Límites de lectura de un archivo descargado de un tercero.</summary>
public sealed record ArchiveLimits(
    long MaxArchiveBytes = 64L * 1024 * 1024,
    long MaxUncompressedBytes = 2L * 1024 * 1024 * 1024,
    long MaxRows = 6_000_000);

/// <summary>Una fila de CSV con acceso por nombre de columna. «NA» y vacío se leen como nulo.</summary>
public sealed class CsvRow(string[] values, IReadOnlyDictionary<string, int> columns, long line)
{
    public long Line { get; } = line;

    public string? this[string column] =>
        columns.TryGetValue(column, out var i) && i < values.Length && values[i] is { Length: > 0 } v && v != "NA"
            ? v
            : null;
}

/// <summary>
/// Lee en streaming el único CSV de un .7z: nunca se descomprime entero en disco ni en
/// memoria, y se corta si supera los límites.
/// </summary>
public static class ArchiveCsv
{
    public static IEnumerable<CsvRow> ReadRows(
        string archivePath, IReadOnlyCollection<string> requiredColumns, ArchiveLimits limits, CancellationToken ct)
    {
        var size = new FileInfo(archivePath).Length;
        if (size > limits.MaxArchiveBytes)
        {
            throw new InvalidDataException($"{Path.GetFileName(archivePath)} ocupa {size} bytes; el máximo es {limits.MaxArchiveBytes}.");
        }

        if (!SevenZipArchive.IsSevenZipFile(archivePath))
        {
            throw new InvalidDataException($"{Path.GetFileName(archivePath)} no es un archivo 7z.");
        }

        using var archive = SevenZipArchive.Open(archivePath);
        var entries = archive.Entries.Where(e => !e.IsDirectory).ToList();
        if (entries is not [{ Key: { } key } entry] || !key.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException($"{Path.GetFileName(archivePath)} debe contener un único CSV.");
        }

        using var stream = new LimitedReadStream(entry.OpenEntryStream(), limits.MaxUncompressedBytes);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        var header = Csv.Split(reader.ReadLine() ?? throw new InvalidDataException("CSV vacío."));
        var columns = header.Select((name, i) => (name, i)).ToDictionary(x => x.name, x => x.i, StringComparer.Ordinal);
        var missing = requiredColumns.Where(c => !columns.ContainsKey(c)).ToList();
        if (missing.Count > 0)
        {
            throw new InvalidDataException($"{key}: faltan columnas {string.Join(", ", missing)}. ¿Es el archivo correcto?");
        }

        long line = 1;
        while (reader.ReadLine() is { } text)
        {
            line++;
            if (line % 50_000 == 0) ct.ThrowIfCancellationRequested();
            if (line - 1 > limits.MaxRows)
            {
                throw new InvalidDataException($"{key}: más de {limits.MaxRows} filas.");
            }

            if (text.Length > 0)
            {
                yield return new CsvRow(Csv.Split(text), columns, line);
            }
        }
    }
}

/// <summary>Separa una línea CSV con comillas dobles (RFC 4180, sin saltos de línea dentro de campos).</summary>
public static class Csv
{
    public static string[] Split(string line)
    {
        var fields = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"')
                {
                    field.Append('"');
                    i++;
                }
                else if (c == '"')
                {
                    quoted = false;
                }
                else
                {
                    field.Append(c);
                }
            }
            else if (c == '"')
            {
                quoted = true;
            }
            else if (c == ',')
            {
                fields.Add(field.ToString());
                field.Clear();
            }
            else
            {
                field.Append(c);
            }
        }

        fields.Add(field.ToString());
        return [.. fields];
    }
}

/// <summary>Corta la lectura si se superan <paramref name="maxBytes"/> (protege de bombas de compresión).</summary>
internal sealed class LimitedReadStream(Stream inner, long maxBytes) : Stream
{
    private long _read;

    public override int Read(byte[] buffer, int offset, int count)
    {
        var n = inner.Read(buffer, offset, count);
        _read += n;
        if (_read > maxBytes)
        {
            throw new InvalidDataException($"Contenido descomprimido mayor que {maxBytes} bytes.");
        }

        return n;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => _read; set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) inner.Dispose();
        base.Dispose(disposing);
    }
}
