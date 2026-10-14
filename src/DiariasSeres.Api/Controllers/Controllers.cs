using System.Security.Claims;
using DiariasSeres.Api.Infra;
using DiariasSeres.Api.Servicos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Seap.Compartilhado.Seguranca;

namespace DiariasSeres.Api.Controllers;

// Controllers finos: validação e regras ficam nos serviços; erros viram ApiResponse no TratamentoErrosFilter.

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    public AuthController(AuthService auth) => _auth = auth;

    /// <summary>Área pública: único endpoint de negócio acessível sem token.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
        => this.Sucesso(await _auth.EntrarAsync(req), "Login realizado com sucesso.");

    [HttpGet("sessao")]
    [Authorize]
    public IActionResult Sessao() => this.Sucesso(new
    {
        UsuarioId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        Nome = User.FindFirstValue(ClaimTypes.Name),
        Matricula = User.FindFirstValue(ClaimsSeap.Matricula),
        Perfil = User.FindFirstValue(ClaimTypes.Role)
    });
}

[ApiController]
[Route("api/diarias")]
[Authorize]
public class DiariasController : ControllerBase
{
    private readonly DiariasService _svc;

    public DiariasController(DiariasService svc) => _svc = svc;

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] DiariaFiltro f) => this.Sucesso(await _svc.ListarAsync(f));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Obter(int id) => this.Sucesso(await _svc.ObterAsync(id));

    [HttpGet("{id:int}/historico")]
    public async Task<IActionResult> Historico(int id) => this.Sucesso(await _svc.HistoricoAsync(id));

    /// <summary>Pré-visualização: valores calculados, erros e conflitos de datas, sem gravar.</summary>
    [HttpPost("simular")]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Simular([FromBody] DiariaRequest req, [FromQuery] int? diariaId)
        => this.Sucesso(await _svc.SimularAsync(req, diariaId));

    [HttpPost]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Criar([FromBody] DiariaRequest req)
        => this.Sucesso(await _svc.CriarAsync(req), "Diária lançada com sucesso.");

    [HttpPut("{id:int}")]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Atualizar(int id, [FromBody] DiariaRequest req)
    {
        await _svc.AtualizarAsync(id, req);
        return this.Sucesso(id, "Diária atualizada com sucesso.");
    }

    [HttpPost("{id:int}/cancelar")]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Cancelar(int id, [FromBody] MotivoRequest req)
    {
        await _svc.CancelarAsync(id, req.Motivo);
        return this.Sucesso(id, "Diária cancelada.");
    }

    [HttpPost("{id:int}/aprovar")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> Aprovar(int id)
    {
        await _svc.AprovarAsync(id);
        return this.Sucesso(id, "Diária aprovada.");
    }

    [HttpPost("{id:int}/rejeitar")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> Rejeitar(int id, [FromBody] MotivoRequest req)
    {
        await _svc.RejeitarAsync(id, req.Motivo);
        return this.Sucesso(id, "Diária rejeitada.");
    }
}

[ApiController]
[Route("api/servidores")]
[Authorize]
public class ServidoresController : ControllerBase
{
    private readonly ServidoresService _svc;

    public ServidoresController(ServidoresService svc) => _svc = svc;

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] ServidorFiltro f) => this.Sucesso(await _svc.ListarAsync(f));

    [HttpGet("buscar")]
    public async Task<IActionResult> Buscar([FromQuery] string termo) => this.Sucesso(await _svc.BuscarAsync(termo ?? ""));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Obter(int id) => this.Sucesso(await _svc.ObterAsync(id));

    [HttpPost]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Criar([FromBody] ServidorRequest req)
        => this.Sucesso(await _svc.CriarAsync(req), "Servidor cadastrado com sucesso.");

    [HttpPut("{id:int}")]
    [Authorize(Policy = Politicas.Lancamento)]
    public async Task<IActionResult> Atualizar(int id, [FromBody] ServidorRequest req)
    {
        await _svc.AtualizarAsync(id, req);
        return this.Sucesso(id, "Servidor atualizado com sucesso.");
    }

    [HttpPost("sincronizar-policiais")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> Sincronizar()
    {
        var r = await _svc.SincronizarPoliciaisAsync();
        return this.Sucesso(r, $"Sincronização concluída: {r.Criados} criados, {r.Atualizados} atualizados, {r.Vinculados} vinculados.");
    }
}

[ApiController]
[Route("api/cadastros")]
[Authorize]
public class CadastrosController : ControllerBase
{
    private readonly CadastrosService _svc;

    public CadastrosController(CadastrosService svc) => _svc = svc;

    [HttpGet("cargos")]
    public async Task<IActionResult> Cargos([FromQuery] bool somenteAtivos = false) => this.Sucesso(await _svc.CargosAsync(somenteAtivos));

    [HttpPost("cargos")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> CriarCargo([FromBody] CargoRequest req) => this.Sucesso(await _svc.SalvarCargoAsync(null, req), "Cargo salvo.");

    [HttpPut("cargos/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> AtualizarCargo(int id, [FromBody] CargoRequest req) => this.Sucesso(await _svc.SalvarCargoAsync(id, req), "Cargo salvo.");

    [HttpGet("regioes")]
    public async Task<IActionResult> Regioes() => this.Sucesso(await _svc.RegioesAsync());

    [HttpPost("regioes")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> CriarRegiao([FromBody] RegiaoRequest req) => this.Sucesso(await _svc.SalvarRegiaoAsync(null, req), "Região salva.");

    [HttpPut("regioes/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> AtualizarRegiao(int id, [FromBody] RegiaoRequest req) => this.Sucesso(await _svc.SalvarRegiaoAsync(id, req), "Região salva.");

    [HttpDelete("regioes/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> ExcluirRegiao(int id)
    {
        await _svc.ExcluirRegiaoAsync(id);
        return this.Sucesso(true, "Região excluída.");
    }

    [HttpGet("tipos")]
    public async Task<IActionResult> Tipos([FromQuery] bool somenteAtivos = false) => this.Sucesso(await _svc.TiposAsync(somenteAtivos));

    [HttpPost("tipos")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> CriarTipo([FromBody] TipoDiariaRequest req) => this.Sucesso(await _svc.SalvarTipoAsync(null, req), "Tipo salvo.");

    [HttpPut("tipos/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> AtualizarTipo(int id, [FromBody] TipoDiariaRequest req) => this.Sucesso(await _svc.SalvarTipoAsync(id, req), "Tipo salvo.");

    [HttpGet("valores")]
    public async Task<IActionResult> Valores([FromQuery] int? tipoDiariaId, [FromQuery] bool somenteVigentes = false)
        => this.Sucesso(await _svc.ValoresAsync(tipoDiariaId, somenteVigentes));

    [HttpPost("valores")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> CriarValor([FromBody] ValorDiariaRequest req) => this.Sucesso(await _svc.SalvarValorAsync(null, req), "Valor salvo.");

    [HttpPut("valores/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> AtualizarValor(int id, [FromBody] ValorDiariaRequest req) => this.Sucesso(await _svc.SalvarValorAsync(id, req), "Valor salvo.");

    [HttpDelete("valores/{id:int}")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> ExcluirValor(int id)
    {
        await _svc.ExcluirValorAsync(id);
        return this.Sucesso(true, "Valor excluído.");
    }
}

[ApiController]
[Route("api/localidades")]
[Authorize]
public class LocalidadesController : ControllerBase
{
    private readonly LocalidadesService _svc;

    public LocalidadesController(LocalidadesService svc) => _svc = svc;

    [HttpGet("ufs")]
    public async Task<IActionResult> Ufs() => this.Sucesso(await _svc.UfsAsync());

    [HttpGet("unidades")]
    public async Task<IActionResult> Unidades() => this.Sucesso(await _svc.UnidadesAsync());

    [HttpGet("municipios")]
    public async Task<IActionResult> Municipios([FromQuery] string? busca, [FromQuery] int? ufId)
        => this.Sucesso(await _svc.MunicipiosAsync(busca, ufId));
}

[ApiController]
[Route("api/relatorios")]
[Authorize]
public class RelatoriosController : ControllerBase
{
    private readonly RelatoriosService _svc;

    public RelatoriosController(RelatoriosService svc) => _svc = svc;

    [HttpGet]
    public async Task<IActionResult> Consultar([FromQuery] RelatorioFiltro f) => this.Sucesso(await _svc.ConsultarAsync(f));

    [HttpGet("exportar")]
    public async Task<IActionResult> Exportar([FromQuery] RelatorioFiltro f)
        => File(await _svc.ExportarXlsxAsync(f), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"diarias_controladoria_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] int? ano) => this.Sucesso(await _svc.DashboardAsync(ano ?? DateTime.Today.Year));

    [HttpGet("auditoria")]
    [Authorize(Policy = Politicas.Gestao)]
    public async Task<IActionResult> Auditoria([FromQuery] AuditoriaFiltro f) => this.Sucesso(await _svc.AuditoriaAsync(f));
}

[ApiController]
[Route("api/usuarios")]
[Authorize(Policy = Politicas.Gestao)]
public class UsuariosController : ControllerBase
{
    private readonly UsuariosService _svc;

    public UsuariosController(UsuariosService svc) => _svc = svc;

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] string? busca, [FromQuery] bool somenteComAcesso = true,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        => this.Sucesso(await _svc.ListarAsync(busca, somenteComAcesso, page, pageSize));

    [HttpGet("configuracao")]
    public IActionResult Configuracao() => this.Sucesso(new { _svc.CriacaoPermitida });

    [HttpPut("{id:int}/perfil")]
    public async Task<IActionResult> DefinirPerfil(int id, [FromBody] DefinirPerfilRequest req)
    {
        int? atual = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var u) ? u : null;
        await _svc.DefinirPerfilAsync(id, req.Perfil, atual);
        return this.Sucesso(true, req.Perfil == null ? "Acesso revogado." : "Perfil atualizado.");
    }

    [HttpPost]
    public async Task<IActionResult> Criar([FromBody] CriarUsuarioRequest req)
        => this.Sucesso(await _svc.CriarAsync(req), "Usuário criado.");
}
