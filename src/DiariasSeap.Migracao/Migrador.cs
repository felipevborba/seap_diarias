using System.Globalization;
using System.Text;
using System.Text.Json;
using DiariasSeap.Api.Dados;
using DiariasSeap.Api.Modelos;
using DiariasSeap.Api.Servicos;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Modelos;

namespace DiariasSeap.Migracao;

/// <summary>
/// Migra as diárias do legado SISDIARIA (MySQL "diarias?seres", exportado em JSONL pelo Extrator) para o
/// schema diarias. Tudo numa única transação: sem --confirmar, executa até o fim e desfaz (ensaio).
/// Reexecutável: apaga as diárias de origem LEGADO e importa de novo; servidores criados são reaproveitados.
/// </summary>
public class Migrador
{
    private readonly DiariasContext _db;
    private readonly string _dirDados;
    private readonly string _dirRelatorio;
    private readonly Dictionary<string, List<string[]>> _relatorios = new();
    private readonly Action<string> _log;
    private readonly bool _forcar;

    public Migrador(DiariasContext db, string dirDados, string dirRelatorio, Action<string> log, bool forcar = false)
    {
        _forcar = forcar;
        _db = db;
        _dirDados = dirDados;
        _dirRelatorio = dirRelatorio;
        _log = log;
    }

    // ---------------------------------------------------------------- leitura do legado

    private List<Dictionary<string, string?>> Ler(string tabela)
    {
        var caminho = Path.Combine(_dirDados, tabela + ".jsonl");
        if (!File.Exists(caminho)) return new();
        return File.ReadLines(caminho, Encoding.UTF8)
            .Select(l => JsonSerializer.Deserialize<Dictionary<string, string?>>(l)!)
            .ToList();
    }

    private void Relatar(string arquivo, params string[] colunas)
    {
        if (!_relatorios.TryGetValue(arquivo, out var linhas)) _relatorios[arquivo] = linhas = new();
        linhas.Add(colunas);
    }

    private sealed record LegadoDiaria(
        int Codigo, string Status, string ServidorChave, string? Cpf, string? Matricula, string? Nome,
        string? Funcao, string? Cargo, string? Unidade, DateOnly Ida, DateOnly Volta, bool DatasInvertidas,
        decimal IntQtd, decimal IntUnit, decimal IntTotal, decimal ParQtd, decimal ParUnit, decimal ParTotal,
        string DestinoTexto, string? DestinoUf, string? Finalidade, string? Motivacao, string? Sei, string? Obs,
        string? Passagem, string Cadastrador, DateTime CriadoEm, string? DatasCorrigidas = null);

    // ---------------------------------------------------------------- execução

    public async Task<int> ExecutarAsync(bool confirmar)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        // Lado do servidor: se o cliente sumir (queda da VPN), a sessão é derrubada e a transação desfeita
        // em ~1 min, sem ficar segurando bloqueios nas diárias.
        await _db.Database.ExecuteSqlRawAsync(
            "SET LOCAL tcp_keepalives_idle = 30; SET LOCAL tcp_keepalives_interval = 10; SET LOCAL tcp_keepalives_count = 3; " +
            "SET LOCAL idle_in_transaction_session_timeout = '5min'");

        // 1. Policiais penais da Carteira -> servidores (mesma rotina do botão "Sincronizar").
        var sync = await new ServidoresService(_db).SincronizarPoliciaisAsync();
        _log($"Policiais sincronizados: {sync.Criados} criados, {sync.Atualizados} atualizados, {sync.Vinculados} vinculados.");

        // 2. Legado -> registros normalizados.
        var legado = CarregarLegado();
        _log($"Diárias lidas do legado: {legado.Count:N0} ({legado.Count(x => x.DatasCorrigidas != null):N0} com data corrigida — relatório datas_corrigidas.tsv)");

        // 3. Remove migração anterior (idempotência) — mas nunca por cima de trabalho feito no sistema novo:
        //    diária migrada que já foi editada/aprovada/rejeitada/cancelada tem registro de auditoria.
        var mexidas = await _db.Database.SqlQueryRaw<int>(
            "SELECT count(*)::int AS \"Value\" FROM diarias.diaria d WHERE d.origem = 'LEGADO' AND EXISTS (" +
            "SELECT 1 FROM comum.auditoria a WHERE a.modulo = 'DIARIAS' AND a.raiz_entidade = 'diaria' AND a.raiz_id = d.id::text)")
            .SingleAsync();
        if (mexidas > 0 && !_forcar)
            throw new InvalidOperationException($"{mexidas} diárias migradas já foram alteradas no sistema novo; reexecutar apagaria esse " +
                "trabalho. Migração interrompida (use --forcar somente se tiver certeza).");
        var apagadas = await _db.Database.ExecuteSqlRawAsync("DELETE FROM diarias.diaria WHERE origem = 'LEGADO'");
        if (apagadas > 0) _log($"Migração anterior removida: {apagadas:N0} diárias.");
        // Ensaios desfeitos consomem a sequência (nextval não volta no rollback); realinha para numerar sem saltos.
        await _db.Database.ExecuteSqlRawAsync(
            "SELECT setval('diarias.diaria_id_seq', COALESCE((SELECT max(id) FROM diarias.diaria), 0) + 1, false), " +
            "setval('diarias.diaria_periodo_id_seq', COALESCE((SELECT max(id) FROM diarias.diaria_periodo), 0) + 1, false)");

        // 4. Deduplicação de lançamentos idênticos.
        var unicas = Deduplicar(legado);

        // 5. Servidores, cargos, unidades, municípios, tipos.
        var cargos = await GarantirCargosAsync(unicas);
        var servidorIds = await ResolverServidoresAsync(unicas, cargos);
        var unidades = await _db.Unidades.AsNoTracking().ToListAsync();
        var municipios = await CarregarMunicipiosAsync();
        var tipos = await _db.TiposDiaria.AsNoTracking().ToDictionaryAsync(t => t.Nome, t => t.Id);
        int integral = tipos["Integral"], parcial = tipos["Parcial"];
        var cadastradores = Cadastradores();

        // 6. Sobreposições remanescentes -> isentas (e relatório).
        var isentos = MarcarSobreposicoes(unicas, servidorIds, await PeriodosSistemaAsync());

        // 7. Gravação em massa (COPY binário).
        var n = await GravarAsync(conn, unicas, servidorIds, cargos, unidades, municipios, integral, parcial, cadastradores, isentos);

        // Estatísticas das tabelas recém-carregadas (dentro da transação, enxerga as linhas novas): sem isso o
        // planejador as trata como vazias e escolhe planos quadráticos na conferência (visto em produção).
        await _db.Database.ExecuteSqlRawAsync("ANALYZE diarias.diaria, diarias.diaria_periodo, diarias.diaria_item, comum.servidor, comum.cargo");

        // 8. Conferência: totais do legado (após deduplicação) x totais gravados.
        var conferencia = await ConferirAsync(unicas);

        _db.Auditoria.Add(new RegistroAuditoria
        {
            Modulo = DiariasContext.Modulo, Entidade = "migracao_legado", EntidadeId = DateTime.UtcNow.ToString("yyyyMMddHHmmss"),
            RaizEntidade = "migracao_legado", RaizId = "SISDIARIA", Acao = "INCLUSAO", UsuarioNome = "Migração do legado",
            DataHora = DateTime.UtcNow,
            Alteracoes = JsonSerializer.Serialize(new { origem = "MySQL diarias?seres", lidas = legado.Count, gravadas = n, conferencia })
        });
        await _db.SaveChangesAsync();

        // A constraint de sobreposição é diferida: qualquer conflito não tratado aparece aqui, no commit.
        await _db.Database.ExecuteSqlRawAsync("SET CONSTRAINTS ALL IMMEDIATE");
        EscreverRelatorios();

        if (confirmar)
        {
            await tx.CommitAsync();
            _log("MIGRAÇÃO CONFIRMADA (commit).");
        }
        else
        {
            await tx.RollbackAsync();
            _log("Ensaio concluído: nada foi gravado (use --confirmar para efetivar).");
        }
        return n;
    }

    // ---------------------------------------------------------------- etapas

    private sealed record CorrecaoData(string IdaLegado, string VoltaLegado, DateOnly Ida, DateOnly Volta, string Evidencias);

    /// <summary>Correções de ano das datas (ferramentas/legado/analisar_datas.py), por código do legado.</summary>
    private Dictionary<int, CorrecaoData> CorrecoesDatas()
    {
        var arquivo = Path.Combine(AppContext.BaseDirectory, "correcoes_datas.tsv");
        if (!File.Exists(arquivo)) return new();
        return File.ReadLines(arquivo)
            .Where(l => l.Length > 0 && !l.StartsWith('#') && !l.StartsWith("codigo_legado"))
            .Select(l => l.Split('\t'))
            .ToDictionary(p => int.Parse(p[0]), p => new CorrecaoData(p[1], p[2], DateOnly.Parse(p[3]), DateOnly.Parse(p[4]), p[5]));
    }

    private List<LegadoDiaria> CarregarLegado()
    {
        var correcoes = CorrecoesDatas();
        // CPF por matrícula: tabelas de servidor (atual e cópias) e de-para de matrícula antiga -> nova.
        var cpfPorMatricula = new Dictionary<string, string>();
        foreach (var t in new[] { "servidor", "servidor_1", "servidor_antigo" })
            foreach (var s in Ler(t))
                if (Texto.Cpf(s["cpf"]) is { } c) cpfPorMatricula.TryAdd(Texto.Matricula(s["matricula"]), c);
        var novaMatricula = Ler("consultamatricula")
            .GroupBy(x => Texto.Matricula(x["matricula"])).ToDictionary(g => g.Key, g => Texto.Matricula(g.First()["novamatricula"]));

        var lista = new List<LegadoDiaria>();
        foreach (var r in Ler("diaria"))
        {
            var codigo = int.Parse(r["codigo"]!);
            var mat = Texto.Matricula(r["matricula"]);
            var cpf = Texto.Cpf(r["cpf"])
                      ?? cpfPorMatricula.GetValueOrDefault(mat)
                      ?? (novaMatricula.TryGetValue(mat, out var nova) ? cpfPorMatricula.GetValueOrDefault(nova) : null);
            var chave = cpf != null ? "cpf:" + cpf : mat.Length > 0 ? "mat:" + mat : null;
            if (chave == null)
            {
                Relatar("diarias_nao_migradas.tsv", codigo.ToString(), "sem CPF e sem matrícula", Texto.Limpo(r["nomedoservidor"]) ?? "");
                continue;
            }

            var ida = DateOnly.Parse(r["datadadiaria_ida"]!);
            var volta = DateOnly.Parse(r["datadadiaria_volta"]!);
            string? datasCorrigidas = null;
            if (correcoes.TryGetValue(codigo, out var corr))
            {
                // Só corrige se o legado ainda tiver as datas analisadas (se a área já corrigiu lá, vale o legado).
                if (corr.IdaLegado == r["datadadiaria_ida"] && corr.VoltaLegado == r["datadadiaria_volta"])
                {
                    datasCorrigidas = $"Ano das datas corrigido na migração: no sistema antigo constava {ida:dd/MM/yyyy} a {volta:dd/MM/yyyy} (evidências: {corr.Evidencias}).";
                    Relatar("datas_corrigidas.tsv", codigo.ToString(), Texto.Limpo(r["nomedoservidor"]) ?? "", $"{ida:dd/MM/yyyy}", $"{volta:dd/MM/yyyy}",
                        $"{corr.Ida:dd/MM/yyyy}", $"{corr.Volta:dd/MM/yyyy}", corr.Evidencias);
                    (ida, volta) = (corr.Ida, corr.Volta);
                }
                else
                    Relatar("correcoes_de_data_ignoradas.tsv", codigo.ToString(), $"legado agora: {r["datadadiaria_ida"]} a {r["datadadiaria_volta"]}",
                        $"esperado: {corr.IdaLegado} a {corr.VoltaLegado}");
            }
            var invertidas = volta < ida;
            if (invertidas)
            {
                (ida, volta) = (volta, ida);
                Relatar("datas_invertidas_corrigidas.tsv", codigo.ToString(), r["datadadiaria_ida"]!, r["datadadiaria_volta"]!);
            }

            var passagem = Texto.Decimal(r["passagem_valor_total_passagem"]) > 0
                ? $"Passagem ({Texto.Limpo(r["passagem_agencia_companhia_aerea"]) ?? "agência não informada"}): " +
                  Texto.Decimal(r["passagem_valor_total_passagem"]).ToString("C", new CultureInfo("pt-BR"))
                : null;

            if (volta > DateOnly.FromDateTime(DateTime.Today).AddMonths(6))
                Relatar("datas_futuras_suspeitas.tsv", codigo.ToString(), Texto.Limpo(r["nomedoservidor"]) ?? "",
                    ida.ToString("dd/MM/yyyy"), volta.ToString("dd/MM/yyyy"), r["data_cadastro"] ?? "");

            var criado = DateOnly.TryParse(r["data_cadastro"], out var dc) ? dc
                       : DateOnly.TryParse(r["data_digitacao"], out var dd) ? dd : ida;

            lista.Add(new LegadoDiaria(
                codigo, r["status"] ?? "Aprovado", chave, cpf, mat.Length > 0 ? mat : null, Texto.Limpo(r["nomedoservidor"]),
                Texto.Limpo(r["funcao"]), Texto.Limpo(r["cargo"]),
                Texto.Limpo(r["sigla_unidade_setor"]) ?? Texto.Limpo(r["unidade"]),
                ida, volta, invertidas,
                Texto.Decimal(r["integrais_quantidade"]), Texto.Decimal(r["integrais_valor_unitario"]), Texto.Decimal(r["integrais_valor_total"]),
                Texto.Decimal(r["parciais_quantidade"]), Texto.Decimal(r["parciais_valor_unitario"]), Texto.Decimal(r["parciais_valor_total"]),
                Texto.Limpo(r["cidade_destino"]) ?? "NÃO INFORMADO", Texto.Uf(r["uf_cidade"]),
                Texto.Limpo(r["finalidade"]), Texto.Limpo(r["motivacao"]), Texto.Limpo(r["numeroSei"]), Texto.Limpo(r["obs"]),
                passagem, r["cadastrador"] ?? "0",
                DateTime.SpecifyKind(criado.ToDateTime(new TimeOnly(12, 0)), DateTimeKind.Utc), datasCorrigidas));
        }
        return lista;
    }

    /// <summary>Lançamentos idênticos (mesmo servidor, datas e itens) viram um só; fica o aprovado de menor código.</summary>
    private List<LegadoDiaria> Deduplicar(List<LegadoDiaria> legado)
    {
        var unicas = new List<LegadoDiaria>();
        foreach (var g in legado.GroupBy(d => (d.ServidorChave, d.Ida, d.Volta, d.IntQtd, d.IntUnit, d.ParQtd, d.ParUnit)))
        {
            var ordenadas = g.OrderBy(d => d.Status == "Aprovado" ? 0 : d.Status == "Pendente" ? 1 : 2).ThenBy(d => d.Codigo).ToList();
            unicas.Add(ordenadas[0]);
            foreach (var dup in ordenadas.Skip(1))
                Relatar("duplicatas_removidas.tsv", dup.Codigo.ToString(), ordenadas[0].Codigo.ToString(), dup.Nome ?? "",
                    dup.Ida.ToString("dd/MM/yyyy"), dup.Volta.ToString("dd/MM/yyyy"), dup.Status);
        }
        _log($"Duplicatas exatas removidas: {legado.Count - unicas.Count:N0} (relatório duplicatas_removidas.tsv)");
        return unicas;
    }

    private async Task<Dictionary<string, int>> ResolverServidoresAsync(List<LegadoDiaria> diarias, Dictionary<string, int> cargos)
    {
        var existentes = await _db.Servidores.ToListAsync();
        var porCpf = existentes.Where(s => s.Cpf != null).ToDictionary(s => s.Cpf!);
        var porMatriculaSemCpf = existentes.Where(s => s.Cpf == null && s.Matricula != null).ToDictionary(s => s.Matricula!);
        var policiais = await _db.PoliciaisPenais.AsNoTracking().Select(p => new { p.Id, p.Cpf, p.Matricula }).ToListAsync();
        var cpfPorMatriculaCarteira = policiais.Where(p => Texto.Cpf(p.Cpf) != null && !string.IsNullOrEmpty(p.Matricula))
            .GroupBy(p => Texto.Matricula(p.Matricula)).ToDictionary(g => g.Key, g => Texto.Cpf(g.First().Cpf)!);
        var ativosLegado = Ler("servidor").Select(s => Texto.Cpf(s["cpf"])).Where(c => c != null).ToHashSet();
        var unidades = await _db.Unidades.AsNoTracking().ToListAsync();

        // Chaves diferentes (CPF / só matrícula) podem apontar para o mesmo servidor ainda não gravado:
        // as atribuições são resolvidas depois do SaveChanges, quando todos têm Id.
        var atribuicoes = new List<(string Chave, Servidor Servidor)>();
        var novos = new List<Servidor>();
        foreach (var g in diarias.GroupBy(d => d.ServidorChave))
        {
            var recente = g.OrderByDescending(d => d.Ida).First();
            var cpf = recente.Cpf;
            // Só matrícula no legado: tenta achar o CPF pelo cadastro de policiais da Carteira.
            if (cpf == null && recente.Matricula != null) cpf = cpfPorMatriculaCarteira.GetValueOrDefault(recente.Matricula);

            Servidor? s = cpf != null ? porCpf.GetValueOrDefault(cpf)
                : recente.Matricula != null ? porMatriculaSemCpf.GetValueOrDefault(recente.Matricula) : null;
            if (s == null)
            {
                var nomeCargo = Texto.Cargo(recente.Cargo);
                s = new Servidor
                {
                    Nome = (recente.Nome ?? "SERVIDOR SEM NOME NO LEGADO").ToUpperInvariant(), Cpf = cpf, Matricula = recente.Matricula,
                    Vinculo = Texto.Vinculo(recente.Funcao, recente.Cargo),
                    CargoId = nomeCargo == null ? null : cargos.GetValueOrDefault(nomeCargo),
                    UnidadeId = Unidade(unidades, recente.Unidade),
                    PoliciaPenalId = cpf == null ? null : policiais.FirstOrDefault(p => Texto.Cpf(p.Cpf) == cpf)?.Id,
                    Ativo = cpf != null && ativosLegado.Contains(cpf), Origem = Origens.Legado,
                    CriadoEm = DateTime.UtcNow, AtualizadoEm = DateTime.UtcNow
                };
                _db.Servidores.Add(s);
                novos.Add(s);
                if (cpf != null) porCpf[cpf] = s; else if (s.Matricula != null) porMatriculaSemCpf[s.Matricula] = s;
                if (cpf == null)
                    Relatar("servidores_sem_cpf.tsv", s.Matricula ?? "", s.Nome, g.Count().ToString());
            }
            atribuicoes.Add((g.Key, s));
        }
        await _db.SaveChangesAsync();
        var resultado = atribuicoes.ToDictionary(a => a.Chave, a => a.Servidor.Id);
        _log($"Servidores: {resultado.Values.Distinct().Count():N0} distintos; {novos.Count:N0} criados a partir do legado " +
             $"({novos.Count(n => n.Cpf == null)} sem CPF, relatório servidores_sem_cpf.tsv).");
        return resultado;
    }

    private async Task<Dictionary<string, int>> GarantirCargosAsync(List<LegadoDiaria> diarias)
    {
        var existentes = await _db.Cargos.ToListAsync();
        var mapa = existentes.ToDictionary(c => c.Nome, c => c.Id, StringComparer.OrdinalIgnoreCase);
        var novos = new List<Cargo>();
        foreach (var nome in diarias.Select(d => Texto.Cargo(d.Cargo)).Where(n => n != null).Distinct(StringComparer.OrdinalIgnoreCase))
            if (!mapa.ContainsKey(nome!))
            {
                var c = new Cargo { Nome = nome!, Ativo = true };
                _db.Cargos.Add(c);
                novos.Add(c);
            }
        await _db.SaveChangesAsync();
        foreach (var c in novos) mapa[c.Nome] = c.Id;
        _log($"Cargos: {mapa.Count} no total ({novos.Count} criados a partir do legado).");
        return mapa;
    }

    private readonly Dictionary<string, int?> _cacheUnidade = new();
    private readonly Dictionary<string, int> _lotacoesSemUnidade = new();

    /// <summary>Lotação pela sigla do legado ("SEAP - PTAC", "PIT 2", "NP CARUARU") contra public.unidade.</summary>
    private int? Unidade(List<Unidade> unidades, string? texto)
    {
        var k = texto ?? "";
        if (!_cacheUnidade.TryGetValue(k, out var id)) _cacheUnidade[k] = id = BuscarUnidade(unidades, texto);
        if (id == null && texto != null) _lotacoesSemUnidade[texto] = _lotacoesSemUnidade.GetValueOrDefault(texto) + 1;
        return id;
    }

    private static int? BuscarUnidade(List<Unidade> unidades, string? texto)
    {
        // "SEAP - GP/NP-SALGUEIRO", "SEAP / PTAC": descarta os prefixos de órgão/gerência.
        var chave = Texto.Chave(texto);
        foreach (var prefixo in new[] { "SEAP ", "GP " })
            if (chave.StartsWith(prefixo) && chave.Length > prefixo.Length) chave = chave[prefixo.Length..];
        if (chave.Length == 0) return null;
        var alternativas = new[] { chave, chave.Replace(" 2", " II"), chave.Replace(" ", "") };
        var u = unidades.FirstOrDefault(x => alternativas.Contains(Texto.Chave(x.Sigla)) || alternativas.Contains(Texto.Chave(x.Sigla).Replace(" ", "")))
             ?? unidades.FirstOrDefault(x => chave.StartsWith("NP ") && Texto.Chave(x.Nome).EndsWith(chave[3..]));
        return u?.Id;
    }

    private async Task<Dictionary<(string Nome, string Uf), int>> CarregarMunicipiosAsync()
    {
        var lista = await _db.Municipios.AsNoTracking().Select(m => new { m.Id, m.Nome, Uf = m.Uf.Sigla }).ToListAsync();
        return lista.GroupBy(m => (Texto.Chave(m.Nome), m.Uf)).ToDictionary(g => g.Key, g => g.First().Id);
    }

    private Dictionary<string, string?>? _correcoes;

    private Dictionary<string, string?> Correcoes()
    {
        if (_correcoes != null) return _correcoes;
        var arquivo = Path.Combine(AppContext.BaseDirectory, "correcoes_destino.tsv");
        _correcoes = File.ReadLines(arquivo)
            .Where(l => l.Length > 0 && !l.StartsWith('#') && !l.StartsWith("texto\t"))
            .Select(l => l.Split('\t'))
            .Where(p => p.Length >= 2)
            .GroupBy(p => Texto.Chave(p[0]))   // variantes que normalizam igual: vale a última linha
            .ToDictionary(g => g.Key, g => g.Last()[1].Trim() == "-" ? null : g.Last()[1].Trim());
        return _correcoes;
    }

    private readonly Dictionary<(string, string?), int?> _cacheMunicipio = new();

    private int? Municipio(Dictionary<(string Nome, string Uf), int> municipios, string texto, string? ufCampo)
    {
        if (!_cacheMunicipio.TryGetValue((texto, ufCampo), out var id))
            _cacheMunicipio[(texto, ufCampo)] = id = BuscarMunicipio(municipios, texto, ufCampo);
        return id;
    }

    /// <summary>Destino -&gt; município: correções do arquivo, depois nome + UF (UF informada ou PE), depois nome único no país.</summary>
    private int? BuscarMunicipio(Dictionary<(string Nome, string Uf), int> municipios, string texto, string? ufCampo)
    {
        var (nome, ufTexto) = Texto.Destino(texto);
        var uf = ufTexto ?? ufCampo;
        if (Correcoes().TryGetValue(nome, out var correcao))
        {
            if (correcao == null) return null;
            var partes = correcao.Split('/');
            if (municipios.TryGetValue((Texto.Chave(partes[0]), partes[1]), out var corrigido)) return corrigido;
            Relatar("correcoes_sem_municipio_no_banco.tsv", nome, correcao);
            return null;
        }
        if (uf != null && municipios.TryGetValue((nome, uf), out var id)) return id;
        if (municipios.TryGetValue((nome, "PE"), out id)) return id;
        var candidatos = municipios.Where(m => m.Key.Nome == nome).ToList();
        return candidatos.Count == 1 ? candidatos[0].Value : null;
    }

    private Dictionary<string, string> Cadastradores()
    {
        var mapa = new Dictionary<string, string>();
        foreach (var u in Ler("usuarios"))
        {
            var m = Texto.Matricula(u["matricula"]);
            if (m.Length > 0) mapa[m] = Texto.Limpo(u["nome"]) ?? m;
        }
        return mapa;
    }

    private static string? NomeCadastrador(Dictionary<string, string> mapa, string cadastrador)
    {
        var c = Texto.Matricula(cadastrador);
        if (c.Length == 0) return null;
        var achado = mapa.FirstOrDefault(kv => kv.Key == c || kv.Key.StartsWith(c) || c.StartsWith(kv.Key));
        return achado.Value != null ? $"{achado.Value} (legado)" : $"Matrícula {cadastrador} (legado)";
    }

    private async Task<List<(int ServidorId, DateOnly Inicio, DateOnly Fim)>> PeriodosSistemaAsync() =>
        (await _db.DiariasPeriodos.AsNoTracking().Where(p => p.Ativo && !p.IsentoSobreposicao)
            .Select(p => new { p.ServidorId, p.DataInicio, p.DataFim }).ToListAsync())
        .Select(p => (p.ServidorId, p.DataInicio, p.DataFim)).ToList();

    /// <summary>Marca como isentos os períodos legados vigentes que se sobrepõem a outro do mesmo servidor.</summary>
    private HashSet<int> MarcarSobreposicoes(List<LegadoDiaria> diarias, Dictionary<string, int> servidorIds,
        List<(int ServidorId, DateOnly Inicio, DateOnly Fim)> sistema)
    {
        var isentos = new HashSet<int>();
        var vigentes = diarias.Where(d => d.Status is "Aprovado" or "Pendente").ToList();
        foreach (var g in vigentes.GroupBy(d => servidorIds[d.ServidorChave]))
        {
            var ps = g.OrderBy(d => d.Ida).ToList();
            var sistemaDoServidor = sistema.Where(s => s.ServidorId == g.Key).ToList();
            for (var i = 0; i < ps.Count; i++)
            {
                for (var j = i + 1; j < ps.Count && ps[j].Ida <= ps[i].Volta; j++)
                {
                    isentos.Add(ps[i].Codigo);
                    isentos.Add(ps[j].Codigo);
                    Relatar("sobreposicoes_isentas.tsv", ps[i].Codigo.ToString(), ps[j].Codigo.ToString(), ps[i].Nome ?? "",
                        $"{ps[i].Ida:dd/MM/yyyy}-{ps[i].Volta:dd/MM/yyyy}", $"{ps[j].Ida:dd/MM/yyyy}-{ps[j].Volta:dd/MM/yyyy}");
                }
                if (sistemaDoServidor.Any(s => s.Inicio <= ps[i].Volta && s.Fim >= ps[i].Ida))
                {
                    isentos.Add(ps[i].Codigo);
                    Relatar("sobreposicoes_isentas.tsv", ps[i].Codigo.ToString(), "(lançamento do sistema novo)", ps[i].Nome ?? "",
                        $"{ps[i].Ida:dd/MM/yyyy}-{ps[i].Volta:dd/MM/yyyy}", "");
                }
            }
        }
        _log($"Períodos com sobreposição marcados como isentos: {isentos.Count:N0} (relatório sobreposicoes_isentas.tsv)");
        return isentos;
    }

    private async Task<int> GravarAsync(NpgsqlConnection conn, List<LegadoDiaria> diarias, Dictionary<string, int> servidorIds,
        Dictionary<string, int> cargos, List<Unidade> unidades, Dictionary<(string Nome, string Uf), int> municipios,
        int integral, int parcial, Dictionary<string, string> cadastradores, HashSet<int> isentos)
    {
        var servidores = await _db.Servidores.AsNoTracking().ToDictionaryAsync(s => s.Id, s => s.UnidadeId);
        var ids = await ProximosIdsAsync(conn, "diarias.diaria_id_seq", diarias.Count);
        var idsPeriodo = await ProximosIdsAsync(conn, "diarias.diaria_periodo_id_seq", diarias.Count);
        var semMunicipio = new Dictionary<string, int>();

        var linhasDiaria = new List<object?[]>();
        var linhasPeriodo = new List<object?[]>();
        var linhasItem = new List<object?[]>();
        for (var i = 0; i < diarias.Count; i++)
        {
            var d = diarias[i];
            var servidorId = servidorIds[d.ServidorChave];
            var situacao = d.Status switch { "Pendente" => SituacaoDiaria.Pendente, "Rejeitado" => SituacaoDiaria.Rejeitada, _ => SituacaoDiaria.Aprovada };
            var nomeCargo = Texto.Cargo(d.Cargo);
            var unidade = Unidade(unidades, d.Unidade) ?? servidores.GetValueOrDefault(servidorId);

            var objetivo = (d.Finalidade, d.Motivacao) switch
            {
                (null, null) => "Não informado no sistema legado",
                ({ } f, null) => f,
                (null, { } m) => m,
                ({ } f, { } m) => string.Equals(f, m, StringComparison.OrdinalIgnoreCase) ? f : $"{f} — {m}"
            };
            var obs = new List<string>();
            if (d.Obs != null) obs.Add(d.Obs);
            if (d.Passagem != null) obs.Add(d.Passagem);
            if (d.DatasCorrigidas != null) obs.Add(d.DatasCorrigidas);
            if (d.DatasInvertidas) obs.Add("Datas de ida e volta estavam invertidas no legado e foram corrigidas na migração.");
            if (d.Sei != null && d.Sei.Length > 50) obs.Add($"Processo SEI (completo): {d.Sei}");

            var municipio = Municipio(municipios, d.DestinoTexto, d.DestinoUf);
            if (municipio == null) semMunicipio[d.DestinoTexto] = semMunicipio.GetValueOrDefault(d.DestinoTexto) + 1;

            var itens = new List<(int Tipo, decimal Qtd, decimal Unit, decimal Total)>();
            if (d.IntQtd > 0) itens.Add((integral, d.IntQtd, d.IntUnit, d.IntTotal));
            if (d.ParQtd > 0) itens.Add((parcial, d.ParQtd, d.ParUnit, d.ParTotal));
            if (itens.Count == 0) Relatar("diarias_sem_itens.tsv", d.Codigo.ToString(), d.Nome ?? "", d.Ida.ToString("dd/MM/yyyy"));
            var total = itens.Sum(x => x.Total);
            var ocupa = situacao is SituacaoDiaria.Pendente or SituacaoDiaria.Aprovada;

            linhasDiaria.Add(new object?[]
            {
                ids[i], servidorId, (short)Texto.Vinculo(d.Funcao, d.Cargo), nomeCargo == null ? null : cargos.GetValueOrDefault(nomeCargo),
                unidade, Texto.Cortar(objetivo, 1000)!, Texto.Cortar(d.Sei, 50), Texto.Cortar(obs.Count > 0 ? string.Join(" | ", obs) : null, 2000),
                situacao, total, Origens.Legado, d.Codigo, NomeCadastrador(cadastradores, d.Cadastrador), d.CriadoEm, d.CriadoEm,
                situacao == SituacaoDiaria.Aprovada ? "Aprovada no sistema legado" : null,
                situacao == SituacaoDiaria.Aprovada ? d.CriadoEm : null
            });
            linhasPeriodo.Add(new object?[]
            {
                idsPeriodo[i], ids[i], servidorId, d.Ida, d.Volta, municipio, Texto.Cortar(d.DestinoTexto, 300), total, ocupa,
                isentos.Contains(d.Codigo)
            });
            foreach (var it in itens)
                linhasItem.Add(new object?[] { idsPeriodo[i], it.Tipo, it.Qtd, it.Unit, it.Total });
        }

        await CopiarAsync(conn, "diarias.diaria (id, servidor_id, vinculo, cargo_id, unidade_id, objetivo, processo_sei, observacao, " +
            "situacao, valor_total, origem, legado_codigo, criado_por_nome, criado_em, atualizado_em, decidido_por_nome, decidido_em)",
            linhasDiaria, new[] { NpgsqlDbType.Integer, NpgsqlDbType.Integer, NpgsqlDbType.Smallint, NpgsqlDbType.Integer, NpgsqlDbType.Integer,
                NpgsqlDbType.Varchar, NpgsqlDbType.Varchar, NpgsqlDbType.Varchar, NpgsqlDbType.Varchar, NpgsqlDbType.Numeric,
                NpgsqlDbType.Varchar, NpgsqlDbType.Integer, NpgsqlDbType.Varchar, NpgsqlDbType.TimestampTz, NpgsqlDbType.TimestampTz,
                NpgsqlDbType.Varchar, NpgsqlDbType.TimestampTz });
        await CopiarAsync(conn, "diarias.diaria_periodo (id, diaria_id, servidor_id, data_inicio, data_fim, destino_municipio_id, " +
            "destino_texto, valor_total, ativo, isento_sobreposicao)",
            linhasPeriodo, new[] { NpgsqlDbType.Integer, NpgsqlDbType.Integer, NpgsqlDbType.Integer, NpgsqlDbType.Date, NpgsqlDbType.Date,
                NpgsqlDbType.Integer, NpgsqlDbType.Varchar, NpgsqlDbType.Numeric, NpgsqlDbType.Boolean, NpgsqlDbType.Boolean });
        await CopiarAsync(conn, "diarias.diaria_item (periodo_id, tipo_diaria_id, quantidade, valor_unitario, valor_total)",
            linhasItem, new[] { NpgsqlDbType.Integer, NpgsqlDbType.Integer, NpgsqlDbType.Numeric, NpgsqlDbType.Numeric, NpgsqlDbType.Numeric });

        foreach (var (texto, qtd) in semMunicipio.OrderByDescending(x => x.Value))
            Relatar("destinos_sem_municipio.tsv", texto, qtd.ToString());
        foreach (var (texto, qtd) in _lotacoesSemUnidade.OrderByDescending(x => x.Value))
            Relatar("lotacoes_sem_unidade.tsv", texto, qtd.ToString());
        _log($"Gravados: {linhasDiaria.Count:N0} diárias, {linhasPeriodo.Count:N0} períodos, {linhasItem.Count:N0} itens. " +
             $"Destinos sem município: {semMunicipio.Values.Sum():N0} períodos em {semMunicipio.Count:N0} textos (relatório destinos_sem_municipio.tsv).");
        return linhasDiaria.Count;
    }

    private static async Task<List<int>> ProximosIdsAsync(NpgsqlConnection conn, string sequencia, int quantidade)
    {
        var ids = new List<int>(quantidade);
        await using var cmd = new NpgsqlCommand($"SELECT nextval('{sequencia}')::int FROM generate_series(1, @n)", conn);
        cmd.Parameters.AddWithValue("n", quantidade);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) ids.Add(r.GetInt32(0));
        return ids;
    }

    private static async Task CopiarAsync(NpgsqlConnection conn, string destino, List<object?[]> linhas, NpgsqlDbType[] tipos)
    {
        await using var copy = await conn.BeginBinaryImportAsync($"COPY {destino} FROM STDIN (FORMAT BINARY)");
        foreach (var linha in linhas)
        {
            await copy.StartRowAsync();
            for (var c = 0; c < linha.Length; c++)
            {
                var v = linha[c];
                if (v == null) await copy.WriteNullAsync();
                else await copy.WriteAsync(v, tipos[c]);
            }
        }
        await copy.CompleteAsync();
    }

    private async Task<object> ConferirAsync(List<LegadoDiaria> legado)
    {
        var esperado = legado.Sum(d => d.IntTotal + d.ParTotal);
        var porSituacaoLegado = legado.GroupBy(d => d.Status).ToDictionary(g => g.Key, g => g.Count());
        var gravado = await _db.Diarias.Where(d => d.Origem == Origens.Legado)
            .GroupBy(_ => 1).Select(g => new { Qtd = g.Count(), Valor = g.Sum(d => d.ValorTotal) }).FirstAsync();
        var itens = await _db.Database.SqlQueryRaw<decimal>(
            "SELECT COALESCE(sum(i.valor_total), 0) AS \"Value\" FROM diarias.diaria_item i " +
            "JOIN diarias.diaria_periodo p ON p.id = i.periodo_id JOIN diarias.diaria d ON d.id = p.diaria_id " +
            "WHERE d.origem = 'LEGADO'").SingleAsync();
        var porSituacao = await _db.Diarias.Where(d => d.Origem == Origens.Legado).GroupBy(d => d.Situacao)
            .Select(g => new { g.Key, Qtd = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Qtd);

        var ok = gravado.Qtd == legado.Count && gravado.Valor == esperado && itens == esperado;
        _log($"CONFERÊNCIA {(ok ? "OK" : "DIVERGENTE")}: legado {legado.Count:N0} diárias / {esperado:C} | gravado {gravado.Qtd:N0} / {gravado.Valor:C} (itens {itens:C})");
        _log($"  situação legado {JsonSerializer.Serialize(porSituacaoLegado)} -> novo {JsonSerializer.Serialize(porSituacao)}");
        if (!ok) throw new InvalidOperationException("Conferência de totais divergente: migração abortada (nada foi gravado).");
        return new { diarias = gravado.Qtd, valor = gravado.Valor, porSituacao };
    }

    private void EscreverRelatorios()
    {
        Directory.CreateDirectory(_dirRelatorio);
        var cabecalhos = new Dictionary<string, string>
        {
            ["duplicatas_removidas.tsv"] = "codigo_removido\tcodigo_mantido\tservidor\tida\tvolta\tstatus",
            ["sobreposicoes_isentas.tsv"] = "codigo\tcodigo_conflitante\tservidor\tperiodo\tperiodo_conflitante",
            ["destinos_sem_municipio.tsv"] = "texto_legado\tperiodos",
            ["servidores_sem_cpf.tsv"] = "matricula\tnome\tdiarias",
            ["lotacoes_sem_unidade.tsv"] = "texto_legado\tocorrencias",
            ["correcoes_sem_municipio_no_banco.tsv"] = "texto\tcorrecao_configurada",
            ["datas_invertidas_corrigidas.tsv"] = "codigo\tida_legado\tvolta_legado",
            ["diarias_sem_itens.tsv"] = "codigo\tservidor\tida",
            ["diarias_nao_migradas.tsv"] = "codigo\tmotivo\tservidor",
            ["datas_futuras_suspeitas.tsv"] = "codigo\tservidor\tida\tvolta\tdata_cadastro",
            ["datas_corrigidas.tsv"] = "codigo\tservidor\tida_legado\tvolta_legado\tida_corrigida\tvolta_corrigida\tevidencias",
            ["correcoes_de_data_ignoradas.tsv"] = "codigo\tsituacao_no_legado\tesperado",
        };
        foreach (var (arquivo, linhas) in _relatorios)
        {
            var conteudo = linhas.Select(l => string.Join('\t', l)).Distinct();
            File.WriteAllLines(Path.Combine(_dirRelatorio, arquivo),
                new[] { cabecalhos.GetValueOrDefault(arquivo, "") }.Concat(conteudo), new UTF8Encoding(true));
        }
        _log($"Relatórios em {_dirRelatorio}");
    }
}
