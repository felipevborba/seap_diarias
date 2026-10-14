using System.Text.Json;
using DiariasSeres.Api.Dados;
using DiariasSeres.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeres.Api.Servicos;

public record ItemRequest(int? Id, int TipoDiariaId, decimal? Quantidade);
public record PeriodoRequest(int? Id, DateOnly DataInicio, DateOnly DataFim, int? DestinoMunicipioId, List<ItemRequest> Itens);
public record DiariaRequest(int ServidorId, string Objetivo, string? ProcessoSei, string? Observacao, List<PeriodoRequest> Periodos);
public record MotivoRequest(string Motivo);

public record ItemCalculadoDto(int? Id, int TipoDiariaId, string TipoDiaria, decimal Quantidade, decimal ValorUnitario, decimal ValorTotal);
public record PeriodoCalculadoDto(int? Id, DateOnly DataInicio, DateOnly DataFim, int Dias, int? DestinoMunicipioId, string Destino,
    string? DestinoTexto, bool IsentoSobreposicao, List<ItemCalculadoDto> Itens, decimal ValorTotal);
public record ConflitoDto(int DiariaId, DateOnly DataInicio, DateOnly DataFim, string Destino);
public record SimulacaoDto(List<PeriodoCalculadoDto> Periodos, decimal ValorTotal, List<string> Erros, List<ConflitoDto> Conflitos);

public record DiariaFiltro(string? Busca, int? UnidadeId, DateOnly? DataInicio, DateOnly? DataFim, string? Situacao,
    string? Origem, int Page = 1, int PageSize = 20);
public record DiariaListaDto(int Id, int ServidorId, string Servidor, string? Cpf, string? Matricula, string? Unidade,
    DateOnly? Inicio, DateOnly? Fim, int QtdPeriodos, string Destinos, decimal ValorTotal, string Situacao, string Origem,
    int? LegadoCodigo, DateTime CriadoEm);
public record DiariaDto(int Id, int ServidorId, string Servidor, string? Cpf, string? Matricula, Vinculo Vinculo, string? Cargo,
    string? Unidade, string Objetivo, string? ProcessoSei, string? Observacao, string Situacao, string? MotivoCancelamento,
    string? MotivoRejeicao, string? DecididoPorNome, DateTime? DecididoEm, decimal ValorTotal, string Origem, int? LegadoCodigo,
    string? CriadoPorNome, DateTime CriadoEm, DateTime AtualizadoEm, List<PeriodoCalculadoDto> Periodos);
public record HistoricoDto(long Id, string Entidade, string EntidadeId, string Acao, string? UsuarioNome, DateTime DataHora,
    JsonElement Alteracoes);

/// <summary>
/// Lançamento e aprovação de diárias. Regras:
///  * um lançamento tem 1..N períodos intercalados; cada período tem destino e itens (tipo × quantidade);
///  * o valor unitário vem da tabela de valores (tipo × vínculo × cargo, vigente no início do período);
///    na edição, item que não mudou de tipo nem de data de início mantém o valor gravado (preserva o legado);
///  * soma das quantidades do período ≤ nº de dias, em múltiplos de 0,5;
///  * um servidor não pode ter duas diárias vigentes (PENDENTE/APROVADA) na mesma data — validado aqui com
///    lock por servidor e garantido no banco pela constraint diaria_periodo_sem_sobreposicao;
///  * fluxo: lançada PENDENTE -&gt; ADMIN aprova ou rejeita; editar devolve para PENDENTE; exclusão = cancelamento.
/// </summary>
public class DiariasService
{
    private readonly DiariasContext _db;
    private readonly TabelaValores _valores;
    private readonly IUsuarioAtual _usuario;

    public DiariasService(DiariasContext db, TabelaValores valores, IUsuarioAtual usuario)
    {
        _db = db;
        _valores = valores;
        _usuario = usuario;
    }

    // ------------------------------------------------------------------ consulta

    public async Task<PagedResult<DiariaListaDto>> ListarAsync(DiariaFiltro f)
    {
        var (page, pageSize) = PagedResult<DiariaListaDto>.Normalizar(f.Page, f.PageSize);
        var q = _db.Diarias.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(f.Busca))
        {
            var termo = $"%{f.Busca.Trim()}%";
            var digitos = CifraDelphi.SomenteDigitos(f.Busca);
            var numero = int.TryParse(f.Busca.Trim().TrimStart('#'), out var n) ? n : -1;
            q = q.Where(d => d.Id == numero || d.LegadoCodigo == numero
                             || EF.Functions.ILike(EF.Functions.Unaccent(d.Servidor.Nome), EF.Functions.Unaccent(termo))
                             || EF.Functions.ILike(d.Servidor.Matricula ?? "", termo)
                             || EF.Functions.ILike(d.ProcessoSei ?? "", termo)
                             || (digitos.Length >= 3 && (d.Servidor.Cpf ?? "").Contains(digitos)));
        }
        if (f.UnidadeId.HasValue) q = q.Where(d => d.UnidadeId == f.UnidadeId);
        q = f.Situacao switch
        {
            null or "" => q,
            "VIGENTES" => q.Where(d => SituacaoDiaria.Vigentes.Contains(d.Situacao)),
            _ => q.Where(d => d.Situacao == f.Situacao)
        };
        if (!string.IsNullOrWhiteSpace(f.Origem)) q = q.Where(d => d.Origem == f.Origem);
        if (f.DataInicio.HasValue) q = q.Where(d => d.Periodos.Any(p => p.DataFim >= f.DataInicio));
        if (f.DataFim.HasValue) q = q.Where(d => d.Periodos.Any(p => p.DataInicio <= f.DataFim));

        var total = await q.CountAsync();
        var linhas = await q.OrderByDescending(d => d.Periodos.Max(p => (DateOnly?)p.DataInicio)).ThenByDescending(d => d.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(d => new
            {
                d.Id, d.ServidorId, Servidor = d.Servidor.Nome, d.Servidor.Cpf, d.Servidor.Matricula,
                Unidade = d.Unidade != null ? d.Unidade.Nome : null,
                Inicio = d.Periodos.Min(p => (DateOnly?)p.DataInicio), Fim = d.Periodos.Max(p => (DateOnly?)p.DataFim),
                Qtd = d.Periodos.Count(),
                Destinos = d.Periodos.OrderBy(p => p.DataInicio)
                    .Select(p => p.DestinoMunicipio != null ? p.DestinoMunicipio.Nome : p.DestinoTexto).ToList(),
                d.ValorTotal, d.Situacao, d.Origem, d.LegadoCodigo, d.CriadoEm
            })
            .ToListAsync();

        var itens = linhas.Select(l => new DiariaListaDto(l.Id, l.ServidorId, l.Servidor, l.Cpf, l.Matricula, l.Unidade,
            l.Inicio, l.Fim, l.Qtd, string.Join(", ", l.Destinos.Where(x => x != null).Distinct()), l.ValorTotal, l.Situacao,
            l.Origem, l.LegadoCodigo, l.CriadoEm)).ToList();
        return new PagedResult<DiariaListaDto>(itens, page, pageSize, total);
    }

    public async Task<DiariaDto> ObterAsync(int id)
    {
        var d = await _db.Diarias.AsNoTracking()
            .Include(x => x.Servidor).Include(x => x.Cargo).Include(x => x.Unidade)
            .Include(x => x.Periodos).ThenInclude(p => p.Itens).ThenInclude(i => i.TipoDiaria)
            .Include(x => x.Periodos).ThenInclude(p => p.DestinoMunicipio).ThenInclude(m => m!.Uf)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new NaoEncontradoException("Diária não encontrada.");

        return new DiariaDto(d.Id, d.ServidorId, d.Servidor.Nome, d.Servidor.Cpf, d.Servidor.Matricula, d.Vinculo, d.Cargo?.Nome,
            d.Unidade?.Nome, d.Objetivo, d.ProcessoSei, d.Observacao, d.Situacao, d.MotivoCancelamento, d.MotivoRejeicao,
            d.DecididoPorNome, d.DecididoEm, d.ValorTotal, d.Origem, d.LegadoCodigo, d.CriadoPorNome, d.CriadoEm, d.AtualizadoEm,
            d.Periodos.OrderBy(p => p.DataInicio).Select(p => new PeriodoCalculadoDto(p.Id, p.DataInicio, p.DataFim,
                Dias(p.DataInicio, p.DataFim), p.DestinoMunicipioId,
                p.DestinoMunicipio != null ? $"{p.DestinoMunicipio.Nome}/{p.DestinoMunicipio.Uf.Sigla}" : p.DestinoTexto ?? "—",
                p.DestinoTexto, p.IsentoSobreposicao,
                p.Itens.OrderBy(i => i.TipoDiariaId).Select(i => new ItemCalculadoDto(i.Id, i.TipoDiariaId, i.TipoDiaria.Nome,
                    i.Quantidade, i.ValorUnitario, i.ValorTotal)).ToList(),
                p.ValorTotal)).ToList());
    }

    public async Task<List<HistoricoDto>> HistoricoAsync(int id)
    {
        var raizId = id.ToString();
        var registros = await _db.Auditoria.AsNoTracking()
            .Where(a => a.Modulo == DiariasContext.Modulo && a.RaizEntidade == "diaria" && a.RaizId == raizId)
            .OrderByDescending(a => a.DataHora).ThenByDescending(a => a.Id)
            .ToListAsync();
        return registros.Select(a => new HistoricoDto(a.Id, a.Entidade, a.EntidadeId, a.Acao, a.UsuarioNome, a.DataHora,
            JsonDocument.Parse(a.Alteracoes).RootElement.Clone())).ToList();
    }

    // ------------------------------------------------------------------ cálculo

    /// <summary>Calcula valores e aponta erros/conflitos sem gravar (pré-visualização do formulário).</summary>
    public async Task<SimulacaoDto> SimularAsync(DiariaRequest req, int? diariaId)
    {
        var servidor = await _db.Servidores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.ServidorId);
        if (servidor == null)
            return new SimulacaoDto(new(), 0, new() { "Selecione o servidor." }, new());

        var existente = diariaId.HasValue
            ? await _db.Diarias.AsNoTracking().Include(d => d.Periodos).ThenInclude(p => p.Itens).FirstOrDefaultAsync(d => d.Id == diariaId)
            : null;
        var (vinculo, cargoId) = Snapshot(servidor, existente);
        var (periodos, erros) = await CalcularAsync(req.Periodos, vinculo, cargoId, existente);
        var conflitos = await ConflitosAsync(servidor.Id, periodos, diariaId);
        return new SimulacaoDto(periodos, periodos.Sum(p => p.ValorTotal), erros, conflitos);
    }

    /// <summary>Na edição mantém vínculo/cargo fotografados, a menos que o servidor tenha sido trocado.</summary>
    private static (Vinculo, int?) Snapshot(Servidor servidor, Diaria? existente) =>
        existente != null && existente.ServidorId == servidor.Id
            ? (existente.Vinculo, existente.CargoId)
            : (servidor.Vinculo, servidor.CargoId);

    private async Task<(List<PeriodoCalculadoDto>, List<string>)> CalcularAsync(
        List<PeriodoRequest> periodos, Vinculo vinculo, int? cargoId, Diaria? existente)
    {
        var erros = new List<string>();
        var resultado = new List<PeriodoCalculadoDto>();
        if (periodos.Count == 0) erros.Add("Informe ao menos um período.");

        var tipos = await _db.TiposDiaria.AsNoTracking().ToDictionaryAsync(t => t.Id);
        var destinoIds = periodos.Where(p => p.DestinoMunicipioId.HasValue).Select(p => p.DestinoMunicipioId!.Value).Distinct().ToList();
        var destinos = await _db.Municipios.AsNoTracking().Where(m => destinoIds.Contains(m.Id))
            .Select(m => new { m.Id, Nome = m.Nome + "/" + m.Uf.Sigla })
            .ToDictionaryAsync(m => m.Id, m => m.Nome);
        var periodosAtuais = existente?.Periodos.ToDictionary(p => p.Id) ?? new();

        var ordenados = periodos.OrderBy(p => p.DataInicio).ToList();
        for (var i = 0; i < ordenados.Count; i++)
        {
            var p = ordenados[i];
            var atual = p.Id.HasValue ? periodosAtuais.GetValueOrDefault(p.Id.Value) : null;
            var rotulo = $"Período {p.DataInicio:dd/MM/yyyy}–{p.DataFim:dd/MM/yyyy}";
            if (p.Id.HasValue && atual == null) { erros.Add($"{rotulo}: não pertence a esta diária."); continue; }
            if (p.DataFim < p.DataInicio) { erros.Add($"{rotulo}: a data final é anterior à inicial."); continue; }
            if (i > 0 && p.DataInicio <= ordenados[i - 1].DataFim)
                erros.Add($"{rotulo}: sobrepõe outro período deste mesmo lançamento.");

            // Destino: município obrigatório, exceto período legado que ainda só tem o texto original.
            string destino;
            if (p.DestinoMunicipioId.HasValue)
            {
                if (!destinos.TryGetValue(p.DestinoMunicipioId.Value, out destino!)) { erros.Add($"{rotulo}: destino inválido."); continue; }
            }
            else if (atual?.DestinoTexto != null && atual.DestinoMunicipioId == null) destino = atual.DestinoTexto;
            else { erros.Add($"{rotulo}: selecione o município de destino."); continue; }

            var dias = Dias(p.DataInicio, p.DataFim);
            var mesmasDatas = atual != null && atual.DataInicio == p.DataInicio && atual.DataFim == p.DataFim;
            var itensCalc = new List<ItemCalculadoDto>();
            if (p.Itens.Count == 0) erros.Add($"{rotulo}: informe ao menos um tipo de diária.");
            if (p.Itens.GroupBy(x => x.TipoDiariaId).Any(g => g.Count() > 1)) erros.Add($"{rotulo}: tipo de diária repetido.");

            foreach (var it in p.Itens)
            {
                if (!tipos.TryGetValue(it.TipoDiariaId, out var tipo)) { erros.Add($"{rotulo}: selecione o tipo de diária."); continue; }
                var quantidade = it.Quantidade ?? (p.Itens.Count == 1 ? dias : 0);
                if (quantidade <= 0 || quantidade % 0.5m != 0)
                    erros.Add($"{rotulo}: quantidade de {tipo.Nome} deve ser múltipla de 0,5 e maior que zero.");

                // Item que não mudou (mesmo tipo, mesma data de início) mantém o valor gravado.
                var itemAtual = it.Id.HasValue ? atual?.Itens.FirstOrDefault(x => x.Id == it.Id) : null;
                decimal? unitario = itemAtual != null && itemAtual.TipoDiariaId == it.TipoDiariaId && atual!.DataInicio == p.DataInicio
                    ? itemAtual.ValorUnitario
                    : await _valores.ResolverAsync(tipo.Id, vinculo, cargoId, p.DataInicio);
                if (unitario == null)
                    erros.Add($"{rotulo}: não há valor cadastrado para diária {tipo.Nome}, vínculo {vinculo} e o cargo do servidor nesta data. Ajuste a Tabela de Valores.");

                itensCalc.Add(new ItemCalculadoDto(it.Id, tipo.Id, tipo.Nome, quantidade, unitario ?? 0,
                    decimal.Round((unitario ?? 0) * quantidade, 2)));
            }

            var soma = itensCalc.Sum(x => x.Quantidade);
            // Legado com datas inalteradas pode ter quantidades fora da regra atual; não bloqueia a edição de outros campos.
            if (soma > dias && !(existente?.Origem == Origens.Legado && mesmasDatas))
                erros.Add($"{rotulo}: total de {soma:0.#} diárias excede os {dias} dias do período.");

            resultado.Add(new PeriodoCalculadoDto(p.Id, p.DataInicio, p.DataFim, dias, p.DestinoMunicipioId, destino,
                atual?.DestinoTexto, mesmasDatas && atual!.IsentoSobreposicao, itensCalc, itensCalc.Sum(x => x.ValorTotal)));
        }
        return (resultado, erros);
    }

    private async Task<List<ConflitoDto>> ConflitosAsync(int servidorId, List<PeriodoCalculadoDto> periodos, int? ignorarDiariaId)
    {
        var validos = periodos.Where(p => p.DataFim >= p.DataInicio && !p.IsentoSobreposicao).ToList();
        if (validos.Count == 0) return new();
        var min = validos.Min(p => p.DataInicio);
        var max = validos.Max(p => p.DataFim);

        var existentes = await _db.DiariasPeriodos.AsNoTracking()
            .Where(p => p.ServidorId == servidorId && p.Ativo && !p.IsentoSobreposicao && p.DiariaId != ignorarDiariaId
                        && p.DataInicio <= max && p.DataFim >= min)
            .Select(p => new { p.DiariaId, p.DataInicio, p.DataFim,
                Destino = p.DestinoMunicipio != null ? p.DestinoMunicipio.Nome : p.DestinoTexto })
            .ToListAsync();

        return existentes
            .Where(e => validos.Any(v => v.DataInicio <= e.DataFim && v.DataFim >= e.DataInicio))
            .Select(e => new ConflitoDto(e.DiariaId, e.DataInicio, e.DataFim, e.Destino ?? "—"))
            .ToList();
    }

    // ------------------------------------------------------------------ gravação

    public Task<int> CriarAsync(DiariaRequest req) => GravarAsync(null, req);

    public Task AtualizarAsync(int id, DiariaRequest req) => GravarAsync(id, req);

    private async Task<int> GravarAsync(int? id, DiariaRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Objetivo)) throw new RegraNegocioException("Informe o objetivo da viagem.");

        await using var tx = await _db.Database.BeginTransactionAsync();
        // Serializa lançamentos do mesmo servidor: sem isso, dois operadores simultâneos passariam
        // pela checagem de conflito ao mesmo tempo (a constraint do banco ainda barraria o segundo).
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(1, {req.ServidorId})");

        var diaria = id.HasValue
            ? await _db.Diarias.Include(d => d.Periodos).ThenInclude(p => p.Itens).AsSplitQuery().FirstOrDefaultAsync(d => d.Id == id)
              ?? throw new NaoEncontradoException("Diária não encontrada.")
            : null;
        if (diaria?.Situacao == SituacaoDiaria.Cancelada)
            throw new RegraNegocioException("Diária cancelada não pode ser editada.");

        var servidor = await _db.Servidores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.ServidorId)
                       ?? throw new RegraNegocioException("Servidor não encontrado.");
        var trocouServidor = diaria != null && diaria.ServidorId != servidor.Id;
        if (!servidor.Ativo && (diaria == null || trocouServidor))
            throw new RegraNegocioException("Servidor inativo não pode receber novas diárias.");

        var (vinculo, cargoId) = Snapshot(servidor, diaria);
        var (calculados, erros) = await CalcularAsync(req.Periodos, vinculo, cargoId, diaria);
        if (erros.Count > 0) throw new RegraNegocioException(string.Join(" ", erros));

        var conflitos = await ConflitosAsync(servidor.Id, calculados, id);
        if (conflitos.Count > 0)
            throw new RegraNegocioException("O servidor já possui diária nas datas: " + string.Join("; ", conflitos.Select(c =>
                $"{c.DataInicio:dd/MM/yyyy}–{c.DataFim:dd/MM/yyyy} em {c.Destino} (diária nº {c.DiariaId})")) + ".");

        var agora = DateTime.UtcNow;
        if (diaria == null)
        {
            diaria = new Diaria { CriadoEm = agora, CriadoPorId = _usuario.Id, CriadoPorNome = _usuario.Nome };
            _db.Diarias.Add(diaria);
        }
        if (diaria.Id == 0 || trocouServidor)
        {
            diaria.ServidorId = servidor.Id;
            diaria.Vinculo = vinculo;
            diaria.CargoId = cargoId;
            diaria.UnidadeId = servidor.UnidadeId;
        }
        diaria.Objetivo = req.Objetivo.Trim();
        diaria.ProcessoSei = string.IsNullOrWhiteSpace(req.ProcessoSei) ? null : req.ProcessoSei.Trim();
        diaria.Observacao = string.IsNullOrWhiteSpace(req.Observacao) ? null : req.Observacao.Trim();
        diaria.AtualizadoEm = agora;
        // Qualquer edição (inclusive de aprovada ou rejeitada) volta para análise.
        diaria.Situacao = SituacaoDiaria.Pendente;
        diaria.DecididoPorId = null;
        diaria.DecididoPorNome = null;
        diaria.DecididoEm = null;
        diaria.MotivoRejeicao = null;

        SincronizarPeriodos(diaria, calculados, servidor.Id);
        diaria.ValorTotal = calculados.Sum(c => c.ValorTotal);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return diaria.Id;
    }

    /// <summary>Atualiza os períodos/itens que vieram com Id, inclui os novos e remove os ausentes.</summary>
    private void SincronizarPeriodos(Diaria diaria, List<PeriodoCalculadoDto> calculados, int servidorId)
    {
        var idsMantidos = calculados.Where(c => c.Id.HasValue).Select(c => c.Id!.Value).ToHashSet();
        foreach (var removido in diaria.Periodos.Where(p => !idsMantidos.Contains(p.Id)).ToList())
        {
            diaria.Periodos.Remove(removido);
            _db.DiariasPeriodos.Remove(removido);
        }

        foreach (var c in calculados)
        {
            var p = c.Id.HasValue ? diaria.Periodos.First(x => x.Id == c.Id) : null;
            if (p == null)
            {
                p = new DiariaPeriodo();
                diaria.Periodos.Add(p);
            }
            p.ServidorId = servidorId;
            p.DataInicio = c.DataInicio;
            p.DataFim = c.DataFim;
            if (c.DestinoMunicipioId.HasValue) p.DestinoMunicipioId = c.DestinoMunicipioId;
            p.IsentoSobreposicao = c.IsentoSobreposicao;
            p.Ativo = true;
            p.ValorTotal = c.ValorTotal;

            var itensMantidos = c.Itens.Where(i => i.Id.HasValue).Select(i => i.Id!.Value).ToHashSet();
            foreach (var removido in p.Itens.Where(i => !itensMantidos.Contains(i.Id)).ToList())
            {
                p.Itens.Remove(removido);
                _db.DiariasItens.Remove(removido);
            }
            foreach (var ic in c.Itens)
            {
                var item = ic.Id.HasValue ? p.Itens.FirstOrDefault(x => x.Id == ic.Id) : null;
                if (item == null)
                {
                    item = new DiariaItem { Periodo = p };
                    p.Itens.Add(item);
                }
                item.TipoDiariaId = ic.TipoDiariaId;
                item.Quantidade = ic.Quantidade;
                item.ValorUnitario = ic.ValorUnitario;
                item.ValorTotal = ic.ValorTotal;
            }
        }
    }

    // ------------------------------------------------------------------ fluxo

    public Task AprovarAsync(int id) => DecidirAsync(id, SituacaoDiaria.Aprovada, null);

    public Task RejeitarAsync(int id, string motivo)
    {
        if (string.IsNullOrWhiteSpace(motivo)) throw new RegraNegocioException("Informe o motivo da rejeição.");
        return DecidirAsync(id, SituacaoDiaria.Rejeitada, motivo.Trim());
    }

    private async Task DecidirAsync(int id, string situacao, string? motivo)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var diaria = await _db.Diarias.Include(d => d.Periodos).FirstOrDefaultAsync(d => d.Id == id)
                     ?? throw new NaoEncontradoException("Diária não encontrada.");
        if (diaria.Situacao != SituacaoDiaria.Pendente)
            throw new RegraNegocioException("Somente diárias pendentes podem ser aprovadas ou rejeitadas.");
        if (diaria.CriadoPorId != null && diaria.CriadoPorId == _usuario.Id && situacao == SituacaoDiaria.Aprovada)
            throw new RegraNegocioException("Quem lançou a diária não pode aprová-la.");

        diaria.Situacao = situacao;
        diaria.MotivoRejeicao = motivo;
        diaria.DecididoPorId = _usuario.Id;
        diaria.DecididoPorNome = _usuario.Nome;
        diaria.DecididoEm = DateTime.UtcNow;
        diaria.AtualizadoEm = DateTime.UtcNow;
        if (situacao == SituacaoDiaria.Rejeitada)
            foreach (var p in diaria.Periodos) p.Ativo = false;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public async Task CancelarAsync(int id, string motivo)
    {
        if (string.IsNullOrWhiteSpace(motivo)) throw new RegraNegocioException("Informe o motivo do cancelamento.");
        await using var tx = await _db.Database.BeginTransactionAsync();
        var diaria = await _db.Diarias.Include(d => d.Periodos).FirstOrDefaultAsync(d => d.Id == id)
                     ?? throw new NaoEncontradoException("Diária não encontrada.");
        if (!SituacaoDiaria.OcupaDatas(diaria.Situacao))
            throw new RegraNegocioException("Somente diárias pendentes ou aprovadas podem ser canceladas.");

        diaria.Situacao = SituacaoDiaria.Cancelada;
        diaria.MotivoCancelamento = motivo.Trim();
        diaria.AtualizadoEm = DateTime.UtcNow;
        foreach (var p in diaria.Periodos) p.Ativo = false;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    public static int Dias(DateOnly inicio, DateOnly fim) => fim.DayNumber - inicio.DayNumber + 1;
}
