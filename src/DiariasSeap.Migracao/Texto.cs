using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Seap.Compartilhado.Modelos;

namespace DiariasSeap.Migracao;

/// <summary>Normalização dos textos livres do legado (HTML entities, acentos, abreviações, vínculo e cargo).</summary>
public static partial class Texto
{
    private static readonly HashSet<string> Vazios = new(StringComparer.OrdinalIgnoreCase) { "", "0", "VAZIO", "NA", "N/A", "-" };

    /// <summary>Decodifica entidades HTML (TRANSFER&amp;Ecirc;NCIA) e espaços; null para valores "vazios" do legado.</summary>
    public static string? Limpo(string? valor)
    {
        if (valor == null) return null;
        var t = EspacosRepetidos().Replace(WebUtility.HtmlDecode(WebUtility.HtmlDecode(valor)), " ").Trim();
        return Vazios.Contains(t) ? null : t;
    }

    /// <summary>Maiúsculas, sem acento e sem pontuação (chave de comparação).</summary>
    public static string Chave(string? valor)
    {
        var t = Limpo(valor);
        if (t == null) return "";
        var semAcento = new StringBuilder();
        foreach (var c in t.Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) semAcento.Append(c);
        return EspacosRepetidos().Replace(NaoAlfanumerico().Replace(semAcento.ToString().ToUpperInvariant(), " "), " ").Trim();
    }

    public static string Digitos(string? valor) => string.IsNullOrEmpty(valor) ? "" : NaoDigito().Replace(valor, "");

    public static string? Cpf(string? valor)
    {
        var d = Digitos(valor);
        return d.Length == 11 && d.Distinct().Count() > 1 ? d : null;
    }

    /// <summary>Matrícula comparável: só dígitos, sem zeros à esquerda ("3283135/01" -&gt; "328313501").</summary>
    public static string Matricula(string? valor) => Digitos(valor).TrimStart('0');

    /// <summary>Matrícula no formato SAD "1234567/01" (dígitos, barra, 2 dígitos de vínculo); null se não estiver nesse formato.</summary>
    public static string? MatriculaNova(string? valor)
    {
        var partes = (valor ?? "").Trim().Split('/');
        if (partes.Length != 2) return null;
        var (num, vinc) = (Digitos(partes[0]).TrimStart('0'), Digitos(partes[1]));
        return num.Length is >= 4 and <= 10 && vinc.Length == 2 ? $"{num}/{vinc}" : null;
    }

    /// <summary>Campo de texto do legado em que "0", "vazio" ou branco significam "não informado".</summary>
    public static string? SemZero(string? valor) => Limpo(valor) is { } v && v != "0" && !v.Equals("vazio", StringComparison.OrdinalIgnoreCase) ? v : null;

    public static string? Cortar(string? valor, int max) => valor == null || valor.Length <= max ? valor : valor[..(max - 1)] + "…";

    public static decimal Decimal(string? valor) =>
        decimal.TryParse(valor, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? decimal.Round(v, 2) : 0m;

    /// <summary>
    /// Destino: separa o nome da UF ("RECIFE - PE", "CARUARU/PE", "SALVADOR (BA)") e devolve a chave do nome.
    /// </summary>
    public static (string Nome, string? Uf) Destino(string? valor)
    {
        var chave = Chave(valor);
        var m = SufixoUf().Match(chave);
        return m.Success ? (m.Groups[1].Value.Trim(), m.Groups[2].Value) : (chave, null);
    }

    private static readonly Dictionary<string, string> UfPorNome = new(StringComparer.OrdinalIgnoreCase)
    {
        ["PERNAMBUCO"] = "PE", ["ALAGOAS"] = "AL", ["PARAIBA"] = "PB", ["BAHIA"] = "BA", ["SAO PAULO"] = "SP",
        ["RIO DE JANEIRO"] = "RJ", ["DISTRITO FEDERAL"] = "DF", ["CEARA"] = "CE", ["GOIAS"] = "GO",
        ["ESPIRITO SANTO"] = "ES", ["MINAS GERAIS"] = "MG", ["RIO GRANDE DO NORTE"] = "RN", ["SERGIPE"] = "SE", ["PIAUI"] = "PI"
    };

    public static string? Uf(string? valor)
    {
        var c = Chave(valor);
        if (c.Length == 2) return c;
        return UfPorNome.GetValueOrDefault(c);
    }

    /// <summary>Vínculo a partir dos campos "funcao"/"cargo" do legado (ex.: "CONTR TEMPO DETERM", "ESTATUTÁRIO").</summary>
    public static Vinculo Vinculo(string? funcao, string? cargo)
    {
        var f = Chave(funcao);
        var c = Chave(cargo);
        foreach (var t in new[] { f, c })
        {
            if (t.Length == 0) continue;
            if (t.Contains("COMISS")) return Seap.Compartilhado.Modelos.Vinculo.Comissionado;
            if (t.Contains("CTD") || t.Contains("CONTR") || t.Contains("TEMPO DETERM")) return Seap.Compartilhado.Modelos.Vinculo.Contratado;
            if (t.Contains("EXTRA QUADRO") || t.Contains("CEDID") || t.Contains("DISPOSI")) return Seap.Compartilhado.Modelos.Vinculo.Cedido;
            if (t.Contains("EFETIVO") || t.Contains("ESTATUT") || t.Contains("POLICIAL PENAL") || t.Contains("AGENTE SEG"))
                return Seap.Compartilhado.Modelos.Vinculo.Efetivo;
        }
        return Seap.Compartilhado.Modelos.Vinculo.Outro;
    }

    /// <summary>Nome de cargo canônico ("ASS DE RESSOCIALIZACAO-CTD" -&gt; "ASS DE RESSOCIALIZACAO"); null se vazio.</summary>
    public static string? Cargo(string? cargo)
    {
        var c = Chave(cargo);
        if (c.Length == 0) return null;
        if (c.StartsWith("POLICIAL PENAL")) return "Policial Penal";
        c = SufixoCtd().Replace(c, "").Trim();
        return c.Length == 0 ? null : c;
    }

    [GeneratedRegex(@"\s+")] private static partial Regex EspacosRepetidos();
    [GeneratedRegex(@"[^A-Z0-9 ]")] private static partial Regex NaoAlfanumerico();
    [GeneratedRegex(@"\D")] private static partial Regex NaoDigito();
    [GeneratedRegex(@"^(.+?)\s+(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$")] private static partial Regex SufixoUf();
    [GeneratedRegex(@"\s*CTD$")] private static partial Regex SufixoCtd();
}
