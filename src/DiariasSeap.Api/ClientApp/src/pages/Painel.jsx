import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Carregando, Icone } from '../components/ui';
import { BarrasHorizontais, Indicador } from '../components/ui/Graficos';
import { ColunasSerie } from '../components/ui/GraficosAnalise';
import { FiltroPeriodo, periodoParaFiltro } from '../components/ui/FiltroPeriodo';
import { fmtMoeda, fmtNumero } from '../lib/formato';

export default function Painel() {
  const [periodo, setPeriodo] = useState({ preset: 'ano', base: 'diaria', de: '', ate: '', ano: '', mes: '' });
  const filtro = useMemo(() => periodoParaFiltro(periodo), [periodo]);
  const chave = JSON.stringify(filtro);
  const [d, setD] = useState(null);
  const [serie, setSerie] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setD(null); setSerie(null); setErro('');
    const f = JSON.parse(chave);
    api.get('/api/relatorios/dashboard', f).then((r) => vivo && (r.success ? setD(r.data) : setErro(r.message)));
    api.get('/api/analises/serie', { ...f, baseData: periodo.base }).then((r) => vivo && r.success && setSerie(r.data));
    return () => { vivo = false; };
  }, [chave, periodo.base]);

  const rotuloBase = periodo.base === 'cadastro' ? 'data do cadastro' : 'data da diária';

  return (
    <>
      <CabecalhoPagina
        titulo="Painel de diárias"
        subtitulo={`Custos e volume por mês, região, tipo, destino, origem e lotação, pela ${rotuloBase}, com o percentual de cada item no total do período.`}
        acoes={
          <Permitido perfis={['ADMIN', 'OPERADOR']}>
            <Link to="/diarias/nova" className="btn-primario"><Icone nome="add" /> Lançar diária</Link>
          </Permitido>
        }
      />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} className="mb-4" />
      <Alerta className="mb-4">{erro}</Alerta>
      {!d ? <Carregando /> : (
        <div className="flex flex-col gap-gutter-grid">
          {/* Valores em R$ em cartões largos (primeira linha); contagens embaixo. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-gutter-grid">
            <Indicador destaque className="xl:col-span-3" rotulo="Gasto com diárias no período" valor={fmtMoeda(d.totais.valorTotal)} />
            <Indicador className="xl:col-span-3" rotulo="Passagens aéreas" valor={fmtMoeda(d.valorPassagens)}
              detalhe={d.passagens ? `${fmtNumero(d.passagens)} passage${d.passagens > 1 ? 'ns' : 'm'} · total geral ${fmtMoeda(d.totais.valorTotal + d.valorPassagens)}` : 'Nenhuma no período'} />
            <Indicador className="xl:col-span-2" rotulo="Lançamentos" valor={fmtNumero(d.totais.diarias)} />
            <Indicador className="xl:col-span-2" rotulo="Servidores atendidos" valor={fmtNumero(d.totais.servidores)} />
            <Indicador className="xl:col-span-2" rotulo="Quantidade de diárias" valor={fmtNumero(d.totais.quantidade)}
              detalhe={d.totais.quantidade > 0 ? `Média de ${fmtMoeda(d.totais.valorTotal / d.totais.quantidade)} por diária` : undefined} />
          </div>
          <section className="cartao p-padding-card">
            <h3 className="font-body-lg text-body-lg font-semibold">Gasto por {serie?.granularidade === 'ano' ? 'ano' : 'mês'}</h3>
            <p className="font-label-md text-label-md text-on-surface-variant mb-4">
              Pela {rotuloBase}, com o percentual de cada {serie?.granularidade === 'ano' ? 'ano' : 'mês'} no total. Clique numa coluna para ver só aquele {serie?.granularidade === 'ano' ? 'ano' : 'mês'}.
            </p>
            {!serie ? <Carregando /> : (
              <ColunasSerie mostrarPercentual pontos={serie.pontos} onSelecionar={(p) => setPeriodo({ ...periodo, preset: 'custom', de: p.inicio, ate: p.fim })} />
            )}
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter-grid">
            <BarrasHorizontais titulo="Gasto por região" subtitulo="Região do município de destino" dados={d.porRegiao} total={d.totais.valorTotal} />
            <BarrasHorizontais titulo="Gasto por tipo de diária" dados={d.porTipo} total={d.totais.valorTotal} />
            <BarrasHorizontais titulo="10 destinos com maior gasto" dados={d.porDestino} total={d.totais.valorTotal} />
            <BarrasHorizontais titulo="10 cidades de origem com maior gasto" dados={d.porOrigem} total={d.totais.valorTotal} />
            <BarrasHorizontais titulo="10 lotações com maior gasto" dados={d.porUnidade} total={d.totais.valorTotal} />
          </div>
        </div>
      )}
    </>
  );
}

