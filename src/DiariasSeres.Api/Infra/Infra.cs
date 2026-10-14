using DiariasSeres.Api.Dados;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Npgsql;
using Seap.Compartilhado.Modelos;
using Seap.Compartilhado.Respostas;

namespace DiariasSeres.Api.Infra;

/// <summary>Políticas de autorização por perfil do módulo (claim Role do JWT).</summary>
public static class Politicas
{
    /// <summary>Somente ADMIN: usuários, tabela de valores, cadastros de apoio, auditoria geral.</summary>
    public const string Gestao = "Gestao";
    /// <summary>ADMIN ou OPERADOR: lançar, editar e cancelar diárias; manter servidores.</summary>
    public const string Lancamento = "Lancamento";

    public static void Registrar(Microsoft.AspNetCore.Authorization.AuthorizationOptions o)
    {
        o.AddPolicy(Gestao, p => p.RequireAuthenticatedUser().RequireRole(Perfis.Administrador));
        o.AddPolicy(Lancamento, p => p.RequireAuthenticatedUser().RequireRole(Perfis.Administrador, Perfis.Operador));
    }
}

/// <summary>
/// Converte exceções em respostas ApiResponse padronizadas, para que os serviços possam simplesmente
/// lançar RegraNegocioException/NaoEncontradoException em vez de montar respostas de erro.
/// </summary>
public class TratamentoErrosFilter : IExceptionFilter
{
    private readonly ILogger<TratamentoErrosFilter> _logger;

    public TratamentoErrosFilter(ILogger<TratamentoErrosFilter> logger) => _logger = logger;

    public void OnException(ExceptionContext context)
    {
        var (status, mensagem) = context.Exception switch
        {
            RegraNegocioException e => (400, e.Message),
            NaoEncontradoException e => (404, e.Message),
            DiariasSeres.Api.Servicos.AcessoNegadoException e => (401, e.Message),
            Microsoft.EntityFrameworkCore.DbUpdateException { InnerException: PostgresException pg } => Traduzir(pg),
            PostgresException pg => Traduzir(pg),
            _ => (500, "Erro inesperado ao processar a solicitação.")
        };

        if (status == 500)
            _logger.LogError(context.Exception, "Erro não tratado em {Path}", context.HttpContext.Request.Path);

        context.Result = new ObjectResult(ApiResponse<object>.ErrorResponse(mensagem)) { StatusCode = status };
        context.ExceptionHandled = true;
    }

    private static (int, string) Traduzir(PostgresException pg) => pg.SqlState switch
    {
        // Rede de segurança: o serviço valida antes, mas a constraint do banco é quem garante.
        PostgresErrorCodes.ExclusionViolation when pg.ConstraintName == "diaria_periodo_sem_sobreposicao"
            => (409, "O servidor já possui diária lançada em uma das datas informadas."),
        PostgresErrorCodes.ExclusionViolation when pg.ConstraintName == "valor_diaria_vigencia_excl"
            => (409, "Já existe valor cadastrado para essa combinação de tipo, vínculo e cargo com vigência sobreposta."),
        PostgresErrorCodes.UniqueViolation => (409, "Já existe um registro com esses dados."),
        PostgresErrorCodes.ForeignKeyViolation => (409, "O registro está em uso por outros cadastros e não pode ser removido."),
        _ => (500, "Erro inesperado ao gravar no banco de dados.")
    };
}

public static class ControllerExtensions
{
    public static OkObjectResult Sucesso<T>(this ControllerBase c, T data, string mensagem = "Operação realizada com sucesso.")
        => c.Ok(ApiResponse<T>.SuccessResponse(data, mensagem));
}

/// <summary>Aplica os scripts dos schemas comum e diarias no start (idempotente, com lock entre aplicações).</summary>
public static class InicializacaoBanco
{
    public static async Task AplicarSchemasAsync(this WebApplication app)
    {
        var cs = app.Configuration.GetConnectionString("DefaultConnection")!;
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Schema");
        var versionador = new Seap.Compartilhado.Dados.VersionadorSchema(cs, logger);
        await versionador.AplicarAsync("COMUM", typeof(Seap.Compartilhado.Dados.VersionadorSchema).Assembly);
        await versionador.AplicarAsync(DiariasContext.Modulo, typeof(DiariasContext).Assembly);
    }
}
