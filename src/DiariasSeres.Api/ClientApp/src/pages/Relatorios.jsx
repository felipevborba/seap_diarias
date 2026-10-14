import React, { useState } from 'react';
import api from '../api';
import { Alerta, CabecalhoPagina, Carregando, Icone, Paginacao, Selo, Vazio, useAviso } from '../components/ui';
import { SeletorMunicipio } from '../components/ui/Seletores';
import { Indicador } from '../components/ui/Graficos';
import { VINCULOS, fmtCpf, fmtData, fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados, useRegioes, useTipos, useUnidades } from '../lib/useDados';

const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export default function Relatorios() {
  const unidades = useUnidades();
  const tipos = useTipos();
  const regioes = useRegioes();
  const avisar = useAviso();
  const vazio = { dataInicio: primeiroDiaMes(), dataFim: '', servidor: '', unidadeId: '', destino: null, regiaoId: '', tipoDiariaId: '', vinculo: '', incluirCanceladas: false };
  const [filtro, setFiltro] = useState(vazio);
  const [aplicado, setAplicado] = useState(vazio);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const params = (f) => ({
    dataInicio: f.dataInicio, dataFim: f.dataFim, servidor: f.servidor, unidadeId: f.unidadeId,
    destinoMunicipioId: f.destino?.id, regiaoId: f.regiaoId, tipoDiariaId: f.tipoDiariaId, vinculo: f.vinculo,
    incluirCanceladas: f.incluirCanceladas || undefined,
  });
  const { dados, carregando, erro } = useDados('/api/relatorios', { ...params(aplicado), page: pagina, pageSize: 50 });
  const set = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const exportar = async () => {
    setExportando(true);
    const r = await api.download('/api/relatorios/exportar', params(aplicado), 'diarias.xlsx');
    setExportando(false);
    if (!r.success) avisar(r.message, 'erro');
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        subtitulo="Um registro por período de diária. Períodos que cruzam o intervalo entram com valor integral."
        acoes={
          <button type="button" className="btn-primario" onClick={exportar} disabled={exportando || !dados?.linhas.totalItems}>
            <Icone nome="download" /> {exportando ? 'Gerando...' : 'Planilha da Controladoria (.xlsx)'}
          </button>
        }
      />

      <form className="cartao p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); }}>
        <label className="flex flex-col gap-1.5"><span className="rotulo">De</span>
          <input type="date" className="campo" value={filtro.dataInicio} onChange={set('dataInicio')} /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Até</span>
          <input type="date" className="campo" value={filtro.dataFim} onChange={set('dataFim')} /></label>
        <label className="flex flex-col gap-1.5 lg:col-span-2"><span className="rotulo">Servidor</span>
          <input className="campo" value={filtro.servidor} onChange={set('servidor')} placeholder="Nome, CPF ou matrícula" /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Lotação</span>
          <select className="campo" value={filtro.unidadeId} onChange={set('unidadeId')}>
            <option value="">Todas</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select></label>
        <div className="flex flex-col gap-1.5"><span className="rotulo">Destino</span>
          <SeletorMunicipio valor={filtro.destino} onSelecionar={(m) => setFiltro({ ...filtro, destino: m })} placeholder="Qualquer" /></div>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Região</span>
          <select className="campo" value={filtro.regiaoId} onChange={set('regiaoId')}>
            <option value="">Todas</option>{regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Tipo</span>
          <select className="campo" value={filtro.tipoDiariaId} onChange={set('tipoDiariaId')}>
            <option value="">Todos</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Vínculo</span>
          <select className="campo" value={filtro.vinculo} onChange={set('vinculo')}>
            <option value="">Todos</option>{VINCULOS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
          </select></label>
        <label className="flex items-center gap-2 py-2.5">
          <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={filtro.incluirCanceladas} onChange={set('incluirCanceladas')} />
          <span className="font-body-md text-body-md">Incluir canceladas</span>
        </label>
        <div className="flex gap-2 lg:col-span-2 lg:justify-end">
          <button type="button" className="btn-secundario" onClick={() => { setFiltro(vazio); setAplicado(vazio); setPagina(1); }}>Limpar</button>
          <button type="submit" className="btn-primario"><Icone nome="search" /> Consultar</button>
        </div>
      </form>

      <Alerta className="mb-4">{erro}</Alerta>

      {dados && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-gutter-grid mb-4">
          <Indicador rotulo="Valor total" valor={fmtMoeda(dados.totais.valorTotal)} />
          <Indicador rotulo="Diárias" valor={fmtNumero(dados.totais.diarias)} />
          <Indicador rotulo="Servidores" valor={fmtNumero(dados.totais.servidores)} />
          <Indicador rotulo="Quantidade de diárias" valor={fmtNumero(dados.totais.quantidade)} />
        </div>
      )}

      <div className="cartao overflow-hidden">
        {carregando && !dados ? <Carregando /> : !dados?.linhas.items.length ? (
          <Vazio icone="query_stats" texto="Nenhum período encontrado para os filtros." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr><th>Nº</th><th>Servidor</th><th>Lotação</th><th>Destino</th><th>Região</th><th>Tipo</th><th>Período</th>
                    <th className="text-right">Qtd.</th><th className="text-right">Valor</th></tr>
                </thead>
                <tbody>
                  {dados.linhas.items.map((l, i) => (
                    <tr key={`${l.diariaId}-${i}`}>
                      <td className="tabular"><a className="text-primary hover:underline" href={`/diarias/${l.diariaId}`}>{l.diariaId}</a></td>
                      <td>
                        <div className="font-semibold">{l.servidor}</div>
                        <div className="font-label-md text-label-md text-on-surface-variant">{fmtCpf(l.cpf)} · {l.vinculo}{l.situacao === 'CANCELADA' && <> · <Selo cor="vermelho">Cancelada</Selo></>}</div>
                      </td>
                      <td className="text-on-surface-variant">{l.unidade || '—'}</td>
                      <td>{l.destino}</td>
                      <td className="text-on-surface-variant">{l.regiao || '—'}</td>
                      <td>{l.tipoDiaria}</td>
                      <td className="whitespace-nowrap tabular">{fmtData(l.dataInicio)} a {fmtData(l.dataFim)}</td>
                      <td className="text-right tabular">{fmtNumero(l.quantidade)}</td>
                      <td className="text-right tabular font-semibold whitespace-nowrap">{fmtMoeda(l.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={dados.linhas.page} totalPaginas={dados.linhas.totalPages} totalItens={dados.linhas.totalItems} onMudar={setPagina} />
          </>
        )}
      </div>
    </>
  );
}
