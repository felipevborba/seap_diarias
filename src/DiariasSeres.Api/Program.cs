using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using DiariasSeres.Api.Dados;
using DiariasSeres.Api.Infra;
using DiariasSeres.Api.Servicos;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Seguranca;

var builder = WebApplication.CreateBuilder(args);

// ---- Configuração obrigatória (sem valores padrão embutidos no código) ----
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection não configurada.");
var jwt = builder.Configuration.GetSection("JwtSettings").Get<JwtOptions>() ?? new JwtOptions();
jwt.Validar();
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("JwtSettings"));

// ---- Dados + auditoria transversal ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUsuarioAtual, UsuarioAtualHttp>();
builder.Services.AddScoped(sp => new AuditoriaInterceptor(sp.GetRequiredService<IUsuarioAtual>(), DiariasContext.Modulo));
builder.Services.AddDbContext<DiariasContext>((sp, o) => o
    .UseNpgsql(connectionString)
    .AddInterceptors(sp.GetRequiredService<AuditoriaInterceptor>()));

// ---- Serviços ----
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UsuariosService>();
builder.Services.AddScoped<ServidoresService>();
builder.Services.AddScoped<CadastrosService>();
builder.Services.AddScoped<LocalidadesService>();
builder.Services.AddScoped<TabelaValores>();
builder.Services.AddScoped<DiariasService>();
builder.Services.AddScoped<RelatoriosService>();

builder.Services.AddControllers(o => o.Filters.Add<TratamentoErrosFilter>())
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- Autenticação: Issuer/Audience próprios, tokens do CarteiraPenal não valem aqui ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = jwt.Chave(),
        ClockSkew = TimeSpan.FromMinutes(1)
    });
builder.Services.AddAuthorization(Politicas.Registrar);

// O login fica exposto na internet (diarias.seap.pe.gov.br): limita tentativas por IP.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();

// Atrás de gateway/nginx: confia em X-Forwarded-* apenas do loopback e dos IPs listados em
// Proxy:IpsConfiaveis (o gateway que publica a 4444). Confiar em qualquer origem permitiria
// forjar o IP e contornar o limite de tentativas de login.
var forwarded = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
foreach (var ip in app.Configuration.GetSection("Proxy:IpsConfiaveis").Get<string[]>() ?? [])
    forwarded.KnownProxies.Add(System.Net.IPAddress.Parse(ip));
app.UseForwardedHeaders(forwarded);

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/saude", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapFallbackToFile("index.html");

await app.AplicarSchemasAsync();
app.Run();
