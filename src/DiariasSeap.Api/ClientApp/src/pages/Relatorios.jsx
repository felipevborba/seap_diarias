import React, { useState } from 'react';
import CampoData from '../components/ui/CampoData';
import api from '../api';
import { Alerta, CabecalhoPagina, Carregando, Icone, Paginacao, Vazio, useAviso } from '../components/ui';
import { SeletorMunicipio } from '../components/ui/Seletores';
import { Indicador } from '../components/ui/Graficos';
import { SITUACOES, SeloSituacao } from '../components/ui/Situacao';
import { VINCULOS, fmtCpf, fmtData, fmtDataUtcLocal, fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados, useRegioes, useTipos, useUnidades } from '../lib/useDados';

const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export default function Relatorios() {
  const unidades = useUnidades();
  const tipos = useTipos();
  const regioes = useRegioes();
  const avisar = useAviso();
  // Padrão: lançamentos cadastrados a partir do 1º dia do mês (data do cadastro); a data da diária fica livre.
  const vazio = { dataInicio: '', dataFim: '', cadastroInicio: primeiroDiaMes(), cadastroFim: '', servidor: '', unidadeId: '', destino: null,
    cidadeOrigem: null, regiaoId: '', tipoDiariaId: '', vinculo: '', situacao: 'VIGENTES', origem: '' };
  const [filtro, setFiltro] = useState(vazio);
  const [aplicado, setAplicado] = useState(vazio);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const params = (f) => ({
    dataInicio: f.dataInicio, dataFim: f.dataFim, cadastroInicio: f.cadastroInicio, cadastroFim: f.cadastroFim,
    servidor: f.servidor, unidadeId: f.unidadeId, destinoMunicipioId: f.destino?.id, cidadeOrigemId: f.cidadeOrigem?.id,
    regiaoId: f.regiaoId, tipoDiariaId: f.tipoDiariaId, vinculo: f.vinculo,
    situacao: f.situacao === '' ? 'TODAS' : f.situacao, origem: f.origem,
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
        subtitulo="Uma linha por tipo de diária de cada período. Filtre pela data do cadastro (quando foi lançada) e/ou pela data da diária (período da viagem). A planilha segue os mesmos filtros."
        acoes={
          <button type="button" className="btn-primario" onClick={exportar} disabled={exportando || !dados?.linhas.totalItems}>
            <Icone nome="download" /> {exportando ? 'Gerando...' : 'Planilha da Controladoria (.xlsx)'}
          </button>
        }
      />

      <form className="cartao p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); }}>
        <fieldset className="lg:col-span-2 rounded-lg border border-outline-variant p-3">
          <legend className="rotulo px-1">Data do cadastro</legend>
          <div className="grid grid-cols-2 gap-3">
            <CampoData value={filtro.cadastroInicio} onChange={set('cadastroInicio')} aria-label="Data do cadastro: de" />
            <CampoData value={filtro.cadastroFim} min={filtro.cadastroInicio} onChange={set('cadastroFim')} aria-label="Data do cadastro: até" />
          </div>
        </fieldset>
        <fieldset className="lg:col-span-2 rounded-lg border border-outline-variant p-3">
          <legend className="rotulo px-1">Data da diária (período da viagem)</legend>
          <div className="grid grid-cols-2 gap-3">
            <CampoData value={filtro.dataInicio} onChange={set('dataInicio')} aria-label="Data da diária: de" />
            <CampoData value={filtro.dataFim} min={filtro.dataInicio} onChange={set('dataFim')} aria-label="Data da diária: até" />
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 lg:col-span-2"><span className="rotulo">Servidor</span>
          <input className="campo" value={filtro.servidor} onChange={set('servidor')} placeholder="Nome, CPF ou matrícula" /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Lotação</span>
          <select className="campo" value={filtro.unidadeId} onChange={set('unidadeId')}>
            <option value="">Todas</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select></label>
        <div className="flex flex-col gap-1.5"><span className="rotulo">Cidade de origem</span>
          <SeletorMunicipio valor={filtro.cidadeOrigem} onSelecionar={(m) => setFiltro({ ...filtro, cidadeOrigem: m })} placeholder="Qualquer" /></div>
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
        <label className="flex flex-col gap-1.5"><span className="rotulo">Situação</span>
          <select className="campo" value={filtro.situacao} onChange={set('situacao')}>
            {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Procedência do registro</span>
          <select className="campo" value={filtro.origem} onChange={set('origem')}>
            <option value="">Todas</option><option value="SISTEMA">Sistema novo</option><option value="LEGADO">Migradas do legado</option>
          </select></label>
        <div className="flex gap-2 lg:justify-end lg:col-span-3">
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
                  <tr><th>Nº</th><th>Cadastro</th><th>Servidor</th><th>Lotação</th><th>Origem → Destino</th><th>Região</th><th>Tipo</th><th>Período</th>
                    <th className="text-right">Qtd.</th><th className="text-right">Valor</th></tr>
                </thead>
                <tbody>
                  {dados.linhas.items.map((l, i) => (
                    <tr key={`${l.diariaId}-${i}`}>
                      <td className="tabular"><a className="text-primary hover:underline" href={`/diarias/${l.diariaId}`}>{l.diariaId}</a></td>
                      <td className="tabular whitespace-nowrap text-on-surface-variant">{fmtDataUtcLocal(l.criadoEm)}</td>
                      <td>
                        <div className="font-semibold">{l.servidor}</div>
                        <div className="font-label-md text-label-md text-on-surface-variant flex flex-wrap items-center gap-1">{l.cpf ? fmtCpf(l.cpf) : 'sem CPF'} · {l.vinculo} <SeloSituacao situacao={l.situacao} /></div>
                      </td>
                      <td className="text-on-surface-variant">{l.unidade || '—'}</td>
                      <td>
                        <div>{l.destino}</div>
                        {l.cidadeOrigem && <div className="font-label-md text-label-md text-on-surface-variant">de {l.cidadeOrigem}</div>}
                      </td>
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
