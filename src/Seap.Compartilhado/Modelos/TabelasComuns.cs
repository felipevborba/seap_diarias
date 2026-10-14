using Seap.Compartilhado.Auditoria;

namespace Seap.Compartilhado.Modelos;

// Tabelas do schema "comum": novas, compartilhadas por todos os módulos (Diárias, PJES...).

/// <summary>Forma de vínculo do servidor com o Estado. Determina, junto com o cargo, o valor da diária.</summary>
public enum Vinculo : short
{
    Efetivo = 1,
    Contratado = 2,
    Comissionado = 3,
    Cedido = 4,
    Outro = 9
}

public class Cargo : IAuditavel
{
    public int Id { get; set; }
    public string Nome { get; set; } = null!;
    public bool Ativo { get; set; } = true;
}

/// <summary>
/// Qualquer servidor com vínculo com o Estado (efetivo, contratado, comissionado, cedido...).
/// Quando é policial penal, aponta para public.policia_penal, que continua sendo a fonte de verdade
/// de nome/CPF/matrícula/lotação desses servidores (ver ServidoresService.SincronizarPoliciaisAsync).
/// </summary>
public class Servidor : IAuditavel
{
    public int Id { get; set; }
    public string Nome { get; set; } = null!;
    /// <summary>Obrigatório para cadastros do sistema; nulo apenas em servidores migrados de legado sem CPF.</summary>
    public string? Cpf { get; set; }
    public string? Matricula { get; set; }
    public Vinculo Vinculo { get; set; }
    public int? CargoId { get; set; }
    public int? UnidadeId { get; set; }
    public int? PoliciaPenalId { get; set; }
    public string? Email { get; set; }
    public string? Celular { get; set; }
    public string? Banco { get; set; }
    public string? Agencia { get; set; }
    public string? Conta { get; set; }
    public bool Ativo { get; set; } = true;
    /// <summary>SISTEMA ou LEGADO (ver <see cref="Origens"/>).</summary>
    public string Origem { get; set; } = Origens.Sistema;
    public DateTime CriadoEm { get; set; }
    public DateTime AtualizadoEm { get; set; }

    public Cargo? Cargo { get; set; }
    public Unidade? Unidade { get; set; }
    public PoliciaPenal? PoliciaPenal { get; set; }
}

public static class Origens
{
    public const string Sistema = "SISTEMA";
    /// <summary>Registro importado de sistema legado.</summary>
    public const string Legado = "LEGADO";
}

/// <summary>Agrupamento de municípios para relatórios (ex.: Região Metropolitana, Sertão 1).</summary>
public class Regiao : IAuditavel
{
    public int Id { get; set; }
    public string Nome { get; set; } = null!;
    public List<RegiaoMunicipio> Municipios { get; set; } = new();
}

public class RegiaoMunicipio
{
    public int RegiaoId { get; set; }
    public int MunicipioId { get; set; }
    public Regiao Regiao { get; set; } = null!;
    public Tabnaturalidade Municipio { get; set; } = null!;
}

/// <summary>Perfil de acesso de um usuário (public.usuario) em um módulo. Um registro por usuário/módulo.</summary>
public class UsuarioPerfil : IAuditavel
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public string Modulo { get; set; } = null!;
    public string Perfil { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
}

public static class Perfis
{
    /// <summary>Gerencia tudo do módulo, inclusive usuários, tabelas de valores e cadastros.</summary>
    public const string Administrador = "ADMIN";
    /// <summary>Lança e edita registros e consulta relatórios.</summary>
    public const string Operador = "OPERADOR";
    /// <summary>Apenas consulta e exporta.</summary>
    public const string Consulta = "CONSULTA";

    public static readonly string[] Todos = { Administrador, Operador, Consulta };
}
