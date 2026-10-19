namespace DiariasSeap.Api.Servicos;

/// <summary>
/// Mantém comum.servidor alinhado com os policiais penais da Carteira (public.policia_penal): roda alguns
/// minutos após o start e depois a cada SincronizacaoPoliciais:IntervaloHoras (padrão 6h; 0 desliga).
/// É a mesma rotina do botão "Sincronizar policiais penais" (idempotente); falhas só são registradas no log.
/// </summary>
public class SincronizacaoPoliciaisWorker : BackgroundService
{
    private readonly IServiceScopeFactory _escopos;
    private readonly ILogger<SincronizacaoPoliciaisWorker> _log;
    private readonly TimeSpan _intervalo;

    public SincronizacaoPoliciaisWorker(IServiceScopeFactory escopos, ILogger<SincronizacaoPoliciaisWorker> log, IConfiguration config)
    {
        _escopos = escopos;
        _log = log;
        _intervalo = TimeSpan.FromHours(config.GetValue("SincronizacaoPoliciais:IntervaloHoras", 6.0));
    }

    protected override async Task ExecuteAsync(CancellationToken parar)
    {
        if (_intervalo <= TimeSpan.Zero) return;
        try { await Task.Delay(TimeSpan.FromMinutes(2), parar); } catch (OperationCanceledException) { return; }

        while (!parar.IsCancellationRequested)
        {
            try
            {
                using var escopo = _escopos.CreateScope();
                var r = await escopo.ServiceProvider.GetRequiredService<ServidoresService>().SincronizarPoliciaisAsync();
                if (r.Criados + r.Atualizados + r.Vinculados > 0)
                    _log.LogInformation("Sincronização automática de policiais: {Criados} criados, {Atualizados} atualizados, {Vinculados} vinculados.",
                        r.Criados, r.Atualizados, r.Vinculados);
            }
            catch (Exception e)
            {
                _log.LogWarning(e, "Sincronização automática de policiais falhou; nova tentativa no próximo ciclo.");
            }
            try { await Task.Delay(_intervalo, parar); } catch (OperationCanceledException) { return; }
        }
    }
}
