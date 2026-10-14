import React, { useState } from 'react';
import { fmtMoeda, fmtNumero } from '../../lib/formato';
import { Icone } from './index';

// Gráficos de série única (magnitude): uma cor só, sem legenda (o título diz o que é), valor na ponta,
// tooltip no hover e alternativa em tabela. Cor validada (croma/contraste) contra a superfície clara.
const COR_SERIE = '#2f62b8';
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtCompacto = (v) => `R$ ${compacto.format(v)}`;

function Moldura({ titulo, subtitulo, children, dados }) {
  const [tabela, setTabela] = useState(false);
  return (
    <section className="cartao p-padding-card flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="font-body-lg text-body-lg font-semibold text-on-surface">{titulo}</h3>
          {subtitulo && <p className="font-label-md text-label-md text-on-surface-variant">{subtitulo}</p>}
        </div>
        <button type="button" className="btn-icone !p-1.5" onClick={() => setTabela(!tabela)}
          aria-label={tabela ? 'Ver gráfico' : 'Ver como tabela'} title={tabela ? 'Ver gráfico' : 'Ver como tabela'}>
          <Icone nome={tabela ? 'bar_chart' : 'table'} className="text-xl" />
        </button>
      </div>
      {dados.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant py-8 text-center">Sem dados no período.</p>
      ) : tabela ? (
        <table className="tabela">
          <thead><tr><th>Item</th><th className="text-right">Períodos</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.rotulo}>
                <td>{d.rotulo}</td>
                <td className="text-right tabular">{fmtNumero(d.quantidade)}</td>
                <td className="text-right tabular">{fmtMoeda(d.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : children}
    </section>
  );
}

function Dica({ item }) {
  return (
    <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full -mt-2 left-1/2 top-0 whitespace-nowrap rounded-lg bg-inverse-surface text-inverse-on-surface px-3 py-2 shadow-lg font-label-md text-label-md">
      <div className="font-semibold">{item.rotulo}</div>
      <div className="tabular">{fmtMoeda(item.valor)} · {fmtNumero(item.quantidade)} período{item.quantidade === 1 ? '' : 's'}</div>
    </div>
  );
}

/** Barras horizontais ranqueadas (regiões, destinos, unidades, tipos). */
export function BarrasHorizontais({ titulo, subtitulo, dados }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...dados.map((d) => d.valor), 0) || 1;
  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} dados={dados}>
      <ul className="flex flex-col gap-3">
        {dados.map((d) => (
          <li key={d.rotulo}
            className="relative grid grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[minmax(0,12rem)_1fr] items-center gap-3"
            onMouseEnter={() => setHover(d.rotulo)} onMouseLeave={() => setHover(null)}>
            <span className="font-body-md text-body-md text-on-surface truncate" title={d.rotulo}>{d.rotulo}</span>
            <div className="relative flex items-center gap-2 h-6">
              <div className="h-4 rounded-r-[4px] transition-opacity"
                style={{ width: `${Math.max((d.valor / max) * 100, 0.5)}%`, maxWidth: 'calc(100% - 5.5rem)', background: COR_SERIE, opacity: hover && hover !== d.rotulo ? 0.45 : 1 }} />
              <span className="font-label-md text-label-md text-on-surface-variant tabular whitespace-nowrap">{fmtCompacto(d.valor)}</span>
              {hover === d.rotulo && <Dica item={d} />}
            </div>
          </li>
        ))}
      </ul>
    </Moldura>
  );
}

/** Colunas por mês (série temporal curta, 12 categorias fixas). */
export function ColunasMensais({ titulo, subtitulo, dados }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...dados.map((d) => d.valor), 0);
  const topo = max > 0 ? Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) : 1;
  const maiorMes = dados.reduce((a, d) => (d.valor > (a?.valor ?? -1) ? d : a), null);
  const vazio = max === 0;

  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} dados={vazio ? [] : dados}>
      <div className="relative h-56 pl-16">
        {/* grade recessiva: 0, metade e topo */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute left-16 right-0 border-t border-surface-container-high" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-16 -translate-y-1/2 w-14 text-right whitespace-nowrap font-label-md text-label-md text-on-surface-variant tabular">{fmtCompacto(topo * f)}</span>
          </div>
        ))}
        <div className="absolute left-16 right-0 top-0 bottom-0 flex items-end">
          {dados.map((d) => (
            <div key={d.rotulo} className="relative flex-1 h-full flex items-end justify-center"
              onMouseEnter={() => setHover(d.rotulo)} onMouseLeave={() => setHover(null)}>
              {d === maiorMes && d.valor > 0 && (
                <span className="absolute font-label-md text-label-md text-on-surface tabular whitespace-nowrap"
                  style={{ bottom: `calc(${(d.valor / topo) * 100}% + 4px)` }}>{fmtCompacto(d.valor)}</span>
              )}
              <div className="w-[min(24px,60%)] rounded-t-[4px] transition-opacity"
                style={{ height: `${(d.valor / topo) * 100}%`, minHeight: d.valor > 0 ? 2 : 0, background: COR_SERIE, opacity: hover && hover !== d.rotulo ? 0.45 : 1 }} />
              {hover === d.rotulo && <div className="absolute top-1/3 left-1/2"><Dica item={d} /></div>}
            </div>
          ))}
        </div>
      </div>
      <div className="flex pl-16 mt-2">
        {dados.map((d) => <span key={d.rotulo} className="flex-1 text-center font-label-md text-label-md text-on-surface-variant">{d.rotulo}</span>)}
      </div>
    </Moldura>
  );
}

export function Indicador({ rotulo, valor, detalhe, destaque = false }) {
  return (
    <div className="cartao p-padding-card">
      <p className="font-label-md text-label-md text-on-surface-variant">{rotulo}</p>
      <p className={`mt-1 font-semibold break-words ${destaque ? 'text-[30px] leading-[38px] 2xl:text-[36px] 2xl:leading-[44px] text-primary' : 'text-[28px] leading-9 text-on-surface'}`}>{valor}</p>
      {detalhe && <p className="font-label-md text-label-md text-on-surface-variant mt-1">{detalhe}</p>}
    </div>
  );
}
