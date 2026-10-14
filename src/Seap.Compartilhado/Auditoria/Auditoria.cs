using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Seap.Compartilhado.Auditoria;

/// <summary>Marca entidades cujas inclusões, alterações e exclusões vão para comum.auditoria.</summary>
public interface IAuditavel { }

/// <summary>
/// Entidade que faz parte de um agregado (ex.: período de uma diária). O registro de auditoria
/// guarda também a raiz, para que o histórico do agregado inteiro seja consultado de uma vez.
/// </summary>
public interface IAuditavelFilho : IAuditavel
{
    string RaizEntidade { get; }
    int RaizId { get; }
}

public class RegistroAuditoria
{
    public long Id { get; set; }
    public string Modulo { get; set; } = null!;
    public string Entidade { get; set; } = null!;
    public string EntidadeId { get; set; } = null!;
    public string RaizEntidade { get; set; } = null!;
    public string RaizId { get; set; } = null!;
    /// <summary>INCLUSAO, ALTERACAO ou EXCLUSAO.</summary>
    public string Acao { get; set; } = null!;
    public int? UsuarioId { get; set; }
    public string? UsuarioNome { get; set; }
    public DateTime DataHora { get; set; }
    /// <summary>JSON { campo: { de, para } } com apenas os campos que mudaram (ou todos, na inclusão/exclusão).</summary>
    public string Alteracoes { get; set; } = null!;
}

/// <summary>Quem está executando a operação (preenchido a partir do JWT da requisição).</summary>
public interface IUsuarioAtual
{
    int? Id { get; }
    string? Nome { get; }
}

/// <summary>
/// Grava a trilha de auditoria de toda entidade <see cref="IAuditavel"/>. Os valores são capturados
/// antes do SaveChanges (quando o estado original ainda existe) e gravados depois dele, quando as
/// chaves geradas pelo banco já são conhecidas. Para que dado e auditoria sejam atômicos, o chamador
/// deve envolver a operação numa transação explícita (o segundo SaveChanges participa dela).
/// </summary>
public class AuditoriaInterceptor : SaveChangesInterceptor
{
    private readonly IUsuarioAtual _usuario;
    private readonly string _modulo;
    private List<(EntityEntry Entry, string Acao, string? Id, Dictionary<string, object?[]> Valores)>? _pendentes;

    public AuditoriaInterceptor(IUsuarioAtual usuario, string modulo)
    {
        _usuario = usuario;
        _modulo = modulo;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Capturar(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Capturar(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        if (eventData.Context != null && Registrar(eventData.Context))
            await eventData.Context.SaveChangesAsync(cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        if (eventData.Context != null && Registrar(eventData.Context))
            eventData.Context.SaveChanges();
        return base.SavedChanges(eventData, result);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        _pendentes = null;
        base.SaveChangesFailed(eventData);
    }

    private void Capturar(DbContext? context)
    {
        if (context == null) return;
        _pendentes = new();

        foreach (var entry in context.ChangeTracker.Entries<IAuditavel>())
        {
            var acao = entry.State switch
            {
                EntityState.Added => "INCLUSAO",
                EntityState.Modified => "ALTERACAO",
                EntityState.Deleted => "EXCLUSAO",
                _ => null
            };
            if (acao == null) continue;

            var valores = new Dictionary<string, object?[]>();
            foreach (var prop in entry.Properties)
            {
                var nome = prop.Metadata.Name;
                switch (entry.State)
                {
                    case EntityState.Added:
                        valores[nome] = new[] { null, prop.CurrentValue };
                        break;
                    case EntityState.Deleted:
                        valores[nome] = new[] { prop.OriginalValue, null };
                        break;
                    default:
                        if (prop.IsModified && !Equals(prop.OriginalValue, prop.CurrentValue))
                            valores[nome] = new[] { prop.OriginalValue, prop.CurrentValue };
                        break;
                }
            }

            if (acao == "ALTERACAO" && valores.Count == 0) continue;
            // Na exclusão a entrada fica desanexada após o save: a chave é lida agora.
            _pendentes.Add((entry, acao, acao == "INCLUSAO" ? null : Chave(entry), valores));
        }
    }

    private bool Registrar(DbContext context)
    {
        var pendentes = _pendentes;
        _pendentes = null;
        if (pendentes == null || pendentes.Count == 0) return false;

        var agora = DateTime.UtcNow;
        foreach (var (entry, acao, idCapturado, valores) in pendentes)
        {
            // Na inclusão a chave só existe agora; atualiza o "para" dos campos gerados pelo banco.
            if (acao == "INCLUSAO")
                foreach (var prop in entry.Properties)
                    valores[prop.Metadata.Name] = new[] { null, prop.CurrentValue };

            var id = idCapturado ?? Chave(entry);
            var entidade = entry.Metadata.GetTableName() ?? entry.Metadata.ClrType.Name;
            var filho = entry.Entity as IAuditavelFilho;

            context.Set<RegistroAuditoria>().Add(new RegistroAuditoria
            {
                Modulo = _modulo,
                Entidade = entidade,
                EntidadeId = id,
                RaizEntidade = filho?.RaizEntidade ?? entidade,
                RaizId = filho?.RaizId.ToString() ?? id,
                Acao = acao,
                UsuarioId = _usuario.Id,
                UsuarioNome = _usuario.Nome,
                DataHora = agora,
                Alteracoes = JsonSerializer.Serialize(
                    valores.ToDictionary(v => v.Key, v => new { de = v.Value[0], para = v.Value[1] }))
            });
        }
        return true;
    }

    private static string Chave(EntityEntry entry) => string.Join(",", entry.Metadata.FindPrimaryKey()!.Properties
        .Select(p => entry.Property(p.Name).CurrentValue?.ToString()));
}
