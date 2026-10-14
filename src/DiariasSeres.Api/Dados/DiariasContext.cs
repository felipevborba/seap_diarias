using DiariasSeres.Api.Modelos;
using Microsoft.EntityFrameworkCore;
using Seap.Compartilhado.Auditoria;
using Seap.Compartilhado.Dados;
using Seap.Compartilhado.Modelos;

namespace DiariasSeres.Api.Dados;

public class DiariasContext : DbContext
{
    public const string Schema = "diarias";
    public const string Modulo = "DIARIAS";

    public DiariasContext(DbContextOptions<DiariasContext> options) : base(options) { }

    // Compartilhadas
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Unidade> Unidades => Set<Unidade>();
    public DbSet<Tabuf> Ufs => Set<Tabuf>();
    public DbSet<Tabnaturalidade> Municipios => Set<Tabnaturalidade>();
    public DbSet<PoliciaPenal> PoliciaisPenais => Set<PoliciaPenal>();
    public DbSet<Cargo> Cargos => Set<Cargo>();
    public DbSet<Servidor> Servidores => Set<Servidor>();
    public DbSet<Regiao> Regioes => Set<Regiao>();
    public DbSet<RegiaoMunicipio> RegioesMunicipios => Set<RegiaoMunicipio>();
    public DbSet<UsuarioPerfil> UsuariosPerfis => Set<UsuarioPerfil>();
    public DbSet<RegistroAuditoria> Auditoria => Set<RegistroAuditoria>();

    // Módulo
    public DbSet<TipoDiaria> TiposDiaria => Set<TipoDiaria>();
    public DbSet<ValorDiaria> ValoresDiaria => Set<ValorDiaria>();
    public DbSet<Diaria> Diarias => Set<Diaria>();
    public DbSet<DiariaPeriodo> DiariasPeriodos => Set<DiariaPeriodo>();
    public DbSet<DiariaItem> DiariasItens => Set<DiariaItem>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.MapearTabelasCompartilhadas();

        mb.Entity<TipoDiaria>().ToTable("tipo_diaria", Schema);

        mb.Entity<ValorDiaria>(e =>
        {
            e.ToTable("valor_diaria", Schema);
            e.Property(x => x.Vinculo).HasConversion<short?>();
            e.Property(x => x.Valor).HasPrecision(12, 2);
            e.HasOne(x => x.TipoDiaria).WithMany().HasForeignKey(x => x.TipoDiariaId);
            e.HasOne(x => x.Cargo).WithMany().HasForeignKey(x => x.CargoId);
        });

        mb.Entity<Diaria>(e =>
        {
            e.ToTable("diaria", Schema);
            e.Property(x => x.Vinculo).HasConversion<short>();
            e.Property(x => x.ValorTotal).HasPrecision(12, 2);
            e.HasOne(x => x.Servidor).WithMany().HasForeignKey(x => x.ServidorId);
            e.HasOne(x => x.Cargo).WithMany().HasForeignKey(x => x.CargoId);
            e.HasOne(x => x.Unidade).WithMany().HasForeignKey(x => x.UnidadeId);
            e.HasMany(x => x.Periodos).WithOne(p => p.Diaria).HasForeignKey(p => p.DiariaId);
        });

        mb.Entity<DiariaPeriodo>(e =>
        {
            e.ToTable("diaria_periodo", Schema);
            e.Property(x => x.ValorTotal).HasPrecision(12, 2);
            e.HasOne(x => x.DestinoMunicipio).WithMany().HasForeignKey(x => x.DestinoMunicipioId);
            e.HasMany(x => x.Itens).WithOne(i => i.Periodo).HasForeignKey(i => i.PeriodoId);
        });

        mb.Entity<DiariaItem>(e =>
        {
            e.ToTable("diaria_item", Schema);
            e.Property(x => x.Quantidade).HasPrecision(6, 1);
            e.Property(x => x.ValorUnitario).HasPrecision(12, 2);
            e.Property(x => x.ValorTotal).HasPrecision(12, 2);
            e.HasOne(x => x.TipoDiaria).WithMany().HasForeignKey(x => x.TipoDiariaId);
        });

        mb.AplicarSnakeCase();
    }
}
