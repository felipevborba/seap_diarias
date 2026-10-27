using System.Globalization;
using System.Text;
using Seap.Compartilhado.Modelos;

namespace DiariasSeap.Api.Servicos;

/// <summary>
/// Faixas de destino da Tabela de Diárias Nacionais (Decreto Estadual nº 25.845/2003, redação do Decreto nº 55.723/2023).
/// Calculadas a partir do município de destino do período.
/// </summary>
public static class FaixasDestino
{
    public const string Capitais = "CAPITAIS";
    public const string BrasiliaManaus = "BRASILIA_MANAUS";
    public const string CapitaisEspeciais = "CAPITAIS_ESPECIAIS";
    public const string DemaisFora = "DEMAIS_FORA";
    public const string Estado = "ESTADO";

    public static readonly string[] Todas = { Capitais, BrasiliaManaus, CapitaisEspeciais, DemaisFora, Estado };

    public static string Rotulo(string? faixa) => faixa switch
    {
        Capitais => "Grupo I – capitais brasileiras (exceto Recife)",
        BrasiliaManaus => "Grupo I – Brasília e Manaus",
        CapitaisEspeciais => "Grupo I – SP, RJ, BH, Porto Alegre, Belém e Fortaleza",
        DemaisFora => "Grupo II – demais cidades fora do estado",
        Estado => "Grupo III – Recife e interior de PE, SE, AL, PB, RN e Juazeiro-BA",
        _ => "Qualquer destino"
    };

    private static readonly Dictionary<string, string> CapitalPorUf = new()
    {
        ["AC"] = "RIO BRANCO", ["AL"] = "MACEIO", ["AP"] = "MACAPA", ["AM"] = "MANAUS", ["BA"] = "SALVADOR", ["CE"] = "FORTALEZA",
        ["DF"] = "BRASILIA", ["ES"] = "VITORIA", ["GO"] = "GOIANIA", ["MA"] = "SAO LUIS", ["MT"] = "CUIABA", ["MS"] = "CAMPO GRANDE",
        ["MG"] = "BELO HORIZONTE", ["PA"] = "BELEM", ["PB"] = "JOAO PESSOA", ["PR"] = "CURITIBA", ["PE"] = "RECIFE", ["PI"] = "TERESINA",
        ["RJ"] = "RIO DE JANEIRO", ["RN"] = "NATAL", ["RS"] = "PORTO ALEGRE", ["RO"] = "PORTO VELHO", ["RR"] = "BOA VISTA",
        ["SC"] = "FLORIANOPOLIS", ["SP"] = "SAO PAULO", ["SE"] = "ARACAJU", ["TO"] = "PALMAS",
    };

    private static readonly HashSet<string> UfsDoGrupoIII = new() { "PE", "SE", "AL", "PB", "RN" };
    private static readonly HashSet<string> UfsCapitaisEspeciais = new() { "SP", "RJ", "MG", "RS", "PA", "CE" };

    /// <summary>Faixa do município de destino; null quando não há município (períodos migrados só com o texto).</summary>
    public static string? De(string? municipio, string? uf)
    {
        if (string.IsNullOrWhiteSpace(municipio) || string.IsNullOrWhiteSpace(uf)) return null;
        uf = uf.Trim().ToUpperInvariant();
        var nome = SemAcento(municipio);
        if (uf == "PE") return Estado;
        if (CapitalPorUf.TryGetValue(uf, out var capital) && capital == nome)
            return uf is "DF" or "AM" ? BrasiliaManaus : UfsCapitaisEspeciais.Contains(uf) ? CapitaisEspeciais : Capitais;
        if (UfsDoGrupoIII.Contains(uf) || (uf == "BA" && nome == "JUAZEIRO")) return Estado;
        return DemaisFora;
    }

    private static string SemAcento(string texto)
    {
        var sb = new StringBuilder();
        foreach (var c in texto.Trim().ToUpperInvariant().Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString();
    }
}

/// <summary>Classe do beneficiário na Tabela de Diárias Nacionais (linhas 1, 2 e 3).</summary>
public static class ClassesBeneficiario
{
    /// <summary>A do servidor; sem ela, a do cargo; sem as duas, 3 para contratados e 2 para os demais (prática do legado).</summary>
    public static int Resolver(int? doServidor, int? doCargo, Vinculo vinculo) =>
        doServidor ?? doCargo ?? (vinculo == Vinculo.Contratado ? 3 : 2);

    public static string Rotulo(int classe) => classe switch
    {
        1 => "Classe 1 – Secretários e presidentes de entidades",
        2 => "Classe 2 – Dirigentes, comissionados, chefia/assessoramento e nível superior",
        _ => "Classe 3 – Demais servidores"
    };

    public static bool Valida(int? classe) => classe is null or >= 1 and <= 3;
}
