// PJES SEAP — fase 0: serviço de verificação da publicação.
// Confirma que pjes.seap.pe.gov.br chega ao servidor na porta 4445 (gateway da SEAP -> Kestrel) antes de
// começarmos os módulos. Não acessa o banco; as estruturas do PJES (schema "pjes") virão nas próximas etapas,
// reaproveitando Seap.Compartilhado como as Diárias.
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var versao = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
var iniciadoEm = DateTimeOffset.UtcNow;

// O que o gateway entregou: host pedido e esquema original (https no link oficial).
RequisicaoRecebida Requisicao(HttpRequest r) => new(
    r.Headers["X-Forwarded-Host"].FirstOrDefault() ?? r.Host.Value ?? "",
    r.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? r.Scheme,
    r.Headers.ContainsKey("X-Forwarded-For"));

app.MapGet("/api/saude", (HttpRequest r) => Results.Ok(new
{
    status = "ok",
    sistema = "PJES SEAP",
    fase = "verificação de publicação",
    versao,
    iniciadoEm,
    requisicao = Requisicao(r),
}));

app.MapGet("/", (HttpRequest r) =>
{
    var req = Requisicao(r);
    var html = $$"""
        <!doctype html>
        <html lang="pt-BR">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>PJES SEAP</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 0; background: #f6f7fb; color: #1b1f2a; }
          main { max-width: 640px; margin: 12vh auto; padding: 32px; background: #fff; border-radius: 12px;
                 box-shadow: 0 1px 3px rgba(0,0,0,.12); }
          h1 { margin: 0 0 4px; color: #001b44; } p { line-height: 1.5; }
          code { background: #eef1f7; padding: 2px 6px; border-radius: 4px; }
          .ok { color: #1a7f37; font-weight: 600; }
        </style></head>
        <body><main>
          <h1>PJES · Central de Custódia</h1>
          <p>Secretaria de Administração Penitenciária de Pernambuco</p>
          <p class="ok">Publicação verificada: o endereço oficial está chegando ao servidor do PJES.</p>
          <p>Sistema em construção. Host recebido: <code>{{req.Host}}</code> · protocolo: <code>{{req.Esquema}}</code> · versão <code>{{versao}}</code></p>
        </main></body></html>
        """;
    return Results.Content(html, "text/html; charset=utf-8");
});

app.Run();

record RequisicaoRecebida(string Host, string Esquema, bool ViaGateway);
