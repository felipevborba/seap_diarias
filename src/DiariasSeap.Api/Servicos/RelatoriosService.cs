using System.Text.Json;
using ClosedXML.Excel;
using DiariasSeap.Api.Dados;
using DiariasSeap.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeap.Api.Servicos;

public record RelatorioFiltro(DateOnly? DataInicio, DateOnly? DataFim, string? Servidor, int? UnidadeId, int? DestinoMunicipioId,
    int? RegiaoId, int? TipoDiariaId, Vinculo? Vinculo, string? Situacao = null, string? Origem = null, int Page = 1, int PageSize = 50,
    int? ServidorId = null, int? CargoId = null, DateOnly? CadastroInicio = null, DateOnly? CadastroFim = null, int? CidadeOrigemId = null,
    int[]? UnidadeIds = null)
{
    /// <summary>Nos filtros de lotação, destino, região, cargo e cidade de origem, 0 significa "não informado" (drill no grupo vazio).</summary>
    public const int NaoInformado = 0;

    /// <summary>Datas de cadastro são gravadas em UTC; o filtro considera o dia no horário de Pernambuco (UTC-3, sem horário de verão).</summary>
    public static DateTime InicioDoDiaUtc(DateOnly dia) => DateTime.SpecifyKind(dia.ToDateTime(TimeOnly.MinValue).AddHours(3), DateTimeKind.Utc);
}

public record RelatorioLinhaDto(int DiariaId, int? LegadoCodigo, string Origem, string Servidor, string? Cpf, string? Matricula,
    Vinculo Vinculo, string? Cargo, string? Unidade, string Destino, string? Regiao, string TipoDiaria, DateOnly DataInicio,
    DateOnly DataFim, decimal Quantidade, decimal ValorUnitario, decimal ValorTotal, string? ProcessoSei, string Objetivo,
    string Situacao, string? Banco, string? Agencia, string? Conta, string? CidadeOrigem, DateTime CriadoEm);

public record RelatorioTotaisDto(int Diarias, int Servidores, decimal Quantidade, decimal ValorTotal);
public record RelatorioDto(PagedResult<RelatorioLinhaDto> Linhas, RelatorioTotaisDto Totais);

public record SerieDto(string Rotulo, decimal Valor, int Quantidade);
public record DashboardDto(RelatorioTotaisDto Totais, List<SerieDto> PorRegiao, List<SerieDto> PorTipo, List<SerieDto> PorDestino,
    List<SerieDto> PorUnidade, List<SerieDto> PorOrigem, decimal ValorPassagens, int Passagens);

public record AuditoriaFiltro(string? Entidade, string? Usuario, DateOnly? DataInicio, DateOnly? DataFim, int Page = 1, int PageSize = 50);
public record AuditoriaDto(long Id, string Entidade, string EntidadeId, string RaizEntidade, string RaizId, string Acao,
    string? UsuarioNome, DateTime DataHora, JsonElement Alteracoes);

/// <summary>
/// Relatórios por item de diária (uma linha por período × tipo, ex.: "2 Integrais" e "1 Parcial" da mesma viagem).
/// Um período entra no filtro de datas quando se sobrepõe ao intervalo pedido e conta pelo valor integral.
/// Situação padrão: vigentes (PENDENTE + APROVADA); "TODAS" inclui rejeitadas e canceladas.
/// </summary>
public class RelatoriosService
{
    private readonly DiariasContext _db;

    public RelatoriosService(DiariasContext db) => _db = db;

    /// <summary>Consulta-base filtrada (um registro por item de diária), compartilhada com as análises (AnalisesService).</summary>
    public IQueryable<DiariaItem> Base(RelatorioFiltro f)
    {
        var q = from i in _db.DiariasItens.AsNoTracking()
                join p in Periodos(f) on i.PeriodoId equals p.Id
                select i;
        if (f.TipoDiariaId.HasValue) q = q.Where(i => i.TipoDiariaId == f.TipoDiariaId);
        return q;
    }

    /// <summary>Períodos que atendem ao filtro (todos os critérios, menos o tipo de diária, que é do item).</summary>
    public IQueryable<DiariaPeriodo> Periodos(RelatorioFiltro f)
    {
        var q = _db.DiariasPeriodos.AsNoTracking().AsQueryable();
        q = f.Situacao switch
        {
            null or "" or "VIGENTES" => q.Where(p => SituacaoDiaria.Vigentes.Contains(p.Diaria.Situacao)),
            "TODAS" => q,
            _ => q.Where(p => p.Diaria.Situacao == f.Situacao)
        };
        if (!string.IsNullOrWhiteSpace(f.Origem)) q = q.Where(p => p.Diaria.Origem == f.Origem);
        // Data da diária: o período entra quando se sobrepõe ao intervalo.
        if (f.DataInicio.HasValue) q = q.Where(p => p.DataFim >= f.DataInicio);
        if (f.DataFim.HasValue) q = q.Where(p => p.DataInicio <= f.DataFim);
        // Data do cadastro: dia do lançamento no sistema (no legado, a data de digitação).
        if (f.CadastroInicio.HasValue)
        {
            var ini = RelatorioFiltro.InicioDoDiaUtc(f.CadastroInicio.Value);
            q = q.Where(p => p.Diaria.CriadoEm >= ini);
        }
        if (f.CadastroFim.HasValue)
        {
            var fim = RelatorioFiltro.InicioDoDiaUtc(f.CadastroFim.Value.AddDays(1));
            q = q.Where(p => p.Diaria.CriadoEm < fim);
        }
        if (f.CidadeOrigemId == RelatorioFiltro.NaoInformado) q = q.Where(p => p.OrigemMunicipioId == null);
        else if (f.CidadeOrigemId.HasValue) q = q.Where(p => p.OrigemMunicipioId == f.CidadeOrigemId);
        if (f.UnidadeId == RelatorioFiltro.NaoInformado) q = q.Where(p => p.Diaria.UnidadeId == null);
        else if (f.UnidadeId.HasValue) q = q.Where(p => p.Diaria.UnidadeId == f.UnidadeId);
        if (f.UnidadeIds is { Length: > 0 } unidades) q = q.Where(p => p.Diaria.UnidadeId != null && unidades.Contains(p.Diaria.UnidadeId.Value));
        if (f.DestinoMunicipioId == RelatorioFiltro.NaoInformado) q = q.Where(p => p.DestinoMunicipioId == null);
        else if (f.DestinoMunicipioId.HasValue) q = q.Where(p => p.DestinoMunicipioId == f.DestinoMunicipioId);
        if (f.CargoId == RelatorioFiltro.NaoInformado) q = q.Where(p => p.Diaria.CargoId == null);
        else if (f.CargoId.HasValue) q = q.Where(p => p.Diaria.CargoId == f.CargoId);
        if (f.ServidorId.HasValue) q = q.Where(p => p.Diaria.ServidorId == f.ServidorId);
        if (f.Vinculo.HasValue) q = q.Where(p => p.Diaria.Vinculo == f.Vinculo);
        if (f.RegiaoId == RelatorioFiltro.NaoInformado)
            q = q.Where(p => !_db.RegioesMunicipios.Any(rm => rm.MunicipioId == p.DestinoMunicipioId));
        else if (f.RegiaoId.HasValue)
            q = q.Where(p => _db.RegioesMunicipios.Any(rm => rm.RegiaoId == f.RegiaoId && rm.MunicipioId == p.DestinoMunicipioId));
        if (!string.IsNullOrWhiteSpace(f.Servidor))
        {
            // Nome, matrícula (nova ou antiga), CPF ou processo SEI.
            var termo = $"%{f.Servidor.Trim()}%";
            var digitos = CifraDelphi.SomenteDigitos(f.Servidor);
            q = q.Where(p => EF.Functions.ILike(EF.Functions.Unaccent(p.Diaria.Servidor.Nome), EF.Functions.Unaccent(termo))
                             || EF.Functions.ILike(p.Diaria.Servidor.Matricula ?? "", termo)
                             || EF.Functions.ILike(p.Diaria.Servidor.MatriculaAntiga ?? "", termo)
                             || EF.Functions.ILike(p.Diaria.ProcessoSei ?? "", termo)
                             || (digitos.Length >= 3 && (p.Diaria.Servidor.Cpf ?? "").Contains(digitos)));
        }
        return q;
    }

    private IQueryable<RelatorioLinhaDto> Projetar(IQueryable<DiariaItem> q) =>
        // Mais recente primeiro: data da diária, depois data do cadastro (pedido da SEAP em 27/10/2026).
        q.OrderByDescending(i => i.Periodo.DataInicio).ThenByDescending(i => i.Periodo.Diaria.CriadoEm)
            .ThenBy(i => i.Periodo.Diaria.Servidor.Nome).ThenBy(i => i.Id)
            .Select(i => new RelatorioLinhaDto(
                i.Periodo.DiariaId, i.Periodo.Diaria.LegadoCodigo, i.Periodo.Diaria.Origem,
                i.Periodo.Diaria.Servidor.Nome, i.Periodo.Diaria.Servidor.Cpf, i.Periodo.Diaria.Servidor.Matricula,
                i.Periodo.Diaria.Vinculo,
                i.Periodo.Diaria.Cargo != null ? i.Periodo.Diaria.Cargo.Nome : null,
                i.Periodo.Diaria.Unidade != null ? i.Periodo.Diaria.Unidade.Nome : null,
                i.Periodo.DestinoMunicipio != null ? i.Periodo.DestinoMunicipio.Nome + "/" + i.Periodo.DestinoMunicipio.Uf.Sigla
                    : (i.Periodo.DestinoTexto ?? "—"),
                _db.RegioesMunicipios.Where(rm => rm.MunicipioId == i.Periodo.DestinoMunicipioId).Select(rm => rm.Regiao.Nome).FirstOrDefault(),
                i.TipoDiaria.Nome, i.Periodo.DataInicio, i.Periodo.DataFim, i.Quantidade, i.ValorUnitario, i.ValorTotal,
                i.Periodo.Diaria.ProcessoSei, i.Periodo.Diaria.Objetivo, i.Periodo.Diaria.Situacao,
                i.Periodo.Diaria.Servidor.Banco, i.Periodo.Diaria.Servidor.Agencia, i.Periodo.Diaria.Servidor.Conta,
                i.Periodo.OrigemMunicipio != null ? i.Periodo.OrigemMunicipio.Nome + "/" + i.Periodo.OrigemMunicipio.Uf.Sigla
                    : i.Periodo.OrigemTexto,
                i.Periodo.Diaria.CriadoEm));

    public static async Task<RelatorioTotaisDto> Totais(IQueryable<DiariaItem> q)
    {
        var t = await q.GroupBy(_ => 1).Select(g => new
        {
            Diarias = g.Select(i => i.Periodo.DiariaId).Distinct().Count(),
            Servidores = g.Select(i => i.Periodo.ServidorId).Distinct().Count(),
            Quantidade = g.Sum(i => i.TipoDiaria.ValorLivre ? 0 : i.Quantidade), // tipo "valor livre" (v004) era passagem, não diária
            Valor = g.Sum(i => i.ValorTotal)
        }).FirstOrDefaultAsync();
        return t == null ? new RelatorioTotaisDto(0, 0, 0, 0) : new RelatorioTotaisDto(t.Diarias, t.Servidores, t.Quantidade, t.Valor);
    }

    public async Task<RelatorioDto> ConsultarAsync(RelatorioFiltro f)
    {
        var (page, pageSize) = PagedResult<RelatorioLinhaDto>.Normalizar(f.Page, f.PageSize);
        var q = Base(f);
        var totais = await Totais(q);
        var total = await q.CountAsync();
        var linhas = await Projetar(q).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return new RelatorioDto(new PagedResult<RelatorioLinhaDto>(linhas, page, pageSize, total), totais);
    }

    /// <summary>
    /// Planilha no formato da Controladoria. Valores e datas vão como números/datas nativos do Excel com
    /// formatação pt-BR, então não há troca de ponto por vírgula nem conversão manual.
    /// A ordem/nomes das colunas estão concentrados em <see cref="ColunasControladoria"/>: ajuste ali quando
    /// recebermos o modelo oficial.
    /// </summary>
    public async Task<byte[]> ExportarXlsxAsync(RelatorioFiltro f)
    {
        var linhas = await Projetar(Base(f)).ToListAsync();

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Diárias");
        var colunas = ColunasControladoria;

        var periodo = (f.DataInicio, f.DataFim) switch
        {
            ({ } ini, { } fim) => $"{ini:dd/MM/yyyy} a {fim:dd/MM/yyyy}",
            ({ } ini, null) => $"a partir de {ini:dd/MM/yyyy}",
            (null, { } fim) => $"até {fim:dd/MM/yyyy}",
            _ => "todos os períodos"
        };
        ws.Cell(1, 1).Value = "SEAP - Relatório de Diárias";
        ws.Cell(1, 1).Style.Font.SetBold().Font.SetFontSize(14);
        var cadastro = (f.CadastroInicio, f.CadastroFim) switch
        {
            ({ } ini, { } fim) => $" · Cadastro: {ini:dd/MM/yyyy} a {fim:dd/MM/yyyy}",
            ({ } ini, null) => $" · Cadastro: a partir de {ini:dd/MM/yyyy}",
            (null, { } fim) => $" · Cadastro: até {fim:dd/MM/yyyy}",
            _ => ""
        };
        ws.Cell(2, 1).Value = $"Data da diária: {periodo}{cadastro} · Gerado em {DateTime.Now:dd/MM/yyyy HH:mm}";

        const int cab = 4;
        for (var c = 0; c < colunas.Length; c++)
        {
            var cell = ws.Cell(cab, c + 1);
            cell.Value = colunas[c].Titulo;
            cell.Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#002B5C")).Font.SetFontColor(XLColor.White);
        }

        var linha = cab + 1;
        foreach (var l in linhas)
        {
            for (var c = 0; c < colunas.Length; c++)
            {
                var cell = ws.Cell(linha, c + 1);
                cell.Value = colunas[c].Valor(l);
                if (colunas[c].Formato != null) cell.Style.NumberFormat.Format = colunas[c].Formato;
            }
            linha++;
        }

        // Linha de total
        var colQtd = Array.FindIndex(colunas, c => c.Titulo == "Qtd. Diárias") + 1;
        var colTotal = Array.FindIndex(colunas, c => c.Titulo == "Valor Total") + 1;
        ws.Cell(linha, 1).Value = "TOTAL";
        ws.Cell(linha, colQtd).Value = linhas.Sum(l => l.Quantidade);
        ws.Cell(linha, colQtd).Style.NumberFormat.Format = "#,##0.0";
        ws.Cell(linha, colTotal).Value = linhas.Sum(l => l.ValorTotal);
        ws.Cell(linha, colTotal).Style.NumberFormat.Format = FormatoMoeda;
        ws.Row(linha).Style.Font.SetBold();

        if (linhas.Count > 0) ws.Range(cab, 1, linha - 1, colunas.Length).SetAutoFilter();
        ws.SheetView.FreezeRows(cab);
        ws.Columns().AdjustToContents(cab, linha, 8, 60);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ------------------------------------------------------------------ Mapa de Diárias e Passagens (Controladoria)

    private sealed record MapaPeriodo(int PeriodoId, string Servidor, string? Matricula, string? Cpf, string? Cargo, string Objetivo,
        string? ProcessoSei, string? Observacao, DateTime CriadoEm, DateOnly DataInicio, DateOnly DataFim,
        string? OrigemNome, string? OrigemUf, string? OrigemUfNome, string? OrigemTexto,
        string? DestinoNome, string? DestinoUf, string? DestinoUfNome, string? DestinoTexto,
        List<MapaItem> Itens, DiariaPassagem? Passagem);

    private sealed record MapaItem(string Coluna, decimal Quantidade, decimal ValorUnitario);

    /// <summary>
    /// ANEXO VII - Mapa de Diárias e Passagens (Portaria SCGE 27/2022), no mesmo layout da planilha mensal que a SEAP
    /// envia à Controladoria (modelo em Recursos/mapa_diarias_passagens.xlsx, tirado da planilha de setembro/2026 do
    /// legado): uma linha por período, integrais e parciais em colunas, passagem nas colunas M–S, fórmulas nas
    /// células cinzas. Mesmos filtros dos relatórios; o mês enviado é normalmente o da data do cadastro.
    /// </summary>
    public async Task<byte[]> ExportarMapaAsync(RelatorioFiltro f)
    {
        var periodos = Periodos(f);
        if (f.TipoDiariaId.HasValue) periodos = periodos.Where(p => p.Itens.Any(i => i.TipoDiariaId == f.TipoDiariaId));
        var dados = await periodos
            .OrderBy(p => p.Diaria.CriadoEm).ThenBy(p => p.Diaria.Servidor.Nome).ThenBy(p => p.DataInicio).ThenBy(p => p.Id)
            .Select(p => new MapaPeriodo(p.Id, p.Diaria.Servidor.Nome, p.Diaria.Servidor.Matricula, p.Diaria.Servidor.Cpf,
                p.Diaria.Cargo != null ? p.Diaria.Cargo.Nome : p.Diaria.Servidor.Cargo != null ? p.Diaria.Servidor.Cargo.Nome : null,
                p.Diaria.Objetivo, p.Diaria.ProcessoSei, p.Diaria.Observacao, p.Diaria.CriadoEm, p.DataInicio, p.DataFim,
                p.OrigemMunicipio != null ? p.OrigemMunicipio.Nome : null, p.OrigemMunicipio != null ? p.OrigemMunicipio.Uf.Sigla : null,
                p.OrigemMunicipio != null ? p.OrigemMunicipio.Uf.Nome : null, p.OrigemTexto,
                p.DestinoMunicipio != null ? p.DestinoMunicipio.Nome : null, p.DestinoMunicipio != null ? p.DestinoMunicipio.Uf.Sigla : null,
                p.DestinoMunicipio != null ? p.DestinoMunicipio.Uf.Nome : null, p.DestinoTexto,
                p.Itens.Select(i => new MapaItem(i.TipoDiaria.ColunaMapa, i.Quantidade, i.ValorUnitario)).ToList(),
                p.Passagem))
            .AsSplitQuery()
            .ToListAsync();

        using var modelo = typeof(RelatoriosService).Assembly.GetManifestResourceStream("DiariasSeap.Api.Recursos.mapa_diarias_passagens.xlsx")
                           ?? throw new InvalidOperationException("Modelo do Mapa de Diárias não encontrado.");
        using var wb = new XLWorkbook(modelo);
        var ws = wb.Worksheet(1);
        ws.Name = NomeAba(f);
        ws.Cell("A4").Value = $"ATUALIZADO EM {DateTime.UtcNow.AddHours(-3):dd/MM/yyyy}";

        const int primeira = 8, colunas = 29;
        var linha = primeira;
        foreach (var p in dados)
        {
            // Integrais e parciais com valores unitários diferentes no mesmo período (ex.: dois tipos integrais)
            // ocupam linhas extras, para que a fórmula (T×U)+(V×W) feche com o valor lançado.
            var integrais = Agrupar(p.Itens, ColunasMapa.Integral);
            var parciais = Agrupar(p.Itens, ColunasMapa.Parcial);
            var n = Math.Max(1, Math.Max(integrais.Count, parciais.Count));
            for (var k = 0; k < n; k++, linha++)
            {
                if (linha > primeira)
                    for (var c = 1; c <= colunas; c++) ws.Cell(linha, c).Style = ws.Cell(primeira, c).Style;
                var passagem = k == 0 ? p.Passagem : null;
                var (intQtd, intUnit) = k < integrais.Count ? integrais[k] : (0m, 0m);
                var (parQtd, parUnit) = k < parciais.Count ? parciais[k] : (0m, 0m);
                XLCellValue[] valores =
                {
                    "SEAP", "SEAP", p.Servidor, p.Matricula ?? "", (p.Cargo ?? "").ToUpperInvariant(), p.Objetivo, 0, "",
                    Uf(p.OrigemUfNome, p.OrigemTexto), Cidade(p.OrigemNome, p.OrigemUf, p.OrigemTexto),
                    Uf(p.DestinoUfNome, p.DestinoTexto), Cidade(p.DestinoNome, p.DestinoUf, p.DestinoTexto),
                    p.DataInicio.ToDateTime(TimeOnly.MinValue), p.DataFim.ToDateTime(TimeOnly.MinValue),
                    passagem?.Agencia is { } ag ? ag : 0, passagem?.Categoria is { } cat ? cat : 0,
                    passagem?.ValorIda ?? 0, passagem?.ValorVolta ?? 0, Blank.Value,
                    intQtd, intUnit, parQtd, parUnit, intQtd + parQtd, Blank.Value, Blank.Value,
                    p.ProcessoSei ?? "", FormatarCpf(p.Cpf ?? ""), p.Observacao ?? ""
                };
                for (var c = 0; c < valores.Length; c++)
                    if (!valores[c].IsBlank) ws.Cell(linha, c + 1).Value = valores[c];
                ws.Cell(linha, 19).FormulaA1 = $"Q{linha}+R{linha}";
                ws.Cell(linha, 25).FormulaA1 = $"(T{linha}*U{linha})+(V{linha}*W{linha})";
                ws.Cell(linha, 26).FormulaA1 = $"S{linha}+Y{linha}";
            }
        }
        // Nota 1 do modelo: sem diárias nem passagens no período, informar expressamente na primeira linha.
        if (dados.Count == 0) ws.Cell(primeira, 3).Value = "NÃO HOUVE DIÁRIAS NEM PASSAGENS NO PERÍODO";

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static List<(decimal Qtd, decimal Unit)> Agrupar(List<MapaItem> itens, string coluna) =>
        itens.Where(i => i.Coluna == coluna).GroupBy(i => i.ValorUnitario)
            .Select(g => (g.Sum(i => i.Quantidade), g.Key)).OrderByDescending(x => x.Item1).ToList();

    /// <summary>"ITAQUITINGA - PE", como no legado; períodos migrados sem município identificado usam o texto original.</summary>
    private static string Cidade(string? nome, string? uf, string? texto) =>
        nome != null ? $"{nome.ToUpperInvariant()} - {uf}" : (texto ?? "").ToUpperInvariant();

    private static readonly System.Globalization.TextInfo PtBr = new System.Globalization.CultureInfo("pt-BR").TextInfo;

    /// <summary>
    /// Nome do estado como no legado ("Pernambuco", "Rio Grande do Norte"). Período migrado sem município identificado
    /// (só o texto, quase sempre sigla de unidade da SEAP) sai como Pernambuco, que era o padrão do legado.
    /// </summary>
    private static string Uf(string? nome, string? texto) =>
        nome == null ? (texto != null ? "Pernambuco" : "") : string.Join(' ', PtBr.ToTitleCase(nome.ToLowerInvariant()).Split(' ')
            .Select(p => p is "De" or "Do" or "Da" or "Dos" or "Das" ? p.ToLowerInvariant() : p));

    /// <summary>"2026 - SETEMBRO" quando o filtro (cadastro ou, na falta dele, data da diária) é um mês fechado.</summary>
    private static string NomeAba(RelatorioFiltro f)
    {
        var (ini, fim) = f.CadastroInicio.HasValue || f.CadastroFim.HasValue ? (f.CadastroInicio, f.CadastroFim) : (f.DataInicio, f.DataFim);
        if (ini is { Day: 1 } i && fim is { } t && t.Year == i.Year && t.Month == i.Month && t.AddDays(1).Day == 1)
            return $"{i.Year} - {new System.Globalization.CultureInfo("pt-BR").DateTimeFormat.GetMonthName(i.Month).ToUpperInvariant()}";
        return "MAPA";
    }

    private const string FormatoMoeda = "\"R$\" #,##0.00";
    private const string FormatoData = "dd/mm/yyyy";

    private record Coluna(string Titulo, Func<RelatorioLinhaDto, XLCellValue> Valor, string? Formato = null);

    private static readonly Coluna[] ColunasControladoria =
    {
        new("Nº Diária", l => l.DiariaId),
        new("Nº Legado", l => l.LegadoCodigo.HasValue ? l.LegadoCodigo.Value : ""),
        new("Servidor", l => l.Servidor),
        new("CPF", l => FormatarCpf(l.Cpf ?? "")),
        new("Matrícula", l => l.Matricula ?? ""),
        new("Vínculo", l => l.Vinculo.ToString()),
        new("Cargo", l => l.Cargo ?? ""),
        new("Lotação", l => l.Unidade ?? ""),
        new("Cidade de origem", l => l.CidadeOrigem ?? ""),
        new("Destino", l => l.Destino),
        new("Região", l => l.Regiao ?? ""),
        new("Tipo", l => l.TipoDiaria),
        new("Data Início", l => l.DataInicio.ToDateTime(TimeOnly.MinValue), FormatoData),
        new("Data Fim", l => l.DataFim.ToDateTime(TimeOnly.MinValue), FormatoData),
        new("Qtd. Diárias", l => l.Quantidade, "#,##0.0"),
        new("Valor Unitário", l => l.ValorUnitario, FormatoMoeda),
        new("Valor Total", l => l.ValorTotal, FormatoMoeda),
        new("Processo SEI", l => l.ProcessoSei ?? ""),
        new("Objetivo", l => l.Objetivo),
        new("Banco", l => l.Banco ?? ""),
        new("Agência", l => l.Agencia ?? ""),
        new("Conta", l => l.Conta ?? ""),
        new("Data do cadastro", l => l.CriadoEm.AddHours(-3).Date, FormatoData),
        new("Situação", l => l.Situacao),
        new("Origem", l => l.Origem),
    };

    private static string FormatarCpf(string cpf) =>
        cpf.Length == 11 ? $"{cpf[..3]}.{cpf[3..6]}.{cpf[6..9]}-{cpf[9..]}" : cpf;

    // ------------------------------------------------------------------ dashboard

    /// <summary>Painel: totais e agrupamentos para qualquer filtro (data da diária e/ou data do cadastro). A evolução
    /// no tempo vem de AnalisesService.SerieAsync, que também escolhe a data de referência.</summary>
    public async Task<DashboardDto> DashboardAsync(RelatorioFiltro f)
    {
        var q = Base(f);
        var totais = await Totais(q);

        var porRegiao = await (
                from i in q
                join rm in _db.RegioesMunicipios on i.Periodo.DestinoMunicipioId equals rm.MunicipioId into rms
                from rm in rms.DefaultIfEmpty()
                group i.ValorTotal by rm != null ? rm.Regiao.Nome : null into g
                select new SerieDto(g.Key ?? "Sem região", g.Sum(), g.Count()))
            .ToListAsync();

        var porTipo = await q.GroupBy(i => i.TipoDiaria.Nome)
            .Select(g => new SerieDto(g.Key, g.Sum(i => i.ValorTotal), g.Count())).ToListAsync();

        var porDestino = await q.GroupBy(i => i.Periodo.DestinoMunicipio != null ? i.Periodo.DestinoMunicipio.Nome : "Sem município")
            .Select(g => new SerieDto(g.Key, g.Sum(i => i.ValorTotal), g.Count()))
            .ToListAsync();

        var porUnidade = await q.GroupBy(i => i.Periodo.Diaria.Unidade != null ? i.Periodo.Diaria.Unidade.Nome : "Sem lotação")
            .Select(g => new SerieDto(g.Key, g.Sum(i => i.ValorTotal), g.Count()))
            .ToListAsync();

        var porOrigem = await q.GroupBy(i => i.Periodo.OrigemMunicipio != null ? i.Periodo.OrigemMunicipio.Nome : "Sem cidade de origem")
            .Select(g => new SerieDto(g.Key, g.Sum(i => i.ValorTotal), g.Count()))
            .ToListAsync();

        // Agregação no banco; ordenação/corte em memória (poucos grupos).
        // Passagens aéreas não são itens de diária: somadas à parte, pelos mesmos filtros (exceto tipo de diária).
        var passagens = await Periodos(f).Where(p => p.Passagem != null)
            .GroupBy(_ => 1).Select(g => new { Valor = g.Sum(p => p.Passagem!.ValorTotal), Qtd = g.Count() }).FirstOrDefaultAsync();

        static List<SerieDto> Top(List<SerieDto> l, int n = int.MaxValue) => l.OrderByDescending(s => s.Valor).Take(n).ToList();
        return new DashboardDto(totais, Top(porRegiao), Top(porTipo), Top(porDestino, 10), Top(porUnidade, 10), Top(porOrigem, 10),
            passagens?.Valor ?? 0, passagens?.Qtd ?? 0);
    }

    // ------------------------------------------------------------------ auditoria geral

    public async Task<PagedResult<AuditoriaDto>> AuditoriaAsync(AuditoriaFiltro f)
    {
        var (page, pageSize) = PagedResult<AuditoriaDto>.Normalizar(f.Page, f.PageSize);
        var q = _db.Auditoria.AsNoTracking().Where(a => a.Modulo == DiariasContext.Modulo);
        if (!string.IsNullOrWhiteSpace(f.Entidade)) q = q.Where(a => a.Entidade == f.Entidade || a.RaizEntidade == f.Entidade);
        if (!string.IsNullOrWhiteSpace(f.Usuario)) q = q.Where(a => EF.Functions.ILike(a.UsuarioNome ?? "", $"%{f.Usuario.Trim()}%"));
        if (f.DataInicio.HasValue)
        {
            var ini = f.DataInicio.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local).ToUniversalTime();
            q = q.Where(a => a.DataHora >= ini);
        }
        if (f.DataFim.HasValue)
        {
            var fim = f.DataFim.Value.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Local).ToUniversalTime();
            q = q.Where(a => a.DataHora < fim);
        }

        var total = await q.CountAsync();
        var itens = await q.OrderByDescending(a => a.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return new PagedResult<AuditoriaDto>(itens.Select(a => new AuditoriaDto(a.Id, a.Entidade, a.EntidadeId, a.RaizEntidade,
            a.RaizId, a.Acao, a.UsuarioNome, a.DataHora, JsonDocument.Parse(a.Alteracoes).RootElement.Clone())).ToList(),
            page, pageSize, total);
    }
}
