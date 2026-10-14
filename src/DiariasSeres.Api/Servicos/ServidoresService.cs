using DiariasSeres.Api.Dados;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeres.Api.Servicos;

public record ServidorFiltro(string? Busca, int? UnidadeId, Vinculo? Vinculo, bool? Ativo, int Page = 1, int PageSize = 20);

public record ServidorListaDto(int Id, string Nome, string? Cpf, string? Matricula, Vinculo Vinculo, string? Cargo,
    string? Unidade, bool PolicialPenal, bool Ativo);

public record ServidorDto(int Id, string Nome, string? Cpf, string? Matricula, Vinculo Vinculo, int? CargoId, string? Cargo,
    int? UnidadeId, string? Unidade, int? PoliciaPenalId, string? Email, string? Celular, string? Banco, string? Agencia,
    string? Conta, bool Ativo);

public record ServidorRequest(string Nome, string Cpf, string? Matricula, Vinculo Vinculo, int? CargoId, int? UnidadeId,
    string? Email, string? Celular, string? Banco, string? Agencia, string? Conta, bool Ativo);

public record SincronizacaoResultado(int Criados, int Atualizados, int Vinculados, int IgnoradosSemCpf);

/// <summary>
/// Cadastro de servidores (comum.servidor). Policiais penais vêm de public.policia_penal: para eles
/// nome, CPF, matrícula e lotação são somente leitura aqui e são atualizados pela sincronização.
/// </summary>
public class ServidoresService
{
    public const string CargoPolicialPenal = "Policial Penal";
    private readonly DiariasContext _db;

    public ServidoresService(DiariasContext db) => _db = db;

    public async Task<PagedResult<ServidorListaDto>> ListarAsync(ServidorFiltro f)
    {
        var (page, pageSize) = PagedResult<ServidorListaDto>.Normalizar(f.Page, f.PageSize);
        var q = Filtrar(_db.Servidores.AsNoTracking(), f.Busca);
        if (f.UnidadeId.HasValue) q = q.Where(s => s.UnidadeId == f.UnidadeId);
        if (f.Vinculo.HasValue) q = q.Where(s => s.Vinculo == f.Vinculo);
        if (f.Ativo.HasValue) q = q.Where(s => s.Ativo == f.Ativo);

        var total = await q.CountAsync();
        var itens = await q.OrderBy(s => s.Nome).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(s => new ServidorListaDto(s.Id, s.Nome, s.Cpf, s.Matricula, s.Vinculo,
                s.Cargo != null ? s.Cargo.Nome : null, s.Unidade != null ? s.Unidade.Nome : null,
                s.PoliciaPenalId != null, s.Ativo))
            .ToListAsync();
        return new PagedResult<ServidorListaDto>(itens, page, pageSize, total);
    }

    /// <summary>Autocomplete do lançamento: só ativos, no máximo 20.</summary>
    public Task<List<ServidorListaDto>> BuscarAsync(string termo) =>
        Filtrar(_db.Servidores.AsNoTracking().Where(s => s.Ativo), termo)
            .OrderBy(s => s.Nome).Take(20)
            .Select(s => new ServidorListaDto(s.Id, s.Nome, s.Cpf, s.Matricula, s.Vinculo,
                s.Cargo != null ? s.Cargo.Nome : null, s.Unidade != null ? s.Unidade.Nome : null,
                s.PoliciaPenalId != null, s.Ativo))
            .ToListAsync();

    private static IQueryable<Servidor> Filtrar(IQueryable<Servidor> q, string? busca)
    {
        if (string.IsNullOrWhiteSpace(busca)) return q;
        var termo = $"%{busca.Trim()}%";
        var digitos = CifraDelphi.SomenteDigitos(busca);
        return q.Where(s => EF.Functions.ILike(EF.Functions.Unaccent(s.Nome), EF.Functions.Unaccent(termo))
                            || EF.Functions.ILike(s.Matricula ?? "", termo)
                            || (digitos.Length >= 3 && (s.Cpf ?? "").Contains(digitos)));
    }

    public async Task<ServidorDto> ObterAsync(int id) =>
        await _db.Servidores.AsNoTracking().Where(s => s.Id == id)
            .Select(s => new ServidorDto(s.Id, s.Nome, s.Cpf, s.Matricula, s.Vinculo, s.CargoId,
                s.Cargo != null ? s.Cargo.Nome : null, s.UnidadeId, s.Unidade != null ? s.Unidade.Nome : null,
                s.PoliciaPenalId, s.Email, s.Celular, s.Banco, s.Agencia, s.Conta, s.Ativo))
            .FirstOrDefaultAsync()
        ?? throw new NaoEncontradoException("Servidor não encontrado.");

    public async Task<int> CriarAsync(ServidorRequest req)
    {
        var s = new Servidor { CriadoEm = DateTime.UtcNow };
        await Aplicar(s, req);
        _db.Servidores.Add(s);
        await _db.SaveChangesAsync();
        return s.Id;
    }

    public async Task AtualizarAsync(int id, ServidorRequest req)
    {
        var s = await _db.Servidores.FindAsync(id) ?? throw new NaoEncontradoException("Servidor não encontrado.");
        await Aplicar(s, req);
        await _db.SaveChangesAsync();
    }

    private async Task Aplicar(Servidor s, ServidorRequest req)
    {
        if (!Enum.IsDefined(req.Vinculo)) throw new RegraNegocioException("Vínculo inválido.");
        if (req.CargoId.HasValue && !await _db.Cargos.AnyAsync(c => c.Id == req.CargoId))
            throw new RegraNegocioException("Cargo inválido.");
        if (req.UnidadeId.HasValue && !await _db.Unidades.AnyAsync(u => u.Id == req.UnidadeId))
            throw new RegraNegocioException("Unidade inválida.");

        // Policial penal: identificação e lotação pertencem ao cadastro da Carteira.
        if (s.PoliciaPenalId == null)
        {
            var cpf = CifraDelphi.SomenteDigitos(req.Cpf);
            if (!Cpf.Valido(cpf)) throw new RegraNegocioException("CPF inválido.");
            if (string.IsNullOrWhiteSpace(req.Nome)) throw new RegraNegocioException("Informe o nome.");
            if (await _db.Servidores.AnyAsync(x => x.Cpf == cpf && x.Id != s.Id))
                throw new RegraNegocioException("Já existe servidor cadastrado com este CPF.");
            s.Nome = req.Nome.Trim().ToUpperInvariant();
            s.Cpf = cpf;
            s.Matricula = Limpo(req.Matricula);
            s.UnidadeId = req.UnidadeId;
        }

        s.Vinculo = req.Vinculo;
        s.CargoId = req.CargoId;
        s.Email = Limpo(req.Email);
        s.Celular = Limpo(req.Celular);
        s.Banco = Limpo(req.Banco);
        s.Agencia = Limpo(req.Agencia);
        s.Conta = Limpo(req.Conta);
        s.Ativo = req.Ativo;
        s.AtualizadoEm = DateTime.UtcNow;
    }

    private static string? Limpo(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    /// <summary>
    /// Traz os policiais penais da Carteira para o cadastro de servidores: cria os que faltam (vínculo
    /// Efetivo, cargo Policial Penal), vincula servidores já cadastrados com o mesmo CPF e atualiza
    /// nome/matrícula/lotação/situação dos já vinculados. Idempotente.
    /// </summary>
    public async Task<SincronizacaoResultado> SincronizarPoliciaisAsync()
    {
        // Participa de uma transação já aberta (ex.: migração do legado) em vez de abrir outra.
        var propria = _db.Database.CurrentTransaction == null;
        await using var tx = propria ? await _db.Database.BeginTransactionAsync() : null;

        var cargo = await _db.Cargos.FirstOrDefaultAsync(c => c.Nome == CargoPolicialPenal);
        if (cargo == null)
        {
            cargo = new Cargo { Nome = CargoPolicialPenal };
            _db.Cargos.Add(cargo);
            await _db.SaveChangesAsync();
        }

        var policiais = await _db.PoliciaisPenais.AsNoTracking()
            .Select(p => new { p.Id, p.Nome, p.Cpf, p.Matricula, p.UnidadeId, p.StatusTrabalho, p.Email, p.Celular })
            .ToListAsync();
        var servidores = await _db.Servidores.ToListAsync();
        var porPolicial = servidores.Where(s => s.PoliciaPenalId != null).ToDictionary(s => s.PoliciaPenalId!.Value);
        var porCpf = servidores.Where(s => s.Cpf != null).ToDictionary(s => s.Cpf!);

        int criados = 0, atualizados = 0, vinculados = 0, semCpf = 0;
        var agora = DateTime.UtcNow;
        foreach (var p in policiais)
        {
            var cpf = CifraDelphi.SomenteDigitos(p.Cpf);
            var ativo = p.StatusTrabalho == StatusTrabalho.Ativo;
            var contado = false;

            if (!porPolicial.TryGetValue(p.Id, out var s))
            {
                if (cpf.Length != 11) { semCpf++; continue; }
                if (porCpf.TryGetValue(cpf, out s) && s.PoliciaPenalId == null)
                {
                    s.PoliciaPenalId = p.Id;
                    vinculados++;
                    contado = true;
                }
                else if (s == null)
                {
                    s = new Servidor
                    {
                        Cpf = cpf, PoliciaPenalId = p.Id, Vinculo = Vinculo.Efetivo, CargoId = cargo.Id,
                        Email = p.Email, Celular = p.Celular, CriadoEm = agora
                    };
                    _db.Servidores.Add(s);
                    porCpf[cpf] = s;
                    criados++;
                }
                else continue; // CPF já ligado a outro policial (cadastro duplicado na Carteira)
            }

            var nome = p.Nome.Trim().ToUpperInvariant();
            if (s.Id != 0 && s.Nome == nome && s.Matricula == p.Matricula && s.UnidadeId == p.UnidadeId && s.Ativo == ativo)
                continue;
            if (s.Id != 0 && !contado) atualizados++;
            s.Nome = nome;
            s.Matricula = p.Matricula;
            s.UnidadeId = p.UnidadeId;
            s.Ativo = ativo;
            s.AtualizadoEm = agora;
        }

        await _db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return new SincronizacaoResultado(criados, atualizados, vinculados, semCpf);
    }
}
