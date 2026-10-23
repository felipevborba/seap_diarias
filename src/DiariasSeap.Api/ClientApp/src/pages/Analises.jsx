import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CampoData from '../components/ui/CampoData';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { Alerta, CabecalhoPagina, Carregando, Icone, Vazio, useAviso } from '../components/ui';
import { Indicador } from '../components/ui/Graficos';
import { COR_SERIE, ColunasSerie, CurvaAbc, SeloClasse, fmtCompacto } from '../components/ui/GraficosAnalise';
import { SeloSituacao } from '../components/ui/Situacao';
import { fmtCpf, fmtData, fmtMoeda, fmtNumero } from '../lib/formato';

// Dimensões de análise: filtro usado no drill e próxima visão sugerida ao clicar num item.
const DIMENSOES = [
  { id: 'lotacao', rotulo: 'Lotação', icone: 'domain', filtro: 'unidadeId', proxima: 'servidor' },
  { id: 'servidor', rotulo: 'Servidor', icone: 'badge', filtro: 'servidorId', proxima: null },
  { id: 'destino', rotulo: 'Destino', icone: 'location_on', filtro: 'destinoMunicipioId', proxima: 'servidor' },
  { id: 'cidadeOrigem', rotulo: 'Cidade de origem', icone: 'trip_origin', filtro: 'cidadeOrigemId', proxima: 'destino' },
  { id: 'regiao', rotulo: 'Região', icone: 'map', filtro: 'regiaoId', proxima: 'destino' },
  { id: 'tipo', rotulo: 'Tipo de diária', icone: 'category', filtro: 'tipoDiariaId', proxima: 'servidor' },
  { id: 'cargo', rotulo: 'Cargo', icone: 'work', filtro: 'cargoId', proxima: 'servidor' },
  { id: 'vinculo', rotulo: 'Vínculo', icone: 'handshake', filtro: 'vinculo', proxima: 'cargo' },
  { id: 'origem', rotulo: 'Origem', icone: 'history', filtro: 'origem', proxima: 'lotacao' },
  { id: 'situacao', rotulo: 'Situação', icone: 'fact_check', filtro: 'situacao', proxima: 'lotacao' },
];
const DIM = Object.fromEntries(DIMENSOES.map((d) => [d.id, d]));
const DESTAQUES = ['lotacao', 'servidor', 'destino', 'regiao', 'tipo', 'cargo'];
const FILTROS_DRILL = DIMENSOES.map((d) => d.filtro).filter((f) => f !== 'situacao');

const hoje = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PERIODOS = {
  mes: { rotulo: 'Este mês', de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) },
  ano: { rotulo: 'Este ano', de: `${hoje.getFullYear()}-01-01`, ate: `${hoje.getFullYear()}-12-31` },
  anoAnterior: { rotulo: 'Ano passado', de: `${hoje.getFullYear() - 1}-01-01`, ate: `${hoje.getFullYear() - 1}-12-31` },
  doze: { rotulo: 'Últimos 12 meses', de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) },
  tudo: { rotulo: 'Todo o histórico', de: '', ate: '' },
};

export default function Analises() {
  const [params, setParams] = useSearchParams();
  const avisar = useAviso();
  const dimensao = DIM[params.get('dim')] ? params.get('dim') : 'lotacao';

  // Filtros efetivos (período, situação, origem e trilha de drill), todos na URL.
  const periodo = params.get('periodo') || 'ano';
  const de = periodo === 'custom' ? params.get('de') || '' : PERIODOS[periodo]?.de ?? '';
  const ate = periodo === 'custom' ? params.get('ate') || '' : PERIODOS[periodo]?.ate ?? '';
  const filtros = useMemo(() => {
    // "Considerar": o intervalo vale para a data da diária (período da viagem) ou para a data do cadastro.
    const porCadastro = params.get('base') === 'cadastro';
    const f = {
      ...(porCadastro ? { cadastroInicio: de, cadastroFim: ate } : { dataInicio: de, dataFim: ate }),
      situacao: params.get('situacao') || 'VIGENTES', origem: params.get('origem') || '',
    };
    FILTROS_DRILL.forEach((k) => { if (params.get(k) !== null) f[k] = params.get(k); });
    return f;
  }, [params, de, ate]);
  const chaveFiltros = JSON.stringify(filtros);

  const atualizar = useCallback((mudancas, substituir = false) => {
    const p = new URLSearchParams(params);
    Object.entries(mudancas).forEach(([k, v]) => (v === null || v === undefined || v === '' ? p.delete(k) : p.set(k, v)));
    setParams(p, { replace: substituir });
  }, [params, setParams]);

  // Trilha de drill: filtros ativos com rótulo legível.
  const trilha = DIMENSOES.filter((d) => params.get(d.filtro) !== null && (d.id !== 'situacao' || params.get('drill.situacao')))
    .map((d) => ({ dim: d, valor: params.get(d.filtro), rotulo: params.get(`r.${d.filtro}`) || params.get(d.filtro) }));

  const detalhar = (dim, item) => {
    const d = DIM[dim];
    const filtrados = new Set([...trilha.map((t) => t.dim.id), dim]);
    let proxima = d.proxima;
    if (proxima && filtrados.has(proxima)) proxima = DIMENSOES.find((x) => !filtrados.has(x.id) && x.id !== 'situacao' && x.id !== 'origem')?.id || null;
    atualizar({
      [d.filtro]: item.chave, [`r.${d.filtro}`]: item.rotulo, ...(dim === 'situacao' ? { 'drill.situacao': '1' } : {}),
      dim: proxima || dim,
      ver: proxima ? null : 'lancamentos',
    });
    if (!proxima) setTimeout(() => document.getElementById('lancamentos')?.scrollIntoView({ behavior: 'smooth' }), 300);
  };

  const removerFiltro = (d) => atualizar({ [d.filtro]: null, [`r.${d.filtro}`]: null, ...(d.id === 'situacao' ? { 'drill.situacao': null, situacao: null } : {}) });
  const limparTrilha = () => {
    const m = { 'drill.situacao': null };
    DIMENSOES.forEach((d) => { m[d.filtro] = null; m[`r.${d.filtro}`] = null; });
    m.situacao = null;
    atualizar(m);
  };

  // ---------------- dados
  const [visao, setVisao] = useState(null);
  const [serie, setSerie] = useState(null);
  const [destaques, setDestaques] = useState({});
  const [ranking, setRanking] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setVisao(null); setSerie(null); setDestaques({}); setErro('');
    const f = JSON.parse(chaveFiltros);
    api.get('/api/analises/visao-geral', f).then((r) => vivo && (r.success ? setVisao(r.data) : setErro(r.message)));
    api.get('/api/analises/serie', { ...f, baseData: f.cadastroInicio !== undefined ? 'cadastro' : 'diaria' }).then((r) => vivo && r.success && setSerie(r.data));
    DESTAQUES.forEach((dim) => api.get(`/api/analises/ranking/${dim}`, f).then((r) => vivo && r.success && setDestaques((d) => ({ ...d, [dim]: r.data }))));
    return () => { vivo = false; };
  }, [chaveFiltros]);

  useEffect(() => {
    let vivo = true;
    setRanking(null);
    api.get(`/api/analises/ranking/${dimensao}`, JSON.parse(chaveFiltros)).then((r) => vivo && r.success && setRanking(r.data));
    return () => { vivo = false; };
  }, [dimensao, chaveFiltros]);

  const exportar = async () => {
    const r = await api.download('/api/relatorios/exportar', { ...filtros, situacao: filtros.situacao === '' ? 'TODAS' : filtros.situacao }, 'diarias.xlsx');
    if (!r.success) avisar(r.message, 'erro');
  };

  const selecionarPeriodoSerie = (p) => atualizar({ periodo: 'custom', de: p.inicio, ate: p.fim });

  return (
    <>
      <CabecalhoPagina
        titulo="Análises"
        subtitulo="Onde está o gasto com diárias: rankings com curva ABC por lotação, servidor, destino, região, tipo, cargo e mais. Clique em qualquer item para detalhar."
        acoes={<button type="button" className="btn-secundario" onClick={exportar}><Icone nome="download" /> Exportar seleção (.xlsx)</button>}
      />

      {/* Filtros globais: uma linha acima de tudo */}
      <div className="cartao p-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Considerar</span>
          <select className="campo !w-56" value={params.get('base') || 'diaria'} onChange={(e) => atualizar({ base: e.target.value === 'diaria' ? null : e.target.value })}>
            <option value="diaria">Data da diária (viagem)</option>
            <option value="cadastro">Data do cadastro (lançamento)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Período</span>
          <select className="campo !w-52" value={periodo} onChange={(e) => atualizar({ periodo: e.target.value, de: null, ate: null })}>
            {Object.entries(PERIODOS).map(([k, p]) => <option key={k} value={k}>{p.rotulo}</option>)}
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {periodo === 'custom' && (
          <>
            <label className="flex flex-col gap-1.5"><span className="rotulo">De</span>
              <CampoData value={de} onChange={(e) => atualizar({ de: e.target.value }, true)} /></label>
            <label className="flex flex-col gap-1.5"><span className="rotulo">Até</span>
              <CampoData value={ate} onChange={(e) => atualizar({ ate: e.target.value }, true)} /></label>
          </>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Situação</span>
          <select className="campo !w-56" value={filtros.situacao} onChange={(e) => atualizar({ situacao: e.target.value, 'drill.situacao': null, 'r.situacao': null })}>
            <option value="VIGENTES">Vigentes</option>
            <option value="TODAS">Todas (inclui canceladas da versão anterior)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Origem</span>
          <select className="campo !w-52" value={filtros.origem} onChange={(e) => atualizar({ origem: e.target.value })}>
            <option value="">Sistema novo e legado</option>
            <option value="SISTEMA">Lançadas no sistema</option>
            <option value="LEGADO">Migradas do legado</option>
          </select>
        </label>
      </div>

      {/* Trilha de drill down */}
      {trilha.length > 0 && (
        <nav aria-label="Filtros do detalhamento" className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Detalhando</span>
          {trilha.map((t, i) => (
            <React.Fragment key={t.dim.id}>
              {i > 0 && <Icone nome="chevron_right" className="text-outline text-lg" />}
              <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-body-md text-body-md">
                <span className="text-on-surface-variant">{t.dim.rotulo}:</span> <strong className="font-semibold max-w-[260px] truncate">{t.rotulo}</strong>
                <button type="button" className="rounded-full p-0.5 hover:bg-primary-fixed-dim" onClick={() => removerFiltro(t.dim)} aria-label={`Remover filtro ${t.dim.rotulo}`}>
                  <Icone nome="close" className="text-base" />
                </button>
              </span>
            </React.Fragment>
          ))}
          <button type="button" className="font-label-md text-label-md text-primary font-semibold hover:underline ml-1" onClick={limparTrilha}>Limpar detalhamento</button>
        </nav>
      )}

      <Alerta className="mb-4">{erro}</Alerta>

      {/* Indicadores */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-gutter-grid mb-gutter-grid">
        <Indicador destaque className="col-span-2" rotulo="Valor em diárias" valor={visao ? fmtMoeda(visao.totais.valorTotal) : '…'} />
        <Indicador rotulo="Lançamentos" valor={visao ? fmtNumero(visao.totais.diarias) : '…'} detalhe={visao ? `${fmtNumero(visao.totais.quantidade)} diárias pagas` : undefined} />
        <Indicador rotulo="Servidores" valor={visao ? fmtNumero(visao.totais.servidores) : '…'} detalhe={visao ? `${fmtMoeda(visao.valorMedioPorServidor)} por servidor` : undefined} />
        <Indicador rotulo="Valor médio por diária" valor={visao ? fmtMoeda(visao.valorMedioPorDiaria) : '…'} />
        <Indicador rotulo="Concentração"
          valor={visao?.servidoresClasseA ? `${fmtNumero(visao.servidoresClasseA.percentualItens)}%` : '…'}
          detalhe={visao?.servidoresClasseA ? `dos servidores (${fmtNumero(visao.servidoresClasseA.itens)}) recebem 80% do valor` : undefined} />
      </div>

      {/* Evolução */}
      <section className="cartao p-padding-card mb-gutter-grid">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="font-body-lg text-body-lg font-semibold">Evolução {serie?.granularidade === 'ano' ? 'anual' : 'mensal'}</h3>
            <p className="font-label-md text-label-md text-on-surface-variant">
              Pela {params.get('base') === 'cadastro' ? 'data do cadastro (lançamento)' : 'data de início de cada período'}. Clique numa coluna para analisar só aquele {serie?.granularidade === 'ano' ? 'ano' : 'mês'}.
            </p>
          </div>
        </div>
        {!serie ? <Carregando /> : <ColunasSerie pontos={serie.pontos} onSelecionar={selecionarPeriodoSerie} />}
      </section>

      {/* Destaques por dimensão (top 5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter-grid mb-gutter-grid">
        {DESTAQUES.map((dim) => (
          <CartaoDestaque key={dim} dim={DIM[dim]} dados={destaques[dim]} ativa={dimensao === dim}
            onAbrir={() => { atualizar({ dim }); setTimeout(() => document.getElementById('abc')?.scrollIntoView({ behavior: 'smooth' }), 200); }}
            onDetalhar={(item) => detalhar(dim, item)} />
        ))}
      </div>

      {/* Curva ABC + ranking completo da dimensão escolhida */}
      <section id="abc" className="cartao mb-gutter-grid scroll-mt-20">
        <div className="px-padding-card pt-padding-card">
          <h3 className="font-headline-sm text-headline-sm text-primary">Curva ABC por {DIM[dimensao].rotulo.toLowerCase()}</h3>
          <p className="font-body-md text-body-md text-on-surface-variant">Classe A: itens que somam os primeiros 80% do valor; B: os próximos 15%; C: os 5% finais.</p>
          <div role="tablist" aria-label="Dimensão" className="mt-4 flex gap-1 overflow-x-auto border-b border-outline-variant">
            {DIMENSOES.map((d) => (
              <button key={d.id} role="tab" type="button" aria-selected={dimensao === d.id}
                onClick={() => atualizar({ dim: d.id })}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 font-body-md text-body-md whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  dimensao === d.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
                <Icone nome={d.icone} className="text-lg" /> {d.rotulo}
              </button>
            ))}
          </div>
        </div>
        {!ranking ? <Carregando /> : ranking.totalItens === 0 ? <Vazio icone="query_stats" texto="Nenhum valor para os filtros." /> : (
          <PainelAbc ranking={ranking} dim={DIM[dimensao]} onDetalhar={(item) => detalhar(dimensao, item)} />
        )}
      </section>

      <Lancamentos filtros={filtros} chave={chaveFiltros} aberto={params.get('ver') === 'lancamentos' || trilha.some((t) => t.dim.id === 'servidor')}
        onAlternar={(v) => atualizar({ ver: v ? 'lancamentos' : null }, true)} />
    </>
  );
}

function CartaoDestaque({ dim, dados, ativa, onAbrir, onDetalhar }) {
  const max = dados?.itens?.[0]?.valor || 1;
  return (
    <section className={`cartao p-padding-card flex flex-col ${ativa ? 'ring-2 ring-primary/30' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-body-lg text-body-lg font-semibold flex items-center gap-2"><Icone nome={dim.icone} className="text-primary" /> Por {dim.rotulo.toLowerCase()}</h3>
          {dados && (
            <p className="font-label-md text-label-md text-on-surface-variant">
              {fmtNumero(dados.totalItens)} itens · 5 maiores = {fmtNumero(dados.valorTotal > 0 ? (dados.itens.slice(0, 5).reduce((s, x) => s + x.valor, 0) / dados.valorTotal) * 100 : 0)}% do valor
            </p>
          )}
        </div>
        <button type="button" className="btn-icone !p-1.5" onClick={onAbrir} aria-label={`Abrir curva ABC por ${dim.rotulo}`} title="Ver ranking completo e curva ABC">
          <Icone nome="open_in_full" className="text-xl" />
        </button>
      </div>
      {!dados ? <Carregando texto="" /> : (
        <ul className="flex flex-col gap-1">
          {dados.itens.slice(0, 5).map((it, i) => (
            <li key={it.chave}>
              <button type="button" onClick={() => onDetalhar(it)} title={`Detalhar ${it.rotulo}`}
                className="w-full grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-primary outline-none">
                <span className="font-label-md text-label-md text-on-surface-variant tabular">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-body-md text-body-md text-on-surface truncate">{it.rotulo}</span>
                  <span className="block h-1.5 mt-1 rounded-r-[4px]" style={{ width: `${Math.max((it.valor / max) * 100, 2)}%`, background: COR_SERIE }} />
                </span>
                <span className="font-label-md text-label-md text-on-surface tabular whitespace-nowrap">{fmtCompacto(it.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PainelAbc({ ranking, dim, onDetalhar }) {
  const [classe, setClasse] = useState('');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(25);
  useEffect(() => { setClasse(''); setBusca(''); setLimite(25); }, [ranking]);

  const itens = ranking.itens.filter((x) => (!classe || x.classe === classe) && (!busca || x.rotulo.toLowerCase().includes(busca.toLowerCase())));
  const max = ranking.itens[0]?.valor || 1;
  const folha = !dim.proxima;

  return (
    <div className="p-padding-card grid grid-cols-1 xl:grid-cols-5 gap-gutter-grid">
      <div className="xl:col-span-2 flex flex-col gap-4 xl:sticky xl:top-20 self-start">
        <div className="max-w-xl"><CurvaAbc curva={ranking.curva} classes={ranking.classes} /></div>
        <div className="grid grid-cols-3 gap-2 max-w-xl">
          {ranking.classes.map((c) => (
            <button type="button" key={c.classe} onClick={() => setClasse(classe === c.classe ? '' : c.classe)} aria-pressed={classe === c.classe}
              className={`rounded-lg border p-3 text-left transition-colors ${classe === c.classe ? 'border-primary bg-primary-fixed/40' : 'border-outline-variant hover:bg-surface-container-low'}`}>
              <div className="flex items-center gap-2"><SeloClasse classe={c.classe} /><span className="font-label-md text-label-md text-on-surface-variant">Classe {c.classe}</span></div>
              <p className="mt-2 font-body-lg text-body-lg font-semibold tabular">{fmtNumero(c.itens)} <span className="font-body-md text-body-md font-normal text-on-surface-variant">itens</span></p>
              <p className="font-label-md text-label-md text-on-surface-variant tabular">{fmtNumero(c.percentualItens)}% dos itens · {fmtNumero(c.percentualValor)}% do valor</p>
              <p className="font-label-md text-label-md text-on-surface tabular mt-0.5">{fmtMoeda(c.valor)}</p>
            </button>
          ))}
        </div>
        <p className="font-label-md text-label-md text-on-surface-variant">
          {ranking.totalItens > ranking.itens.length ? `Mostrando os ${fmtNumero(ranking.itens.length)} maiores de ${fmtNumero(ranking.totalItens)}. ` : ''}
          Clique numa classe para filtrar a tabela.
        </p>
      </div>

      <div className="xl:col-span-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <input className="campo !w-72" placeholder={`Buscar ${dim.rotulo.toLowerCase()}`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no ranking" />
          <span className="font-label-md text-label-md text-on-surface-variant">
            {folha ? 'Clique para ver os lançamentos' : `Clique para detalhar por ${DIM[dim.proxima].rotulo.toLowerCase()}`}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="tabela">
            <thead>
              <tr><th className="w-10">#</th><th>{dim.rotulo}</th><th>Classe</th><th className="text-right">Valor</th><th className="text-right">%</th>
                <th className="text-right">% acum.</th><th className="text-right">Lançam.</th><th className="text-right">Servidores</th><th className="text-right">Média/diária</th></tr>
            </thead>
            <tbody>
              {itens.slice(0, limite).map((it) => (
                <tr key={it.chave} className="cursor-pointer" onClick={() => onDetalhar(it)} tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onDetalhar(it)}>
                  <td className="tabular text-on-surface-variant">{ranking.itens.indexOf(it) + 1}</td>
                  <td className="min-w-[220px]">
                    <div className="font-semibold text-on-surface">{it.rotulo}</div>
                    {it.detalhe && <div className="font-label-md text-label-md text-on-surface-variant">{dim.id === 'servidor' ? `Mat. ${it.detalhe}` : it.detalhe}</div>}
                    <div className="h-1.5 mt-1.5 rounded-r-[4px]" style={{ width: `${Math.max((it.valor / max) * 100, 1)}%`, background: COR_SERIE }} />
                  </td>
                  <td><SeloClasse classe={it.classe} /></td>
                  <td className="text-right tabular font-semibold whitespace-nowrap">{fmtMoeda(it.valor)}</td>
                  <td className="text-right tabular">{fmtNumero(it.percentual)}%</td>
                  <td className="text-right tabular text-on-surface-variant">{fmtNumero(it.percentualAcumulado)}%</td>
                  <td className="text-right tabular">{fmtNumero(it.diarias)}</td>
                  <td className="text-right tabular">{fmtNumero(it.servidores)}</td>
                  <td className="text-right tabular whitespace-nowrap">{fmtMoeda(it.quantidade > 0 ? it.valor / it.quantidade : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {itens.length > limite && (
          <button type="button" className="btn-secundario w-full mt-3" onClick={() => setLimite(limite + 50)}>
            Mostrar mais ({fmtNumero(itens.length - limite)} restantes)
          </button>
        )}
      </div>
    </div>
  );
}

function Lancamentos({ filtros, chave, aberto, onAlternar }) {
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  useEffect(() => setPagina(1), [chave]);
  useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    setDados(null);
    api.get('/api/relatorios', { ...JSON.parse(chave), page: pagina, pageSize: 20 }).then((r) => vivo && r.success && setDados(r.data));
    return () => { vivo = false; };
  }, [aberto, chave, pagina]);

  return (
    <section id="lancamentos" className="cartao overflow-hidden scroll-mt-20">
      <button type="button" onClick={() => onAlternar(!aberto)} aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 p-padding-card text-left hover:bg-surface-container-low">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-primary">Lançamentos da seleção</h3>
          <p className="font-body-md text-body-md text-on-surface-variant">O nível mais detalhado: cada diária que compõe os números acima. Clique para abrir a diária.</p>
        </div>
        <Icone nome={aberto ? 'expand_less' : 'expand_more'} className="text-2xl text-on-surface-variant" />
      </button>
      {aberto && (!dados ? <Carregando /> : dados.linhas.totalItems === 0 ? <Vazio icone="inbox" texto="Nenhum lançamento." /> : (
        <>
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Servidor</th><th>Lotação</th><th>Destino</th><th>Tipo</th><th>Período</th><th className="text-right">Qtd.</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {dados.linhas.items.map((l, i) => (
                  <tr key={`${l.diariaId}-${i}`}>
                    <td className="tabular"><Link className="text-primary font-semibold hover:underline" to={`/diarias/${l.diariaId}`}>{l.diariaId}</Link>
                      {l.legadoCodigo && <div className="font-label-md text-label-md text-on-surface-variant">leg. {l.legadoCodigo}</div>}</td>
                    <td><div className="font-semibold">{l.servidor}</div><div className="font-label-md text-label-md text-on-surface-variant">{l.cpf ? fmtCpf(l.cpf) : 'sem CPF'}</div></td>
                    <td className="text-on-surface-variant">{l.unidade || '—'}</td>
                    <td>{l.destino}{l.regiao && <div className="font-label-md text-label-md text-on-surface-variant">{l.regiao}</div>}</td>
                    <td>{l.tipoDiaria}</td>
                    <td className="whitespace-nowrap tabular">{fmtData(l.dataInicio)} a {fmtData(l.dataFim)}</td>
                    <td className="text-right tabular">{fmtNumero(l.quantidade)}</td>
                    <td className="text-right tabular font-semibold whitespace-nowrap">{fmtMoeda(l.valorTotal)}</td>
                    <td><SeloSituacao situacao={l.situacao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-outline-variant/60">
            <span className="font-label-md text-label-md text-on-surface-variant">
              {fmtNumero(dados.linhas.totalItems)} registros · {fmtMoeda(dados.totais.valorTotal)} · página {dados.linhas.page} de {dados.linhas.totalPages}
            </span>
            <div className="flex gap-1">
              <button type="button" className="btn-icone" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Página anterior"><Icone nome="chevron_left" /></button>
              <button type="button" className="btn-icone" disabled={pagina >= dados.linhas.totalPages} onClick={() => setPagina(pagina + 1)} aria-label="Próxima página"><Icone nome="chevron_right" /></button>
            </div>
          </div>
        </>
      ))}
    </section>
  );
}
