using System.Linq.Expressions;
using DiariasSeap.Api.Dados;
using DiariasSeap.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;

namespace DiariasSeap.Api.Servicos;

public record RankingItemDto(string Chave, string Rotulo, string? Detalhe, decimal Valor, int Diarias, int Servidores,
    decimal Quantidade, decimal Percentual, decimal PercentualAcumulado, string Classe);
public record ClasseResumoDto(string Classe, int Itens, decimal PercentualItens, decimal Valor, decimal PercentualValor);
public record PontoCurvaDto(decimal PercentualItens, decimal PercentualValor);
public record RankingDto(string Dimensao, int TotalItens, decimal ValorTotal, List<RankingItemDto> Itens,
    List<ClasseResumoDto> Classes, List<PontoCurvaDto> Curva);
public record PontoSerieDto(string Chave, string Rotulo, DateOnly Inicio, DateOnly Fim, decimal Valor, int Diarias);
public record SerieDto2(string Granularidade, List<PontoSerieDto> Pontos);
public record DestaqueDto(string Dimensao, int TotalItens, List<RankingItemDto> Top, decimal PercentualTop);
public record VisaoGeralDto(RelatorioTotaisDto Totais, decimal ValorMedioPorDiaria, decimal ValorMedioPorServidor,
    ClasseResumoDto? ServidoresClasseA, List<DestaqueDto> Destaques);

/// <summary>
/// Análises gerenciais com curva ABC e drill down. Toda agregação é feita no banco sobre uma projeção
/// comum (<see cref="Linha"/>), a mesma consulta-base filtrada dos relatórios. Classes ABC pelo valor
/// acumulado: A até 80%, B até 95%, C o restante (o item que cruza a fronteira fica na classe anterior).
/// </summary>
public class AnalisesService
{
    public static readonly string[] Dimensoes = { "lotacao", "servidor", "destino", "regiao", "tipo", "vinculo", "cargo", "origem", "situacao" };
    private const decimal LimiteA = 80m, LimiteB = 95m;
    private const int MaxItensRanking = 500;

    private readonly DiariasContext _db;
    private readonly RelatoriosService _relatorios;

    public AnalisesService(DiariasContext db, RelatoriosService relatorios)
    {
        _db = db;
        _relatorios = relatorios;
    }

    private sealed record Agregado(string Chave, string Rotulo, string? Detalhe, decimal Valor, int Diarias, int Servidores, decimal Quantidade);

    /// <summary>Resultado bruto do GROUP BY (chave numérica ou texto, nome e detalhe para exibição).</summary>
    private sealed record Bruto(int? Id, string? Texto, string? Nome, string? Detalhe, decimal Valor, int Diarias, int Servidores, decimal Quantidade);

    /// <summary>Par (chave da dimensão, id) usado nas contagens distintas.</summary>
    public sealed class Par<TKey>
    {
        public TKey K { get; set; } = default!;
        public int V { get; set; }
    }

    private sealed class TrocaParametro(ParameterExpression de, ParameterExpression para) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == de ? para : base.VisitParameter(node);
    }

    /// <summary>Monta i =&gt; new Par { K = chave(i), V = id(i) } reaproveitando a expressão da chave.</summary>
    private static Expression<Func<DiariaItem, Par<TKey>>> ComPar<TKey>(Expression<Func<DiariaItem, TKey>> chave, Expression<Func<DiariaItem, int>> id)
    {
        var p = chave.Parameters[0];
        var corpoId = new TrocaParametro(id.Parameters[0], p).Visit(id.Body);
        return Expression.Lambda<Func<DiariaItem, Par<TKey>>>(Expression.MemberInit(Expression.New(typeof(Par<TKey>)),
            Expression.Bind(typeof(Par<TKey>).GetProperty(nameof(Par<TKey>.K))!, chave.Body),
            Expression.Bind(typeof(Par<TKey>).GetProperty(nameof(Par<TKey>.V))!, corpoId)), p);
    }

    /// <summary>
    /// Agrupa os itens pela chave da dimensão, no banco. Contagens distintas (diárias, servidores) são feitas como
    /// SELECT DISTINCT (chave, id) seguido de GROUP BY chave: o EF traduz Distinct().Count() dentro do grupo como
    /// subconsulta correlacionada por grupo, que custava segundos em 100 mil itens.
    /// </summary>
    private static async Task<List<Bruto>> Agrupar<TKey>(IQueryable<DiariaItem> q, Expression<Func<DiariaItem, TKey>> chave,
        Func<TKey, (int? Id, string? Texto, string? Nome, string? Detalhe)> ler) where TKey : notnull
    {
        var somas = await q.GroupBy(chave)
            .Select(g => new { g.Key, Valor = g.Sum(i => i.ValorTotal), Quantidade = g.Sum(i => i.Quantidade) })
            .ToListAsync();
        var diarias = await q.Select(ComPar(chave, i => i.Periodo.DiariaId)).Distinct()
            .GroupBy(x => x.K).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        var servidores = await q.Select(ComPar(chave, i => i.Periodo.ServidorId)).Distinct()
            .GroupBy(x => x.K).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        var nDiarias = diarias.ToDictionary(x => x.Key, x => x.N);
        var nServidores = servidores.ToDictionary(x => x.Key, x => x.N);

        return somas.Select(g =>
        {
            var (id, texto, nome, detalhe) = ler(g.Key);
            return new Bruto(id, texto, nome, detalhe, g.Valor, nDiarias.GetValueOrDefault(g.Key), nServidores.GetValueOrDefault(g.Key), g.Quantidade);
        }).ToList();
    }

    private Task<List<Bruto>> AgruparDimensao(IQueryable<DiariaItem> q, string dimensao) => dimensao switch
    {
        "lotacao" => Agrupar(q, i => new { Id = i.Periodo.Diaria.UnidadeId, i.Periodo.Diaria.Unidade!.Nome, i.Periodo.Diaria.Unidade!.Sigla },
            k => (k.Id, null, k.Nome, k.Sigla)),
        "servidor" => Agrupar(q, i => new { Id = i.Periodo.ServidorId, i.Periodo.Diaria.Servidor.Nome, i.Periodo.Diaria.Servidor.Matricula },
            k => ((int?)k.Id, null, k.Nome, k.Matricula)),
        "destino" => Agrupar(q, i => new { Id = i.Periodo.DestinoMunicipioId, i.Periodo.DestinoMunicipio!.Nome, Uf = i.Periodo.DestinoMunicipio!.Uf.Sigla },
            k => (k.Id, null, k.Nome, k.Uf)),
        "regiao" => AgruparRegiao(q),
        "tipo" => Agrupar(q, i => new { Id = i.TipoDiariaId, i.TipoDiaria.Nome }, k => ((int?)k.Id, null, k.Nome, null)),
        "vinculo" => Agrupar(q, i => i.Periodo.Diaria.Vinculo, k => ((int?)(int)k, null, null, null)),
        "cargo" => Agrupar(q, i => new { Id = i.Periodo.Diaria.CargoId, i.Periodo.Diaria.Cargo!.Nome }, k => (k.Id, null, k.Nome, null)),
        "origem" => Agrupar(q, i => i.Periodo.Diaria.Origem, k => (null, k, null, null)),
        "situacao" => Agrupar(q, i => i.Periodo.Diaria.Situacao, k => (null, k, null, null)),
        _ => throw new Seap.Compartilhado.Respostas.RegraNegocioException("Dimensão de análise inválida.")
    };

    /// <summary>Região vem de comum.regiao_municipio pelo município de destino (LEFT JOIN: sem região = grupo próprio).</summary>
    private async Task<List<Bruto>> AgruparRegiao(IQueryable<DiariaItem> q)
    {
        var linhas = from i in q
                     join rm in _db.RegioesMunicipios on i.Periodo.DestinoMunicipioId equals (int?)rm.MunicipioId into rms
                     from rm in rms.DefaultIfEmpty()
                     select new { RegiaoId = rm != null ? (int?)rm.RegiaoId : null, Nome = rm != null ? rm.Regiao.Nome : null,
                         i.ValorTotal, i.Quantidade, i.Periodo.DiariaId, i.Periodo.ServidorId };
        var somas = await linhas.GroupBy(x => new { x.RegiaoId, x.Nome })
            .Select(g => new { g.Key.RegiaoId, g.Key.Nome, Valor = g.Sum(x => x.ValorTotal), Quantidade = g.Sum(x => x.Quantidade) })
            .ToListAsync();
        var diarias = await linhas.Select(x => new { x.RegiaoId, x.DiariaId }).Distinct()
            .GroupBy(x => x.RegiaoId).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        var servidores = await linhas.Select(x => new { x.RegiaoId, x.ServidorId }).Distinct()
            .GroupBy(x => x.RegiaoId).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        return somas.Select(g => new Bruto(g.RegiaoId, null, g.Nome, null, g.Valor,
            diarias.FirstOrDefault(d => d.Key == g.RegiaoId)?.N ?? 0,
            servidores.FirstOrDefault(d => d.Key == g.RegiaoId)?.N ?? 0, g.Quantidade)).ToList();
    }

    private async Task<List<Agregado>> AgregarAsync(RelatorioFiltro f, string dimensao)
    {
        var brutos = await AgruparDimensao(_relatorios.Base(f), dimensao);
        return brutos.Select(b =>
        {
            var (chave, rotulo) = Rotular(dimensao, b.Id, b.Texto, b.Nome);
            return new Agregado(chave, rotulo, b.Detalhe, b.Valor, b.Diarias, b.Servidores, b.Quantidade);
        }).ToList();
    }

    /// <summary>Chave usada no drill (vira filtro) e rótulo exibido. Grupo vazio usa chave "0" = "não informado".</summary>
    private static (string Chave, string Rotulo) Rotular(string dimensao, int? id, string? texto, string? nome) => dimensao switch
    {
        "vinculo" => (id.ToString()!, ((Vinculo)id!.Value).ToString()),
        "origem" => (texto!, texto == Origens.Legado ? "Migradas do legado" : "Lançadas no sistema"),
        "situacao" => (texto!, texto switch
        {
            SituacaoDiaria.Pendente => "Pendente", SituacaoDiaria.Aprovada => "Aprovada",
            SituacaoDiaria.Rejeitada => "Rejeitada", SituacaoDiaria.Cancelada => "Cancelada", _ => texto!
        }),
        _ when id == null => ("0", dimensao switch
        {
            "lotacao" => "Sem lotação",
            "destino" => "Sem município identificado",
            "regiao" => "Sem região",
            "cargo" => "Sem cargo",
            _ => "Não informado"
        }),
        _ => (id.Value.ToString(), nome ?? "—")
    };

    private static (List<RankingItemDto> Itens, List<ClasseResumoDto> Classes, List<PontoCurvaDto> Curva) Abc(List<Agregado> agregados)
    {
        var total = agregados.Sum(a => a.Valor);
        var ordenados = agregados.OrderByDescending(a => a.Valor).ThenBy(a => a.Rotulo).ToList();
        var itens = new List<RankingItemDto>(ordenados.Count);
        var curva = new List<PontoCurvaDto> { new(0, 0) };
        decimal acumulado = 0;
        for (var i = 0; i < ordenados.Count; i++)
        {
            var a = ordenados[i];
            var antes = total > 0 ? acumulado / total * 100 : 0;
            acumulado += a.Valor;
            var pct = total > 0 ? a.Valor / total * 100 : 0;
            var pctAcum = total > 0 ? acumulado / total * 100 : 0;
            var classe = antes < LimiteA ? "A" : antes < LimiteB ? "B" : "C";
            itens.Add(new RankingItemDto(a.Chave, a.Rotulo, a.Detalhe, a.Valor, a.Diarias, a.Servidores, a.Quantidade,
                decimal.Round(pct, 2), decimal.Round(pctAcum, 2), classe));
            curva.Add(new PontoCurvaDto(decimal.Round((i + 1) * 100m / ordenados.Count, 2), decimal.Round(pctAcum, 2)));
        }

        var classes = new[] { "A", "B", "C" }.Select(c =>
        {
            var doGrupo = itens.Where(x => x.Classe == c).ToList();
            var valor = doGrupo.Sum(x => x.Valor);
            return new ClasseResumoDto(c, doGrupo.Count,
                itens.Count > 0 ? decimal.Round(doGrupo.Count * 100m / itens.Count, 1) : 0, valor,
                total > 0 ? decimal.Round(valor / total * 100, 1) : 0);
        }).ToList();

        // Curva com no máximo ~200 pontos (servidores passam de 2 mil): amostra mantendo início e fim.
        if (curva.Count > 200)
        {
            var passo = (int)Math.Ceiling(curva.Count / 200.0);
            curva = curva.Where((_, i) => i % passo == 0 || i == curva.Count - 1).ToList();
        }
        return (itens, classes, curva);
    }

    public async Task<RankingDto> RankingAsync(string dimensao, RelatorioFiltro f)
    {
        var (itens, classes, curva) = Abc(await AgregarAsync(f, dimensao));
        return new RankingDto(dimensao, itens.Count, itens.Sum(i => i.Valor), itens.Take(MaxItensRanking).ToList(), classes, curva);
    }

    /// <summary>Evolução no tempo: mensal até 36 meses de intervalo, anual acima disso (ou sem intervalo).</summary>
    public async Task<SerieDto2> SerieAsync(RelatorioFiltro f)
    {
        var q = _relatorios.Base(f);
        var anual = !(f.DataInicio.HasValue && f.DataFim.HasValue)
                    || (f.DataFim.Value.Year - f.DataInicio.Value.Year) * 12 + f.DataFim.Value.Month - f.DataInicio.Value.Month >= 36;
        var nomesMes = new[] { "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez" };

        if (anual)
        {
            var anos = await q.GroupBy(i => i.Periodo.DataInicio.Year)
                .Select(g => new { Ano = g.Key, Valor = g.Sum(i => i.ValorTotal), Diarias = g.Select(i => i.Periodo.DiariaId).Distinct().Count() })
                .OrderBy(x => x.Ano).ToListAsync();
            // Anos implausíveis (erros de digitação do legado, ex.: 0026) ficam fora do gráfico; seguem nos relatórios.
            return new SerieDto2("ano", anos.Where(a => a.Ano >= 2010 && a.Ano <= DateTime.Today.Year + 1)
                .Select(a => new PontoSerieDto(a.Ano.ToString(), a.Ano.ToString(), new DateOnly(a.Ano, 1, 1), new DateOnly(a.Ano, 12, 31), a.Valor, a.Diarias))
                .ToList());
        }

        var meses = await q.GroupBy(i => new { i.Periodo.DataInicio.Year, i.Periodo.DataInicio.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Valor = g.Sum(i => i.ValorTotal), Diarias = g.Select(i => i.Periodo.DiariaId).Distinct().Count() })
            .ToListAsync();
        var pontos = new List<PontoSerieDto>();
        for (var d = new DateOnly(f.DataInicio!.Value.Year, f.DataInicio.Value.Month, 1); d <= f.DataFim!.Value; d = d.AddMonths(1))
        {
            var m = meses.FirstOrDefault(x => x.Year == d.Year && x.Month == d.Month);
            pontos.Add(new PontoSerieDto($"{d:yyyy-MM}", $"{nomesMes[d.Month - 1]}/{d:yy}", d, d.AddMonths(1).AddDays(-1), m?.Valor ?? 0, m?.Diarias ?? 0));
        }
        return new SerieDto2("mes", pontos);
    }

    /// <summary>
    /// Visão geral: totais, médias e concentração (quantos servidores formam 80% do valor). Os destaques por dimensão
    /// são carregados pela tela em paralelo via <see cref="RankingAsync"/>, uma requisição por dimensão.
    /// </summary>
    public async Task<VisaoGeralDto> VisaoGeralAsync(RelatorioFiltro f)
    {
        var totais = await RelatoriosService.Totais(_relatorios.Base(f));
        var (_, classes, _) = Abc(await AgregarAsync(f, "servidor"));
        return new VisaoGeralDto(totais,
            totais.Quantidade > 0 ? decimal.Round(totais.ValorTotal / totais.Quantidade, 2) : 0,
            totais.Servidores > 0 ? decimal.Round(totais.ValorTotal / totais.Servidores, 2) : 0,
            classes.First(c => c.Classe == "A"), new List<DestaqueDto>());
    }
}
