using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Modelos;

namespace Seap.Compartilhado.Seguranca;

/// <summary>
/// Cifra de substituição herdada do sistema Delphi, usada em public.usuario.senha.
/// É reversível (não é hash), mas precisa ser mantida enquanto o CarteiraPenal ler a mesma coluna.
/// Cópia fiel de ControleCarteiraPenal.Services.DelphiCipherService.
/// </summary>
public static partial class CifraDelphi
{
    private const string KeyCript = "EFGHABCDIJLMUVXNOPQRSTZYWK4591278360fghijlabcdemnopqxzywkrstuv";
    private const string KeyDecript = "vuts0638rkwTSRQPonmWYhgf7254KZONXV19UMyzxqpLJIDCBedcbaljiAHGFE";

    public static string Criptografar(string input) => Trocar(input, KeyCript, KeyDecript);

    public static string Decriptografar(string input) => Trocar(input, KeyDecript, KeyCript);

    private static string Trocar(string input, string origem, string destino)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var sb = new StringBuilder();
        foreach (var c in input.Trim())
        {
            var pos = origem.IndexOf(c);
            if (pos >= 0) { sb.Append(destino[pos]); continue; }
            pos = destino.IndexOf(c);
            sb.Append(pos >= 0 ? origem[pos] : c);
        }
        return sb.ToString();
    }

    public static string SomenteDigitos(string? valor)
        => string.IsNullOrWhiteSpace(valor) ? string.Empty : NaoDigito().Replace(valor, "");

    [GeneratedRegex(@"\D")]
    private static partial Regex NaoDigito();
}

public static class Cpf
{
    public static bool Valido(string? cpf)
    {
        var d = CifraDelphi.SomenteDigitos(cpf);
        if (d.Length != 11 || d.Distinct().Count() == 1) return false;
        for (var t = 9; t < 11; t++)
        {
            var soma = 0;
            for (var i = 0; i < t; i++) soma += (d[i] - '0') * (t + 1 - i);
            var dv = soma * 10 % 11 % 10;
            if (d[t] - '0' != dv) return false;
        }
        return true;
    }
}

public class JwtOptions
{
    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public int ExpiracaoHoras { get; set; } = 8;

    public void Validar()
    {
        if (Encoding.UTF8.GetByteCount(Secret) < 32)
            throw new InvalidOperationException(
                "JwtSettings:Secret ausente ou com menos de 32 bytes. Configure-o por variável de ambiente (JwtSettings__Secret).");
    }

    public SymmetricSecurityKey Chave() => new(Encoding.UTF8.GetBytes(Secret));
}

public static class ClaimsSeap
{
    public const string Matricula = "Matricula";
    public const string Cpf = "Cpf";
    public const string Modulo = "Modulo";
}

public class TokenService
{
    private readonly JwtOptions _opt;

    public TokenService(IOptions<JwtOptions> opt) => _opt = opt.Value;

    public (string Token, DateTime Expira) Gerar(Usuario usuario, string modulo, string perfil)
    {
        var expira = DateTime.UtcNow.AddHours(_opt.ExpiracaoHoras);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, usuario.Id.ToString()),
            new(ClaimTypes.Name, usuario.Nome ?? ""),
            new(ClaimsSeap.Matricula, usuario.Matricula ?? ""),
            new(ClaimsSeap.Cpf, usuario.Documento ?? ""),
            new(ClaimsSeap.Modulo, modulo),
            new(ClaimTypes.Role, perfil)
        };
        var token = new JwtSecurityToken(_opt.Issuer, _opt.Audience, claims, expires: expira,
            signingCredentials: new SigningCredentials(_opt.Chave(), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expira);
    }
}

public class UsuarioAtualHttp : IUsuarioAtual
{
    private readonly IHttpContextAccessor _http;

    public UsuarioAtualHttp(IHttpContextAccessor http) => _http = http;

    public int? Id => int.TryParse(_http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    public string? Nome => _http.HttpContext?.User.FindFirstValue(ClaimTypes.Name);
}
