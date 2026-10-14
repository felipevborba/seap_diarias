namespace Seap.Compartilhado.Modelos;

// Tabelas do schema "public", criadas e mantidas pelo CarteiraPenal (scripts/install.sql daquele projeto).
// Os módulos irmãos apenas as mapeiam: não alteram estrutura, não fazem seed e não sincronizam IBGE.

/// <summary>Operador do sistema. Login por CPF (documento) + senha na cifra Delphi. Principal = 'S' => administrador.</summary>
public class Usuario
{
    public int Id { get; set; }
    public char? Principal { get; set; }
    public string Nome { get; set; } = null!;
    public string? Matricula { get; set; }
    public string? Documento { get; set; }
    public string? ChaveCriptografia { get; set; }
    public string? Senha { get; set; }
    public DateTime? DataChave { get; set; }

    public bool EhAdministradorGeral => Principal == 'S';
}

/// <summary>Unidade prisional / de lotação.</summary>
public class Unidade
{
    public int Id { get; set; }
    public string? Sigla { get; set; }
    public string Nome { get; set; } = null!;
}

public class Tabuf
{
    public int Id { get; set; }
    public string Sigla { get; set; } = null!;
    public string Nome { get; set; } = null!;
}

/// <summary>Município (populado pelo CarteiraPenal a partir do IBGE).</summary>
public class Tabnaturalidade
{
    public int Id { get; set; }
    public int UfId { get; set; }
    public string Nome { get; set; } = null!;
    public Tabuf Uf { get; set; } = null!;
}

/// <summary>
/// Cadastro central do policial penal. Mapeado SEM as colunas BYTEA (foto, assinatura, digitais):
/// carregá-las em listagens custa ~1 MB por pessoa e nenhum módulo além da carteira precisa delas.
/// </summary>
public class PoliciaPenal
{
    public int Id { get; set; }
    public string Nome { get; set; } = null!;
    public string? NomeSocial { get; set; }
    public string? Cpf { get; set; }
    public string? Matricula { get; set; }
    public int? StatusTrabalho { get; set; }
    public int? UnidadeId { get; set; }
    public string? Email { get; set; }
    public string? Celular { get; set; }
    public Unidade? Unidade { get; set; }
}

/// <summary>Códigos legados de policia_penal.status_trabalho (ordem fixa, não reordenar).</summary>
public static class StatusTrabalho
{
    public const int Ativo = 2;

    public static readonly IReadOnlyDictionary<int, string> Descricoes = new Dictionary<int, string>
    {
        [0] = "Aposentado", [1] = "Preso", [2] = "Ativo", [3] = "Licença Sem Vencimento", [4] = "Vaga",
        [5] = "Exonerado", [6] = "Demitido", [7] = "Falecido", [8] = "Invalidez", [9] = "Licença Médica"
    };
}
