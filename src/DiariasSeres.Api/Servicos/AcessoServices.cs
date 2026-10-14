using DiariasSeres.Api.Dados;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeres.Api.Servicos;

public record LoginRequest(string Cpf, string Senha);
public record SessaoDto(string Token, DateTime Expira, int UsuarioId, string Nome, string? Matricula, string Perfil);

/// <summary>
/// Login com os mesmos usuários (public.usuario) e a mesma cifra de senha do CarteiraPenal.
/// O acesso às Diárias exige perfil em comum.usuario_perfil; o administrador geral (principal = 'S')
/// entra como ADMIN mesmo sem perfil, para que o primeiro acesso seja possível.
/// </summary>
public class AuthService
{
    private readonly DiariasContext _db;
    private readonly TokenService _tokens;

    public AuthService(DiariasContext db, TokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    public async Task<SessaoDto> EntrarAsync(LoginRequest req)
    {
        var cpf = CifraDelphi.SomenteDigitos(req.Cpf);
        if (cpf.Length != 11 || string.IsNullOrWhiteSpace(req.Senha))
            throw new RegraNegocioException("Informe CPF e senha.");

        var senha = CifraDelphi.Criptografar(req.Senha);
        var usuario = await _db.Usuarios.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Documento == cpf && u.Senha == senha)
            ?? throw new AcessoNegadoException("CPF ou senha inválidos.");

        var perfil = await PerfilAsync(usuario)
            ?? throw new AcessoNegadoException("Seu usuário não tem acesso ao sistema de Diárias. Procure o administrador.");

        var (token, expira) = _tokens.Gerar(usuario, DiariasContext.Modulo, perfil);
        return new SessaoDto(token, expira, usuario.Id, usuario.Nome, usuario.Matricula, perfil);
    }

    public async Task<string?> PerfilAsync(Usuario usuario)
    {
        var perfil = await _db.UsuariosPerfis.AsNoTracking()
            .Where(p => p.UsuarioId == usuario.Id && p.Modulo == DiariasContext.Modulo)
            .Select(p => p.Perfil).FirstOrDefaultAsync();
        return perfil ?? (usuario.EhAdministradorGeral ? Perfis.Administrador : null);
    }
}

public class AcessoNegadoException : Exception
{
    public AcessoNegadoException(string mensagem) : base(mensagem) { }
}

public record UsuarioDto(int Id, string Nome, string? Matricula, string? Cpf, bool AdministradorGeral, string? Perfil);
public record DefinirPerfilRequest(string? Perfil);
public record CriarUsuarioRequest(string Nome, string Cpf, string? Matricula, string Senha, string Perfil);

/// <summary>
/// Gestão de acesso ao módulo. Os usuários são os mesmos do CarteiraPenal: aqui se concede/revoga o
/// perfil das Diárias. Criar usuário novo grava em public.usuario e, enquanto o CarteiraPenal não
/// verificar perfil por módulo, esse usuário também conseguiria entrar na Carteira; por isso a criação
/// fica desligada por padrão (Usuarios:PermitirCriacao).
/// </summary>
public class UsuariosService
{
    private readonly DiariasContext _db;
    private readonly IConfiguration _config;

    public UsuariosService(DiariasContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public bool CriacaoPermitida => _config.GetValue<bool>("Usuarios:PermitirCriacao");

    public async Task<PagedResult<UsuarioDto>> ListarAsync(string? busca, bool somenteComAcesso, int page, int pageSize)
    {
        (page, pageSize) = PagedResult<UsuarioDto>.Normalizar(page, pageSize);
        var q = from u in _db.Usuarios.AsNoTracking()
                join p in _db.UsuariosPerfis.Where(p => p.Modulo == DiariasContext.Modulo) on u.Id equals p.UsuarioId into pj
                from p in pj.DefaultIfEmpty()
                select new { u, Perfil = p != null ? p.Perfil : null };

        if (!string.IsNullOrWhiteSpace(busca))
        {
            var termo = $"%{busca.Trim()}%";
            var digitos = CifraDelphi.SomenteDigitos(busca);
            q = q.Where(x => EF.Functions.ILike(x.u.Nome, termo) || EF.Functions.ILike(x.u.Matricula ?? "", termo)
                             || (digitos.Length > 0 && (x.u.Documento ?? "").Contains(digitos)));
        }
        if (somenteComAcesso)
            q = q.Where(x => x.Perfil != null || x.u.Principal == 'S');

        var total = await q.CountAsync();
        var itens = await q.OrderBy(x => x.u.Nome).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new UsuarioDto(x.u.Id, x.u.Nome, x.u.Matricula, x.u.Documento, x.u.Principal == 'S',
                x.Perfil ?? (x.u.Principal == 'S' ? Perfis.Administrador : null)))
            .ToListAsync();
        return new PagedResult<UsuarioDto>(itens, page, pageSize, total);
    }

    public async Task DefinirPerfilAsync(int usuarioId, string? perfil, int? usuarioLogadoId)
    {
        if (usuarioId == usuarioLogadoId)
            throw new RegraNegocioException("Você não pode alterar o seu próprio perfil.");
        if (perfil != null && !Perfis.Todos.Contains(perfil))
            throw new RegraNegocioException("Perfil inválido.");
        if (!await _db.Usuarios.AnyAsync(u => u.Id == usuarioId))
            throw new NaoEncontradoException("Usuário não encontrado.");

        var atual = await _db.UsuariosPerfis
            .FirstOrDefaultAsync(p => p.UsuarioId == usuarioId && p.Modulo == DiariasContext.Modulo);
        if (perfil == null)
        {
            if (atual != null) _db.UsuariosPerfis.Remove(atual);
        }
        else if (atual == null)
            _db.UsuariosPerfis.Add(new UsuarioPerfil { UsuarioId = usuarioId, Modulo = DiariasContext.Modulo, Perfil = perfil });
        else
            atual.Perfil = perfil;

        await _db.SaveChangesAsync();
    }

    public async Task<int> CriarAsync(CriarUsuarioRequest req)
    {
        if (!CriacaoPermitida)
            throw new RegraNegocioException("A criação de usuários está desabilitada neste módulo. Cadastre o usuário no sistema da Carteira e conceda o acesso aqui.");
        var cpf = CifraDelphi.SomenteDigitos(req.Cpf);
        if (!Cpf.Valido(cpf)) throw new RegraNegocioException("CPF inválido.");
        if (string.IsNullOrWhiteSpace(req.Nome)) throw new RegraNegocioException("Informe o nome.");
        if (string.IsNullOrWhiteSpace(req.Senha) || req.Senha.Length < 6)
            throw new RegraNegocioException("A senha deve ter ao menos 6 caracteres.");
        if (!Perfis.Todos.Contains(req.Perfil)) throw new RegraNegocioException("Perfil inválido.");
        if (await _db.Usuarios.AnyAsync(u => u.Documento == cpf))
            throw new RegraNegocioException("Já existe usuário com este CPF. Use a opção de conceder acesso.");

        await using var tx = await _db.Database.BeginTransactionAsync();
        var usuario = new Usuario
        {
            Nome = req.Nome.Trim(), Documento = cpf, Matricula = req.Matricula?.Trim(),
            Senha = CifraDelphi.Criptografar(req.Senha), Principal = 'N'
        };
        _db.Usuarios.Add(usuario);
        await _db.SaveChangesAsync();
        _db.UsuariosPerfis.Add(new UsuarioPerfil { UsuarioId = usuario.Id, Modulo = DiariasContext.Modulo, Perfil = req.Perfil });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return usuario.Id;
    }
}

public record OpcaoDto(int Id, string Nome);
public record MunicipioDto(int Id, string Nome, string Uf);

public class LocalidadesService
{
    private readonly DiariasContext _db;

    public LocalidadesService(DiariasContext db) => _db = db;

    public Task<List<OpcaoDto>> UfsAsync() => _db.Ufs.AsNoTracking().OrderBy(u => u.Sigla)
        .Select(u => new OpcaoDto(u.Id, u.Sigla)).ToListAsync();

    public Task<List<OpcaoDto>> UnidadesAsync() => _db.Unidades.AsNoTracking().OrderBy(u => u.Nome)
        .Select(u => new OpcaoDto(u.Id, u.Sigla != null && u.Sigla != "" ? u.Nome + " (" + u.Sigla + ")" : u.Nome)).ToListAsync();

    public async Task<List<MunicipioDto>> MunicipiosAsync(string? busca, int? ufId, int limite = 30)
    {
        var q = _db.Municipios.AsNoTracking().AsQueryable();
        if (ufId.HasValue) q = q.Where(m => m.UfId == ufId);
        if (!string.IsNullOrWhiteSpace(busca))
            q = q.Where(m => EF.Functions.ILike(EF.Functions.Unaccent(m.Nome), EF.Functions.Unaccent($"%{busca.Trim()}%")));
        return await q.OrderBy(m => m.Uf.Sigla != "PE").ThenBy(m => m.Nome).Take(Math.Clamp(limite, 1, 100))
            .Select(m => new MunicipioDto(m.Id, m.Nome, m.Uf.Sigla)).ToListAsync();
    }
}
