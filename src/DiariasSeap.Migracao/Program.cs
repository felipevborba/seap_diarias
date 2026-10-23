using DiariasSeap.Api.Dados;
using DiariasSeap.Migracao;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Dados;

// Migração do legado SISDIARIA -> Diárias SEAP.
//
//   ConnectionStrings__DefaultConnection="Host=...;Database=carteira;Username=...;Password=..." \
//   dotnet run --project src/DiariasSeap.Migracao -- --dados ../legado/sisdiaria/dados [--relatorios dir] [--confirmar]
//   --complementar: só atualiza as matrículas novas dos servidores e grava as passagens aéreas do legado nas diárias já
//   migradas (não apaga nem renumera).
//   Opções: --aplicar-schema (só banco local; em produção o deploy da API aplica), --forcar (reexecuta mesmo com
//   diárias migradas já alteradas no sistema novo — apaga esse trabalho).
//
// Sem --confirmar é um ENSAIO: executa tudo (inclusive a conferência de totais e as constraints) e desfaz.

string? Arg(string nome) => args.SkipWhile(a => a != nome).Skip(1).FirstOrDefault();

var conexao = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
// VPN instável: keepalive TCP faz a queda de rede falhar em segundos, em vez de travar a transação por minutos.
if (!string.IsNullOrWhiteSpace(conexao))
    conexao = new Npgsql.NpgsqlConnectionStringBuilder(conexao) { KeepAlive = 15, TcpKeepAlive = true, Timeout = 30 }.ConnectionString;
var dados = Arg("--dados");
var confirmar = args.Contains("--confirmar");
var relatorios = Arg("--relatorios") ?? Path.Combine(Directory.GetCurrentDirectory(), $"relatorio_migracao_{DateTime.Now:yyyyMMdd_HHmmss}");

if (string.IsNullOrWhiteSpace(conexao) || dados == null || !Directory.Exists(dados))
{
    Console.Error.WriteLine("Uso: ConnectionStrings__DefaultConnection=... dotnet run -- --dados <pasta JSONL> [--relatorios <pasta>] [--confirmar]");
    return 2;
}

System.Globalization.CultureInfo.DefaultThreadCurrentCulture = new System.Globalization.CultureInfo("pt-BR");
System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("pt-BR");
void Log(string m) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {m}");
var inicio = DateTime.Now;
var csb = new Npgsql.NpgsqlConnectionStringBuilder(conexao);
Log($"Destino: {csb.Username}@{csb.Host}/{csb.Database} | modo: {(confirmar ? "CONFIRMAR (grava)" : "ENSAIO (desfaz no final)")}");

// Schema: em produção quem aplica é o deploy da API (a versão no ar precisa ser compatível com ele).
// Por isso o migrador só VERIFICA; aplicar aqui exige --aplicar-schema (uso em bancos locais/ensaio).
if (args.Contains("--aplicar-schema"))
{
    var versionador = new VersionadorSchema(conexao, NullLogger.Instance);
    await versionador.AplicarAsync("COMUM", typeof(VersionadorSchema).Assembly);
    await versionador.AplicarAsync(DiariasContext.Modulo, typeof(DiariasContext).Assembly);
}
else
{
    await using var c = new Npgsql.NpgsqlConnection(conexao);
    await c.OpenAsync();
    await using var cmd = new Npgsql.NpgsqlCommand(
        "SELECT count(*) FROM comum.schema_versao WHERE modulo = 'DIARIAS' AND script = '005_ajustes_seap_passagens.sql'", c);
    long aplicado;
    try { aplicado = (long)(await cmd.ExecuteScalarAsync())!; } catch { aplicado = 0; }
    if (aplicado == 0)
    {
        Log("ERRO — o banco ainda não tem o schema desta versão (005_ajustes_seap_passagens.sql). " +
            "Faça o deploy da API v2 antes de migrar (ou use --aplicar-schema em banco local).");
        return 3;
    }
}

var options = new DbContextOptionsBuilder<DiariasContext>()
    .UseNpgsql(conexao, o => o.CommandTimeout(600))
    .AddInterceptors(new AuditoriaInterceptor(new UsuarioMigracao(), DiariasContext.Modulo))
    .Options;
await using var db = new DiariasContext(options);

try
{
    var migrador = new Migrador(db, dados, relatorios, Log, args.Contains("--forcar"));
    var n = args.Contains("--complementar") ? await migrador.ComplementarAsync(confirmar) : await migrador.ExecutarAsync(confirmar);
    Log($"Fim: {n:N0} diárias em {(DateTime.Now - inicio).TotalSeconds:N0}s.");
    return 0;
}
catch (Exception e)
{
    Log("ERRO — nada foi gravado: " + e.GetBaseException().Message);
    return 1;
}

/// <summary>Autor dos registros de auditoria gerados pela migração.</summary>
internal sealed class UsuarioMigracao : IUsuarioAtual
{
    public int? Id => null;
    public string? Nome => "Migração do legado";
}
