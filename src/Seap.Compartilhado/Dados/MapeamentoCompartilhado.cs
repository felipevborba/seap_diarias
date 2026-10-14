using System.Text;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Modelos;

namespace Seap.Compartilhado.Dados;

public static class Schemas
{
    /// <summary>Tabelas legadas do CarteiraPenal (somente mapeadas).</summary>
    public const string Publico = "public";
    /// <summary>Tabelas novas compartilhadas entre módulos.</summary>
    public const string Comum = "comum";
}

public static class MapeamentoCompartilhado
{
    /// <summary>
    /// Mapeia as tabelas compartilhadas (public + comum) no contexto de qualquer módulo.
    /// Chamar no início do OnModelCreating e, ao final, <see cref="AplicarSnakeCase"/>.
    /// </summary>
    public static ModelBuilder MapearTabelasCompartilhadas(this ModelBuilder mb)
    {
        // ---- public (legado CarteiraPenal) ----
        mb.Entity<Usuario>(e =>
        {
            e.ToTable("usuario", Schemas.Publico);
            e.Property(x => x.Principal).HasMaxLength(1);
            e.Ignore(x => x.EhAdministradorGeral);
        });
        mb.Entity<Unidade>().ToTable("unidade", Schemas.Publico);
        mb.Entity<Tabuf>().ToTable("tabuf", Schemas.Publico);
        mb.Entity<Tabnaturalidade>(e =>
        {
            e.ToTable("tabnaturalidade", Schemas.Publico);
            e.HasOne(x => x.Uf).WithMany().HasForeignKey(x => x.UfId);
        });
        mb.Entity<PoliciaPenal>(e =>
        {
            e.ToTable("policia_penal", Schemas.Publico);
            e.HasOne(x => x.Unidade).WithMany().HasForeignKey(x => x.UnidadeId);
        });

        // ---- comum ----
        mb.Entity<Cargo>(e =>
        {
            e.ToTable("cargo", Schemas.Comum);
            e.HasIndex(x => x.Nome).IsUnique();
        });
        mb.Entity<Servidor>(e =>
        {
            e.ToTable("servidor", Schemas.Comum);
            e.HasIndex(x => x.Cpf).IsUnique();
            e.Property(x => x.Vinculo).HasConversion<short>();
            e.HasOne(x => x.Cargo).WithMany().HasForeignKey(x => x.CargoId);
            e.HasOne(x => x.Unidade).WithMany().HasForeignKey(x => x.UnidadeId);
            e.HasOne(x => x.PoliciaPenal).WithMany().HasForeignKey(x => x.PoliciaPenalId);
        });
        mb.Entity<Regiao>(e =>
        {
            e.ToTable("regiao", Schemas.Comum);
            e.HasIndex(x => x.Nome).IsUnique();
        });
        mb.Entity<RegiaoMunicipio>(e =>
        {
            e.ToTable("regiao_municipio", Schemas.Comum);
            e.HasKey(x => new { x.RegiaoId, x.MunicipioId });
            e.HasOne(x => x.Regiao).WithMany(r => r.Municipios).HasForeignKey(x => x.RegiaoId);
            e.HasOne(x => x.Municipio).WithMany().HasForeignKey(x => x.MunicipioId);
        });
        mb.Entity<UsuarioPerfil>(e =>
        {
            e.ToTable("usuario_perfil", Schemas.Comum);
            e.HasIndex(x => new { x.UsuarioId, x.Modulo }).IsUnique();
            e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId);
        });
        mb.Entity<RegistroAuditoria>(e =>
        {
            e.ToTable("auditoria", Schemas.Comum);
            e.Property(x => x.Alteracoes).HasColumnType("jsonb");
        });

        return mb;
    }

    /// <summary>Converte nomes de colunas para snake_case (padrão de todo o banco, legado inclusive).</summary>
    public static void AplicarSnakeCase(this ModelBuilder mb)
    {
        foreach (var entidade in mb.Model.GetEntityTypes())
            foreach (var prop in entidade.GetProperties())
                prop.SetColumnName(SnakeCase(prop.Name));
    }

    public static string SnakeCase(string nome)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < nome.Length; i++)
        {
            var c = nome[i];
            if (char.IsUpper(c) && i > 0) sb.Append('_');
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}
