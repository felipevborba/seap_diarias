using DiariasSeap.Api.Dados;
using DiariasSeap.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;

namespace DiariasSeap.Api.Servicos;

public record CargoDto(int Id, string Nome, bool Ativo, int Servidores, int Diarias, int Valores, short? ClasseBeneficiario = null);
public record CargoRequest(string Nome, bool Ativo, short? ClasseBeneficiario = null);
public record RegiaoDto(int Id, string Nome, List<MunicipioDto> Municipios);
public record RegiaoRequest(string Nome, List<int> MunicipioIds);
/// <summary>Obsoleto = tipo "valor livre" da versão 004 (passagem como diária); não aparece mais no lançamento.</summary>
public record TipoDiariaDto(int Id, string Nome, string? Descricao, bool Ativo, string ColunaMapa, bool Obsoleto);
public record TipoDiariaRequest(string Nome, string? Descricao, bool Ativo, string? ColunaMapa = null);
public record ValorDiariaDto(int Id, int TipoDiariaId, string TipoDiaria, Vinculo? Vinculo, int? CargoId, string? Cargo,
    decimal Valor, DateOnly VigenciaInicio, DateOnly? VigenciaFim, short? ClasseBeneficiario, string? FaixaDestino);
public record LotacaoDto(int Id, string? Sigla, string Nome, int Policiais, int Servidores, int Diarias);
public record LotacaoRequest(string? Sigla, string Nome);
public record ValorDiariaRequest(int TipoDiariaId, Vinculo? Vinculo, int? CargoId, decimal Valor, DateOnly VigenciaInicio, DateOnly? VigenciaFim,
    short? ClasseBeneficiario = null, string? FaixaDestino = null);

/// <summary>Cadastros de apoio: cargos e regiões (schema comum) e tipos/valores de diária (schema diarias).</summary>
public class CadastrosService
{
    private readonly DiariasContext _db;

    public CadastrosService(DiariasContext db) => _db = db;

    // ---------- Cargos ----------
    public async Task<List<CargoDto>> CargosAsync(bool somenteAtivos)
    {
        var cargos = await _db.Cargos.AsNoTracking().Where(c => !somenteAtivos || c.Ativo).OrderBy(c => c.Nome).ToListAsync();
        if (somenteAtivos) return cargos.Select(c => new CargoDto(c.Id, c.Nome, c.Ativo, 0, 0, 0, c.ClasseBeneficiario)).ToList();
        var servidores = await Contagem(_db.Servidores.Where(s => s.CargoId != null).GroupBy(s => s.CargoId!.Value));
        var diarias = await Contagem(_db.Diarias.Where(d => d.CargoId != null).GroupBy(d => d.CargoId!.Value));
        var valores = await Contagem(_db.ValoresDiaria.Where(v => v.CargoId != null).GroupBy(v => v.CargoId!.Value));
        return cargos.Select(c => new CargoDto(c.Id, c.Nome, c.Ativo, servidores.GetValueOrDefault(c.Id),
            diarias.GetValueOrDefault(c.Id), valores.GetValueOrDefault(c.Id), c.ClasseBeneficiario)).ToList();
    }

    private static Task<Dictionary<int, int>> Contagem<T>(IQueryable<IGrouping<int, T>> grupos) =>
        grupos.Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);

    /// <summary>
    /// Exclui o cargo. Se estiver em uso, exige um cargo substituto (útil para unificar cadastros duplicados como
    /// "AGENTE SEG PENITENCIARIA" / "AGENTE DE SEG PENITENCIARIA"): servidores, diárias e linhas da Tabela de
    /// Valores passam para o substituto.
    /// </summary>
    public async Task<string> ExcluirCargoAsync(int id, int? substitutoId)
    {
        var cargo = await _db.Cargos.FindAsync(id) ?? throw new NaoEncontradoException("Cargo não encontrado.");
        if (string.Equals(cargo.Nome, ServidoresService.CargoPolicialPenal, StringComparison.OrdinalIgnoreCase))
            throw new RegraNegocioException($"O cargo \"{cargo.Nome}\" é usado pela sincronização com a Carteira e não pode ser excluído.");
        var servidores = await _db.Servidores.CountAsync(s => s.CargoId == id);
        var diarias = await _db.Diarias.CountAsync(d => d.CargoId == id);
        var valores = await _db.ValoresDiaria.Where(v => v.CargoId == id).ToListAsync();
        var emUso = servidores + diarias + valores.Count > 0;

        Cargo? substituto = null;
        if (emUso)
        {
            if (substitutoId == null)
                throw new RegraNegocioException($"O cargo \"{cargo.Nome}\" está em uso ({servidores:N0} servidores, {diarias:N0} diárias, " +
                    $"{valores.Count:N0} valores). Escolha o cargo que vai substituí-lo.");
            if (substitutoId == id) throw new RegraNegocioException("Escolha um cargo diferente do que será excluído.");
            substituto = await _db.Cargos.FindAsync(substitutoId.Value) ?? throw new RegraNegocioException("Cargo substituto não encontrado.");
        }

        await using var tx = await _db.Database.BeginTransactionAsync();
        if (substituto != null)
        {
            foreach (var v in valores)
            {
                var duplicada = await _db.ValoresDiaria.AnyAsync(x => x.Id != v.Id && x.CargoId == substituto.Id && x.TipoDiariaId == v.TipoDiariaId
                    && x.Vinculo == v.Vinculo && x.VigenciaInicio == v.VigenciaInicio);
                if (duplicada) _db.ValoresDiaria.Remove(v); // o substituto já tem valor para o mesmo tipo/vínculo/vigência
                else v.CargoId = substituto.Id;
            }
            foreach (var s in await _db.Servidores.Where(s => s.CargoId == id).ToListAsync()) s.CargoId = substituto.Id;
            await _db.SaveChangesAsync();
            // Diárias: cargo fotografado no lançamento; atualização em massa (pode ser dezenas de milhares) com um
            // registro de auditoria resumindo a unificação.
            await _db.Diarias.Where(d => d.CargoId == id).ExecuteUpdateAsync(u => u.SetProperty(d => d.CargoId, substituto.Id));
            _db.Auditoria.Add(new Seap.Compartilhado.Auditoria.RegistroAuditoria
            {
                Modulo = DiariasContext.Modulo, Entidade = "cargo", EntidadeId = id.ToString(), RaizEntidade = "cargo", RaizId = id.ToString(),
                Acao = "ALTERACAO", DataHora = DateTime.UtcNow,
                Alteracoes = System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, object?[]>
                {
                    ["UnificadoEm"] = new object?[] { cargo.Nome, substituto.Nome },
                    ["DiariasTransferidas"] = new object?[] { null, diarias }
                })
            });
        }
        _db.Cargos.Remove(cargo);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return substituto == null ? "Cargo excluído." : $"Cargo excluído; {servidores:N0} servidores e {diarias:N0} diárias passaram para \"{substituto.Nome}\".";
    }

    public async Task<int> SalvarCargoAsync(int? id, CargoRequest req)
    {
        var nome = Obrigatorio(req.Nome, "Informe o nome do cargo.");
        if (await _db.Cargos.AnyAsync(c => c.Nome.ToLower() == nome.ToLower() && c.Id != id))
            throw new RegraNegocioException("Já existe cargo com este nome.");
        var cargo = id.HasValue
            ? await _db.Cargos.FindAsync(id.Value) ?? throw new NaoEncontradoException("Cargo não encontrado.")
            : _db.Cargos.Add(new Cargo()).Entity;
        if (!ClassesBeneficiario.Valida(req.ClasseBeneficiario)) throw new RegraNegocioException("Classe de beneficiário inválida (1, 2 ou 3).");
        cargo.Nome = nome;
        cargo.Ativo = req.Ativo;
        cargo.ClasseBeneficiario = req.ClasseBeneficiario;
        await _db.SaveChangesAsync();
        return cargo.Id;
    }

    // ---------- Regiões ----------
    public async Task<List<RegiaoDto>> RegioesAsync() =>
        (await _db.Regioes.AsNoTracking().Include(r => r.Municipios).ThenInclude(m => m.Municipio).ThenInclude(m => m.Uf)
            .OrderBy(r => r.Nome).ToListAsync())
        .Select(r => new RegiaoDto(r.Id, r.Nome, r.Municipios
            .Select(m => new MunicipioDto(m.MunicipioId, m.Municipio.Nome, m.Municipio.Uf.Sigla))
            .OrderBy(m => m.Nome).ToList()))
        .ToList();

    public async Task<int> SalvarRegiaoAsync(int? id, RegiaoRequest req)
    {
        var nome = Obrigatorio(req.Nome, "Informe o nome da região.");
        if (await _db.Regioes.AnyAsync(r => r.Nome.ToLower() == nome.ToLower() && r.Id != id))
            throw new RegraNegocioException("Já existe região com este nome.");

        var ids = req.MunicipioIds.Distinct().ToList();
        var emOutra = await _db.RegioesMunicipios.AsNoTracking()
            .Where(rm => ids.Contains(rm.MunicipioId) && rm.RegiaoId != id)
            .Select(rm => rm.Municipio.Nome + " (" + rm.Regiao.Nome + ")").ToListAsync();
        if (emOutra.Count > 0)
            throw new RegraNegocioException("Municípios já pertencem a outra região: " + string.Join(", ", emOutra));

        var regiao = id.HasValue
            ? await _db.Regioes.Include(r => r.Municipios).FirstOrDefaultAsync(r => r.Id == id)
              ?? throw new NaoEncontradoException("Região não encontrada.")
            : _db.Regioes.Add(new Regiao()).Entity;
        regiao.Nome = nome;
        regiao.Municipios.RemoveAll(m => !ids.Contains(m.MunicipioId));
        foreach (var mid in ids.Where(mid => regiao.Municipios.All(m => m.MunicipioId != mid)))
            regiao.Municipios.Add(new RegiaoMunicipio { MunicipioId = mid });
        await _db.SaveChangesAsync();
        return regiao.Id;
    }

    public async Task ExcluirRegiaoAsync(int id)
    {
        var regiao = await _db.Regioes.FindAsync(id) ?? throw new NaoEncontradoException("Região não encontrada.");
        _db.Regioes.Remove(regiao);
        await _db.SaveChangesAsync();
    }

    // ---------- Tipos de diária ----------
    public Task<List<TipoDiariaDto>> TiposAsync(bool somenteAtivos) =>
        _db.TiposDiaria.AsNoTracking().Where(t => !somenteAtivos || (t.Ativo && !t.ValorLivre)).OrderBy(t => t.Id)
            .Select(t => new TipoDiariaDto(t.Id, t.Nome, t.Descricao, t.Ativo, t.ColunaMapa, t.ValorLivre)).ToListAsync();

    public async Task<int> SalvarTipoAsync(int? id, TipoDiariaRequest req)
    {
        var nome = Obrigatorio(req.Nome, "Informe o nome do tipo.");
        if (await _db.TiposDiaria.AnyAsync(t => t.Nome.ToLower() == nome.ToLower() && t.Id != id))
            throw new RegraNegocioException("Já existe tipo com este nome.");
        var tipo = id.HasValue
            ? await _db.TiposDiaria.FindAsync(id.Value) ?? throw new NaoEncontradoException("Tipo não encontrado.")
            : _db.TiposDiaria.Add(new TipoDiaria()).Entity;
        tipo.Nome = nome;
        tipo.Descricao = string.IsNullOrWhiteSpace(req.Descricao) ? null : req.Descricao.Trim();
        tipo.Ativo = req.Ativo;
        tipo.ColunaMapa = req.ColunaMapa switch
        {
            null or "" => tipo.ColunaMapa,
            ColunasMapa.Integral or ColunasMapa.Parcial => req.ColunaMapa,
            _ => throw new RegraNegocioException("Coluna da planilha da Controladoria inválida (INTEGRAL ou PARCIAL).")
        };
        await _db.SaveChangesAsync();
        return tipo.Id;
    }

    /// <summary>Exclui o tipo (e suas linhas da tabela de valores) se nenhuma diária o usa; caso contrário, oriente a desativar.</summary>
    public async Task ExcluirTipoAsync(int id)
    {
        var tipo = await _db.TiposDiaria.FindAsync(id) ?? throw new NaoEncontradoException("Tipo não encontrado.");
        var usos = await _db.DiariasItens.CountAsync(i => i.TipoDiariaId == id);
        if (usos > 0)
            throw new RegraNegocioException($"O tipo \"{tipo.Nome}\" é usado em {usos:N0} lançamentos e não pode ser excluído. Desative-o para que não apareça em novos lançamentos.");
        await using var tx = await _db.Database.BeginTransactionAsync();
        _db.ValoresDiaria.RemoveRange(await _db.ValoresDiaria.Where(v => v.TipoDiariaId == id).ToListAsync());
        _db.TiposDiaria.Remove(tipo);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    // ---------- Lotações (public.unidade, compartilhada com a Carteira) ----------
    public async Task<List<LotacaoDto>> LotacoesAsync() =>
        await _db.Unidades.AsNoTracking().OrderBy(u => u.Nome)
            .Select(u => new LotacaoDto(u.Id, u.Sigla, u.Nome,
                _db.PoliciaisPenais.Count(p => p.UnidadeId == u.Id),
                _db.Servidores.Count(s => s.UnidadeId == u.Id),
                _db.Diarias.Count(d => d.UnidadeId == u.Id)))
            .ToListAsync();

    public async Task<int> SalvarLotacaoAsync(int? id, LotacaoRequest req)
    {
        var nome = Obrigatorio(req.Nome, "Informe o nome da lotação.");
        var sigla = string.IsNullOrWhiteSpace(req.Sigla) ? null : req.Sigla.Trim().ToUpperInvariant();
        if (await _db.Unidades.AnyAsync(u => u.Nome.ToLower() == nome.ToLower() && u.Id != id))
            throw new RegraNegocioException("Já existe lotação com este nome.");
        if (sigla != null && await _db.Unidades.AnyAsync(u => u.Sigla != null && u.Sigla.ToUpper() == sigla && u.Id != id))
            throw new RegraNegocioException("Já existe lotação com esta sigla.");
        var unidade = id.HasValue
            ? await _db.Unidades.FindAsync(id.Value) ?? throw new NaoEncontradoException("Lotação não encontrada.")
            : _db.Unidades.Add(new Unidade()).Entity;
        unidade.Nome = nome.ToUpperInvariant();
        unidade.Sigla = sigla;
        await _db.SaveChangesAsync();
        return unidade.Id;
    }

    /// <summary>Exclusão só de lotação sem uso (policiais da Carteira, servidores ou diárias impedem).</summary>
    public async Task ExcluirLotacaoAsync(int id)
    {
        var unidade = await _db.Unidades.FindAsync(id) ?? throw new NaoEncontradoException("Lotação não encontrada.");
        var policiais = await _db.PoliciaisPenais.CountAsync(p => p.UnidadeId == id);
        var servidores = await _db.Servidores.CountAsync(s => s.UnidadeId == id);
        var diarias = await _db.Diarias.CountAsync(d => d.UnidadeId == id);
        if (policiais + servidores + diarias > 0)
            throw new RegraNegocioException($"A lotação está em uso ({policiais:N0} policiais na Carteira, {servidores:N0} servidores, {diarias:N0} diárias) e não pode ser excluída.");
        _db.Unidades.Remove(unidade);
        await _db.SaveChangesAsync();
    }

    // ---------- Tabela de valores ----------
    public Task<List<ValorDiariaDto>> ValoresAsync(int? tipoDiariaId, bool somenteVigentes)
    {
        var hoje = DateOnly.FromDateTime(DateTime.Today);
        var q = _db.ValoresDiaria.AsNoTracking().AsQueryable();
        if (tipoDiariaId.HasValue) q = q.Where(v => v.TipoDiariaId == tipoDiariaId);
        if (somenteVigentes) q = q.Where(v => v.VigenciaFim == null || v.VigenciaFim >= hoje);
        return q.OrderBy(v => v.TipoDiaria.Nome).ThenBy(v => v.ClasseBeneficiario).ThenBy(v => v.FaixaDestino)
            .ThenBy(v => v.Vinculo).ThenBy(v => v.Cargo!.Nome).ThenByDescending(v => v.VigenciaInicio)
            .Select(v => new ValorDiariaDto(v.Id, v.TipoDiariaId, v.TipoDiaria.Nome, v.Vinculo, v.CargoId,
                v.Cargo != null ? v.Cargo.Nome : null, v.Valor, v.VigenciaInicio, v.VigenciaFim, v.ClasseBeneficiario, v.FaixaDestino))
            .ToListAsync();
    }

    /// <summary>
    /// Para reajustar um valor, encerre a vigência da linha atual e crie outra a partir da nova data:
    /// diárias antigas continuam calculadas pelo valor da época. A sobreposição é barrada pelo banco.
    /// </summary>
    public async Task<int> SalvarValorAsync(int? id, ValorDiariaRequest req)
    {
        if (req.Valor <= 0) throw new RegraNegocioException("O valor deve ser maior que zero.");
        if (req.VigenciaFim.HasValue && req.VigenciaFim < req.VigenciaInicio)
            throw new RegraNegocioException("O fim da vigência deve ser posterior ao início.");
        if (req.Vinculo.HasValue && !Enum.IsDefined(req.Vinculo.Value)) throw new RegraNegocioException("Vínculo inválido.");
        if (!await _db.TiposDiaria.AnyAsync(t => t.Id == req.TipoDiariaId)) throw new RegraNegocioException("Tipo inválido.");
        if (req.CargoId.HasValue && !await _db.Cargos.AnyAsync(c => c.Id == req.CargoId)) throw new RegraNegocioException("Cargo inválido.");
        if (!ClassesBeneficiario.Valida(req.ClasseBeneficiario)) throw new RegraNegocioException("Classe de beneficiário inválida (1, 2 ou 3).");
        var faixa = string.IsNullOrWhiteSpace(req.FaixaDestino) ? null : req.FaixaDestino;
        if (faixa != null && !FaixasDestino.Todas.Contains(faixa)) throw new RegraNegocioException("Faixa de destino inválida.");

        var valor = id.HasValue
            ? await _db.ValoresDiaria.FindAsync(id.Value) ?? throw new NaoEncontradoException("Valor não encontrado.")
            : _db.ValoresDiaria.Add(new ValorDiaria()).Entity;
        valor.TipoDiariaId = req.TipoDiariaId;
        valor.Vinculo = req.Vinculo;
        valor.CargoId = req.CargoId;
        valor.ClasseBeneficiario = req.ClasseBeneficiario;
        valor.FaixaDestino = faixa;
        valor.Valor = decimal.Round(req.Valor, 2);
        valor.VigenciaInicio = req.VigenciaInicio;
        valor.VigenciaFim = req.VigenciaFim;
        await _db.SaveChangesAsync();
        return valor.Id;
    }

    public async Task ExcluirValorAsync(int id)
    {
        var valor = await _db.ValoresDiaria.FindAsync(id) ?? throw new NaoEncontradoException("Valor não encontrado.");
        _db.ValoresDiaria.Remove(valor);
        await _db.SaveChangesAsync();
    }

    private static string Obrigatorio(string? valor, string mensagem) =>
        string.IsNullOrWhiteSpace(valor) ? throw new RegraNegocioException(mensagem) : valor.Trim();
}

/// <summary>
/// Resolve o valor unitário da diária: entre as linhas vigentes na data para o tipo, vale a mais específica.
/// Peso: faixa de destino 8, classe do beneficiário 4, cargo 2, vínculo 1 (linhas da Tabela de Diárias Nacionais,
/// com classe e faixa, prevalecem sobre as genéricas antigas).
/// </summary>
public class TabelaValores
{
    private readonly DiariasContext _db;

    public TabelaValores(DiariasContext db) => _db = db;

    public async Task<decimal?> ResolverAsync(int tipoDiariaId, Vinculo vinculo, int? cargoId, DateOnly data,
        int? classe = null, string? faixa = null)
    {
        var candidatos = await _db.ValoresDiaria.AsNoTracking()
            .Where(v => v.TipoDiariaId == tipoDiariaId
                        && v.VigenciaInicio <= data && (v.VigenciaFim == null || v.VigenciaFim >= data)
                        && (v.Vinculo == null || v.Vinculo == vinculo)
                        && (v.CargoId == null || v.CargoId == cargoId)
                        && (v.ClasseBeneficiario == null || v.ClasseBeneficiario == classe)
                        && (v.FaixaDestino == null || v.FaixaDestino == faixa))
            .ToListAsync();

        return candidatos
            .OrderByDescending(v => (v.FaixaDestino != null ? 8 : 0) + (v.ClasseBeneficiario != null ? 4 : 0)
                                    + (v.CargoId != null ? 2 : 0) + (v.Vinculo != null ? 1 : 0))
            .Select(v => (decimal?)v.Valor)
            .FirstOrDefault();
    }
}
