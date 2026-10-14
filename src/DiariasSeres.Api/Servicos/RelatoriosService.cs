using System.Text.Json;
using ClosedXML.Excel;
using DiariasSeres.Api.Dados;
using DiariasSeres.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeres.Api.Servicos;

public record RelatorioFiltro(DateOnly? DataInicio, DateOnly? DataFim, string? Servidor, int? UnidadeId, int? DestinoMunicipioId,
    int? RegiaoId, int? TipoDiariaId, Vinculo? Vinculo, string? Situacao = null, string? Origem = null, int Page = 1, int PageSize = 50);

public record RelatorioLinhaDto(int DiariaId, int? LegadoCodigo, string Origem, string Servidor, string? Cpf, string? Matricula,
    Vinculo Vinculo, string? Cargo, string? Unidade, string Destino, string? Regiao, string TipoDiaria, DateOnly DataInicio,
    DateOnly DataFim, decimal Quantidade, decimal ValorUnitario, decimal ValorTotal, string? ProcessoSei, string Objetivo,
    string Situacao, string? Banco, string? Agencia, string? Conta);

public record RelatorioTotaisDto(int Diarias, int Servidores, decimal Quantidade, decimal ValorTotal);
public record RelatorioDto(PagedResult<RelatorioLinhaDto> Linhas, RelatorioTotaisDto Totais);

public record SerieDto(string Rotulo, decimal Valor, int Quantidade);
public record DashboardDto(int Ano, RelatorioTotaisDto Totais, List<SerieDto> PorMes, List<SerieDto> PorRegiao,
    List<SerieDto> PorTipo, List<SerieDto> PorDestino, List<SerieDto> PorUnidade);

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

    private IQueryable<DiariaItem> Base(RelatorioFiltro f)
    {
        var q = _db.DiariasItens.AsNoTracking().AsQueryable();
        q = f.Situacao switch
        {
            null or "" or "VIGENTES" => q.Where(i => SituacaoDiaria.Vigentes.Contains(i.Periodo.Diaria.Situacao)),
            "TODAS" => q,
            _ => q.Where(i => i.Periodo.Diaria.Situacao == f.Situacao)
        };
        if (!string.IsNullOrWhiteSpace(f.Origem)) q = q.Where(i => i.Periodo.Diaria.Origem == f.Origem);
        if (f.DataInicio.HasValue) q = q.Where(i => i.Periodo.DataFim >= f.DataInicio);
        if (f.DataFim.HasValue) q = q.Where(i => i.Periodo.DataInicio <= f.DataFim);
        if (f.UnidadeId.HasValue) q = q.Where(i => i.Periodo.Diaria.UnidadeId == f.UnidadeId);
        if (f.DestinoMunicipioId.HasValue) q = q.Where(i => i.Periodo.DestinoMunicipioId == f.DestinoMunicipioId);
        if (f.TipoDiariaId.HasValue) q = q.Where(i => i.TipoDiariaId == f.TipoDiariaId);
        if (f.Vinculo.HasValue) q = q.Where(i => i.Periodo.Diaria.Vinculo == f.Vinculo);
        if (f.RegiaoId.HasValue)
            q = q.Where(i => _db.RegioesMunicipios.Any(rm => rm.RegiaoId == f.RegiaoId && rm.MunicipioId == i.Periodo.DestinoMunicipioId));
        if (!string.IsNullOrWhiteSpace(f.Servidor))
        {
            var termo = $"%{f.Servidor.Trim()}%";
            var digitos = CifraDelphi.SomenteDigitos(f.Servidor);
            q = q.Where(i => EF.Functions.ILike(EF.Functions.Unaccent(i.Periodo.Diaria.Servidor.Nome), EF.Functions.Unaccent(termo))
                             || EF.Functions.ILike(i.Periodo.Diaria.Servidor.Matricula ?? "", termo)
                             || (digitos.Length >= 3 && (i.Periodo.Diaria.Servidor.Cpf ?? "").Contains(digitos)));
        }
        return q;
    }

    private IQueryable<RelatorioLinhaDto> Projetar(IQueryable<DiariaItem> q) =>
        q.OrderBy(i => i.Periodo.DataInicio).ThenBy(i => i.Periodo.Diaria.Servidor.Nome).ThenBy(i => i.Id)
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
                i.Periodo.Diaria.Servidor.Banco, i.Periodo.Diaria.Servidor.Agencia, i.Periodo.Diaria.Servidor.Conta));

    private static async Task<RelatorioTotaisDto> Totais(IQueryable<DiariaItem> q)
    {
        var t = await q.GroupBy(_ => 1).Select(g => new
        {
            Diarias = g.Select(i => i.Periodo.DiariaId).Distinct().Count(),
            Servidores = g.Select(i => i.Periodo.ServidorId).Distinct().Count(),
            Quantidade = g.Sum(i => i.Quantidade),
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
        ws.Cell(1, 1).Value = "SERES - Relatório de Diárias";
        ws.Cell(1, 1).Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {periodo} · Gerado em {DateTime.Now:dd/MM/yyyy HH:mm}";

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
        new("Situação", l => l.Situacao),
        new("Origem", l => l.Origem),
    };

    private static string FormatarCpf(string cpf) =>
        cpf.Length == 11 ? $"{cpf[..3]}.{cpf[3..6]}.{cpf[6..9]}-{cpf[9..]}" : cpf;

    // ------------------------------------------------------------------ dashboard

    public async Task<DashboardDto> DashboardAsync(int ano)
    {
        var f = new RelatorioFiltro(new DateOnly(ano, 1, 1), new DateOnly(ano, 12, 31), null, null, null, null, null, null);
        // Para séries por mês, o período conta no mês em que começa.
        var q = Base(f).Where(i => i.Periodo.DataInicio.Year == ano);
        var totais = await Totais(q);

        var meses = await q.GroupBy(i => i.Periodo.DataInicio.Month)
            .Select(g => new { Mes = g.Key, Valor = g.Sum(i => i.ValorTotal), Qtd = g.Count() }).ToListAsync();
        var nomesMes = new[] { "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez" };
        var porMes = Enumerable.Range(1, 12).Select(m =>
        {
            var x = meses.FirstOrDefault(v => v.Mes == m);
            return new SerieDto(nomesMes[m - 1], x?.Valor ?? 0, x?.Qtd ?? 0);
        }).ToList();

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

        // Agregação no banco; ordenação/corte em memória (poucos grupos).
        static List<SerieDto> Top(List<SerieDto> l, int n = int.MaxValue) => l.OrderByDescending(s => s.Valor).Take(n).ToList();
        return new DashboardDto(ano, totais, porMes, Top(porRegiao), Top(porTipo), Top(porDestino, 10), Top(porUnidade, 10));
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
