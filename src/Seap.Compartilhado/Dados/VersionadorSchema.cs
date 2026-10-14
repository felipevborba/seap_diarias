using System.Reflection;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Seap.Compartilhado.Dados;

/// <summary>
/// Aplica scripts SQL versionados (recursos embutidos "Sql/NNN_descricao.sql") e registra cada um em
/// comum.schema_versao. Não usa EF Migrations de propósito: o banco é compartilhado com o CarteiraPenal
/// (DB-first, sem __EFMigrationsHistory) e nenhum módulo pode gerar DDL sobre as tabelas de outro.
///
/// Regras: script aplicado nunca é editado (crie um novo número); cada script roda em transação própria;
/// um advisory lock impede que duas aplicações (ex.: Diárias e PJES subindo juntas) migrem ao mesmo tempo.
/// </summary>
public class VersionadorSchema
{
    private const long ChaveLock = 7_310_2026; // arbitrária, fixa para todos os módulos
    private readonly string _connectionString;
    private readonly ILogger _logger;

    public VersionadorSchema(string connectionString, ILogger logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    /// <param name="modulo">Identificador gravado no histórico (COMUM, DIARIAS...).</param>
    /// <param name="assembly">Assembly com os scripts embutidos na pasta Sql.</param>
    public async Task AplicarAsync(string modulo, Assembly assembly, CancellationToken ct = default)
    {
        var scripts = assembly.GetManifestResourceNames()
            .Where(n => n.Contains(".Sql.") && n.EndsWith(".sql"))
            .Select(n => (Recurso: n, Nome: n[(n.IndexOf(".Sql.") + 5)..]))
            .OrderBy(s => s.Nome, StringComparer.Ordinal)
            .ToList();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await Executar(conn, null, $"SELECT pg_advisory_lock({ChaveLock})", ct);
        try
        {
            await Executar(conn, null, """
                CREATE SCHEMA IF NOT EXISTS comum;
                CREATE TABLE IF NOT EXISTS comum.schema_versao (
                    modulo      VARCHAR(30)  NOT NULL,
                    script      VARCHAR(200) NOT NULL,
                    aplicado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
                    CONSTRAINT schema_versao_pkey PRIMARY KEY (modulo, script)
                );
                """, ct);

            var aplicados = new HashSet<string>();
            await using (var cmd = new NpgsqlCommand("SELECT script FROM comum.schema_versao WHERE modulo = @m", conn))
            {
                cmd.Parameters.AddWithValue("m", modulo);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct)) aplicados.Add(r.GetString(0));
            }

            foreach (var (recurso, nome) in scripts.Where(s => !aplicados.Contains(s.Nome)))
            {
                string sql;
                await using (var stream = assembly.GetManifestResourceStream(recurso)!)
                using (var reader = new StreamReader(stream))
                    sql = await reader.ReadToEndAsync(ct);

                await using var tx = await conn.BeginTransactionAsync(ct);
                await Executar(conn, tx, sql, ct);
                await using (var reg = new NpgsqlCommand(
                    "INSERT INTO comum.schema_versao (modulo, script) VALUES (@m, @s)", conn, tx))
                {
                    reg.Parameters.AddWithValue("m", modulo);
                    reg.Parameters.AddWithValue("s", nome);
                    await reg.ExecuteNonQueryAsync(ct);
                }
                await tx.CommitAsync(ct);
                _logger.LogInformation("Schema {Modulo}: script {Script} aplicado.", modulo, nome);
            }
        }
        finally
        {
            await Executar(conn, null, $"SELECT pg_advisory_unlock({ChaveLock})", ct);
        }
    }

    private static async Task Executar(NpgsqlConnection conn, NpgsqlTransaction? tx, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn, tx);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
