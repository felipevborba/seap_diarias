using DiariasSeres.Api.Dados;
using DiariasSeres.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;

namespace DiariasSeres.Api.Servicos;

public record CargoDto(int Id, string Nome, bool Ativo);
public record CargoRequest(string Nome, bool Ativo);
public record RegiaoDto(int Id, string Nome, List<MunicipioDto> Municipios);
public record RegiaoRequest(string Nome, List<int> MunicipioIds);
public record TipoDiariaDto(int Id, string Nome, string? Descricao, bool Ativo);
public record TipoDiariaRequest(string Nome, string? Descricao, bool Ativo);
public record ValorDiariaDto(int Id, int TipoDiariaId, string TipoDiaria, Vinculo? Vinculo, int? CargoId, string? Cargo,
    decimal Valor, DateOnly VigenciaInicio, DateOnly? VigenciaFim);
public record ValorDiariaRequest(int TipoDiariaId, Vinculo? Vinculo, int? CargoId, decimal Valor, DateOnly VigenciaInicio, DateOnly? VigenciaFim);

/// <summary>Cadastros de apoio: cargos e regiões (schema comum) e tipos/valores de diária (schema diarias).</summary>
public class CadastrosService
{
    private readonly DiariasContext _db;

    public CadastrosService(DiariasContext db) => _db = db;

    // ---------- Cargos ----------
    public Task<List<CargoDto>> CargosAsync(bool somenteAtivos) =>
        _db.Cargos.AsNoTracking().Where(c => !somenteAtivos || c.Ativo).OrderBy(c => c.Nome)
            .Select(c => new CargoDto(c.Id, c.Nome, c.Ativo)).ToListAsync();

    public async Task<int> SalvarCargoAsync(int? id, CargoRequest req)
    {
        var nome = Obrigatorio(req.Nome, "Informe o nome do cargo.");
        if (await _db.Cargos.AnyAsync(c => c.Nome.ToLower() == nome.ToLower() && c.Id != id))
            throw new RegraNegocioException("Já existe cargo com este nome.");
        var cargo = id.HasValue
            ? await _db.Cargos.FindAsync(id.Value) ?? throw new NaoEncontradoException("Cargo não encontrado.")
            : _db.Cargos.Add(new Cargo()).Entity;
        cargo.Nome = nome;
        cargo.Ativo = req.Ativo;
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
        _db.TiposDiaria.AsNoTracking().Where(t => !somenteAtivos || t.Ativo).OrderBy(t => t.Id)
            .Select(t => new TipoDiariaDto(t.Id, t.Nome, t.Descricao, t.Ativo)).ToListAsync();

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
        await _db.SaveChangesAsync();
        return tipo.Id;
    }

    // ---------- Tabela de valores ----------
    public Task<List<ValorDiariaDto>> ValoresAsync(int? tipoDiariaId, bool somenteVigentes)
    {
        var hoje = DateOnly.FromDateTime(DateTime.Today);
        var q = _db.ValoresDiaria.AsNoTracking().AsQueryable();
        if (tipoDiariaId.HasValue) q = q.Where(v => v.TipoDiariaId == tipoDiariaId);
        if (somenteVigentes) q = q.Where(v => v.VigenciaFim == null || v.VigenciaFim >= hoje);
        return q.OrderBy(v => v.TipoDiaria.Nome).ThenBy(v => v.Vinculo).ThenBy(v => v.Cargo!.Nome)
            .ThenByDescending(v => v.VigenciaInicio)
            .Select(v => new ValorDiariaDto(v.Id, v.TipoDiariaId, v.TipoDiaria.Nome, v.Vinculo, v.CargoId,
                v.Cargo != null ? v.Cargo.Nome : null, v.Valor, v.VigenciaInicio, v.VigenciaFim))
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

        var valor = id.HasValue
            ? await _db.ValoresDiaria.FindAsync(id.Value) ?? throw new NaoEncontradoException("Valor não encontrado.")
            : _db.ValoresDiaria.Add(new ValorDiaria()).Entity;
        valor.TipoDiariaId = req.TipoDiariaId;
        valor.Vinculo = req.Vinculo;
        valor.CargoId = req.CargoId;
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
/// Resolve o valor unitário da diária: entre as linhas vigentes na data para o tipo, vale a mais específica
/// (cargo+vínculo, depois só cargo, depois só vínculo, depois genérica).
/// </summary>
public class TabelaValores
{
    private readonly DiariasContext _db;

    public TabelaValores(DiariasContext db) => _db = db;

    public async Task<decimal?> ResolverAsync(int tipoDiariaId, Vinculo vinculo, int? cargoId, DateOnly data)
    {
        var candidatos = await _db.ValoresDiaria.AsNoTracking()
            .Where(v => v.TipoDiariaId == tipoDiariaId
                        && v.VigenciaInicio <= data && (v.VigenciaFim == null || v.VigenciaFim >= data)
                        && (v.Vinculo == null || v.Vinculo == vinculo)
                        && (v.CargoId == null || v.CargoId == cargoId))
            .ToListAsync();

        return candidatos
            .OrderByDescending(v => (v.CargoId != null ? 2 : 0) + (v.Vinculo != null ? 1 : 0))
            .Select(v => (decimal?)v.Valor)
            .FirstOrDefault();
    }
}
