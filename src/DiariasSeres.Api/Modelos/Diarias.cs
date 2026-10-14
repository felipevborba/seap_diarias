using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Modelos;

namespace DiariasSeres.Api.Modelos;

/// <summary>Tipo de diária (Integral, Parcial, Operação...).</summary>
public class TipoDiaria : IAuditavel
{
    public int Id { get; set; }
    public string Nome { get; set; } = null!;
    public string? Descricao { get; set; }
    public bool Ativo { get; set; } = true;
}

/// <summary>
/// Linha da tabela de valores. Vínculo e cargo nulos significam "qualquer". Na hora do lançamento vale a
/// linha vigente mais específica (cargo+vínculo &gt; cargo &gt; vínculo &gt; genérica); ver TabelaValores.
/// </summary>
public class ValorDiaria : IAuditavel
{
    public int Id { get; set; }
    public int TipoDiariaId { get; set; }
    public Vinculo? Vinculo { get; set; }
    public int? CargoId { get; set; }
    public decimal Valor { get; set; }
    public DateOnly VigenciaInicio { get; set; }
    public DateOnly? VigenciaFim { get; set; }

    public TipoDiaria TipoDiaria { get; set; } = null!;
    public Cargo? Cargo { get; set; }
}

/// <summary>
/// Ciclo de vida: PENDENTE (lançada) -&gt; APROVADA ou REJEITADA. PENDENTE/APROVADA podem ser canceladas.
/// Editar uma diária aprovada ou rejeitada a devolve para PENDENTE.
/// </summary>
public static class SituacaoDiaria
{
    public const string Pendente = "PENDENTE";
    public const string Aprovada = "APROVADA";
    public const string Rejeitada = "REJEITADA";
    public const string Cancelada = "CANCELADA";

    /// <summary>Situações em que a diária ocupa as datas do servidor e entra nos relatórios por padrão.</summary>
    public static readonly string[] Vigentes = { Pendente, Aprovada };

    public static bool OcupaDatas(string situacao) => situacao is Pendente or Aprovada;
}

/// <summary>
/// Lançamento de diárias de um servidor. Pode ter vários períodos intercalados (ex.: 5–7 e 10–15),
/// cada um com seu destino e itens (ex.: 2 integrais + 1 parcial). Vínculo, cargo e lotação são
/// fotografados no lançamento para que relatórios antigos não mudem quando o cadastro mudar.
/// </summary>
public class Diaria : IAuditavel
{
    public int Id { get; set; }
    public int ServidorId { get; set; }
    public Vinculo Vinculo { get; set; }
    public int? CargoId { get; set; }
    public int? UnidadeId { get; set; }
    public string Objetivo { get; set; } = null!;
    public string? ProcessoSei { get; set; }
    public string? Observacao { get; set; }
    public string Situacao { get; set; } = SituacaoDiaria.Pendente;
    public string? MotivoCancelamento { get; set; }
    public int? DecididoPorId { get; set; }
    public string? DecididoPorNome { get; set; }
    public DateTime? DecididoEm { get; set; }
    public string? MotivoRejeicao { get; set; }
    public decimal ValorTotal { get; set; }
    public string Origem { get; set; } = Origens.Sistema;
    /// <summary>Código no legado (diaria.codigo do MySQL "diarias?seres").</summary>
    public int? LegadoCodigo { get; set; }
    public int? CriadoPorId { get; set; }
    public string? CriadoPorNome { get; set; }
    public DateTime CriadoEm { get; set; }
    public DateTime AtualizadoEm { get; set; }

    public Servidor Servidor { get; set; } = null!;
    public Cargo? Cargo { get; set; }
    public Unidade? Unidade { get; set; }
    public List<DiariaPeriodo> Periodos { get; set; } = new();
}

public class DiariaPeriodo : IAuditavelFilho
{
    public int Id { get; set; }
    public int DiariaId { get; set; }
    /// <summary>Redundante com a diária: existe para a constraint de exclusão que impede datas sobrepostas.</summary>
    public int ServidorId { get; set; }
    public DateOnly DataInicio { get; set; }
    public DateOnly DataFim { get; set; }
    /// <summary>Obrigatório em lançamentos do sistema; pode ser nulo em períodos migrados sem município identificado.</summary>
    public int? DestinoMunicipioId { get; set; }
    /// <summary>Destino como digitado no legado (preservado mesmo quando o município foi identificado).</summary>
    public string? DestinoTexto { get; set; }
    public decimal ValorTotal { get; set; }
    /// <summary>Falso quando a diária é cancelada ou rejeitada: libera as datas para novo lançamento.</summary>
    public bool Ativo { get; set; } = true;
    /// <summary>Período legado com sobreposição já existente no sistema antigo; deixa de ser isento ao mudar as datas.</summary>
    public bool IsentoSobreposicao { get; set; }

    public Diaria Diaria { get; set; } = null!;
    public Tabnaturalidade? DestinoMunicipio { get; set; }
    public List<DiariaItem> Itens { get; set; } = new();

    string IAuditavelFilho.RaizEntidade => "diaria";
    int IAuditavelFilho.RaizId => DiariaId;
}

/// <summary>Quantidade de um tipo de diária dentro de um período (ex.: 2 Integrais + 1 Parcial).</summary>
public class DiariaItem : IAuditavelFilho
{
    public int Id { get; set; }
    public int PeriodoId { get; set; }
    public int TipoDiariaId { get; set; }
    public decimal Quantidade { get; set; }
    public decimal ValorUnitario { get; set; }
    public decimal ValorTotal { get; set; }

    public DiariaPeriodo Periodo { get; set; } = null!;
    public TipoDiaria TipoDiaria { get; set; } = null!;

    string IAuditavelFilho.RaizEntidade => "diaria";
    int IAuditavelFilho.RaizId => Periodo?.DiariaId ?? 0;
}
