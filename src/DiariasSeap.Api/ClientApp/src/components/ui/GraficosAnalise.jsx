import React, { useMemo, useRef, useState } from 'react';
import { fmtMoeda, fmtNumero } from '../../lib/formato';

// Cores validadas (dataviz/validate_palette): série única no azul institucional; classes ABC como
// rampa ordinal de um só matiz (A escuro -> C claro), sempre acompanhadas da letra da classe.
export const COR_SERIE = '#2f62b8';
export const COR_CLASSE = { A: '#104281', B: '#2a78d6', C: '#86b6ef' };
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCompacto = (v) => `R$ ${compacto.format(v)}`;

function topoEscala(max) {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / p) * p;
}

/** Colunas no tempo (mês ou ano). Clique numa coluna = drill para aquele período. */
export function ColunasSerie({ pontos, onSelecionar, selecionado }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...pontos.map((p) => p.valor), 0);
  const topo = topoEscala(max);
  const maior = pontos.reduce((a, p) => (p.valor > (a?.valor ?? -1) ? p : a), null);
  const rotular = pontos.length <= 16 ? () => true : (i) => i % Math.ceil(pontos.length / 12) === 0;

  if (max === 0) return <p className="font-body-md text-body-md text-on-surface-variant py-10 text-center">Sem valores no período.</p>;
  return (
    <div>
      <div className="relative h-52 pl-16">
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute left-16 right-0 border-t border-surface-container-high" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-16 -translate-y-1/2 w-14 text-right whitespace-nowrap font-label-md text-label-md text-on-surface-variant tabular">{fmtCompacto(topo * f)}</span>
          </div>
        ))}
        <div className="absolute left-16 right-0 top-0 bottom-0 flex items-end">
          {pontos.map((p) => {
            const ativo = selecionado === p.chave;
            return (
              <button
                type="button"
                key={p.chave}
                className="relative flex-1 h-full flex items-end justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                onMouseEnter={() => setHover(p.chave)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelecionar?.(p)}
                aria-label={`${p.rotulo}: ${fmtMoeda(p.valor)}. Filtrar este período`}
              >
                {p === maior && (
                  <span className="absolute font-label-md text-label-md text-on-surface tabular whitespace-nowrap" style={{ bottom: `calc(${(p.valor / topo) * 100}% + 4px)` }}>
                    {fmtCompacto(p.valor)}
                  </span>
                )}
                <span className="block w-[min(24px,70%)] rounded-t-[4px] transition-opacity"
                  style={{ height: `${(p.valor / topo) * 100}%`, minHeight: p.valor > 0 ? 2 : 0, background: COR_SERIE,
                    opacity: (hover && hover !== p.chave) || (selecionado && !ativo) ? 0.4 : 1 }} />
                {hover === p.chave && (
                  <span className="pointer-events-none absolute z-20 bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-inverse-surface text-inverse-on-surface px-3 py-2 shadow-lg font-label-md text-label-md text-left">
                    <span className="block font-semibold">{p.rotulo}</span>
                    <span className="block tabular">{fmtMoeda(p.valor)} · {fmtNumero(p.diarias)} diárias</span>
                    <span className="block opacity-80">Clique para filtrar</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex pl-16 mt-2">
        {pontos.map((p, i) => (
          <span key={p.chave} className="flex-1 text-center font-label-md text-label-md text-on-surface-variant truncate">{rotular(i) ? p.rotulo : ''}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Curva ABC (Pareto acumulado): eixo X = % dos itens (do maior para o menor), eixo Y = % acumulado do valor.
 * Um único eixo percentual; as faixas A/B/C são mostradas pelos limites de 80% e 95% do valor.
 */
export function CurvaAbc({ curva, classes }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const L = 44, R = 12, T = 12, B = 30, W = 560, H = 240;
  const x = (v) => L + (v / 100) * (W - L - R);
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const caminho = useMemo(() => curva.map((p, i) => `${i ? 'L' : 'M'}${x(p.percentualItens).toFixed(1)},${y(p.percentualValor).toFixed(1)}`).join(' '), [curva]);
  // Fronteiras das classes no eixo X (fim da classe A e da B).
  const fimA = classes.find((c) => c.classe === 'A')?.percentualItens ?? 0;
  const fimB = fimA + (classes.find((c) => c.classe === 'B')?.percentualItens ?? 0);

  const mover = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const pct = Math.min(100, Math.max(0, ((px - L) / (W - L - R)) * 100));
    let melhor = curva[0];
    for (const p of curva) if (Math.abs(p.percentualItens - pct) < Math.abs(melhor.percentualItens - pct)) melhor = p;
    setHover(melhor);
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
        aria-label={`Curva ABC: classe A reúne ${fimA.toFixed(1)}% dos itens e 80% do valor`}
        onMouseMove={mover} onMouseLeave={() => setHover(null)}>
        {/* faixas das classes no eixo X */}
        {[['A', 0, fimA], ['B', fimA, fimB], ['C', fimB, 100]].map(([c, a, b]) => (
          <g key={c}>
            <rect x={x(a)} y={T} width={Math.max(0, x(b) - x(a))} height={H - T - B} fill={COR_CLASSE[c]} opacity={0.08} />
            {b - a > 6 && <text x={(x(a) + x(b)) / 2} y={H - B - 8} textAnchor="middle" className="fill-on-surface-variant" fontSize="12" fontWeight="600">Classe {c}</text>}
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e3e2e7" strokeWidth="1" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-on-surface-variant">{v}%</text>
            <text x={x(v)} y={H - B + 16} textAnchor="middle" fontSize="11" className="fill-on-surface-variant">{v}%</text>
          </g>
        ))}
        {[80, 95].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#747780" strokeWidth="1" strokeDasharray="0" opacity="0.5" />
            <text x={L + 6} y={y(v) - 4} textAnchor="start" fontSize="11" className="fill-on-surface-variant">{v}% do valor</text>
          </g>
        ))}
        <path d={caminho} fill="none" stroke={COR_SERIE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <g>
            <line x1={x(hover.percentualItens)} x2={x(hover.percentualItens)} y1={T} y2={H - B} stroke="#43474f" strokeWidth="1" />
            <circle cx={x(hover.percentualItens)} cy={y(hover.percentualValor)} r="5" fill={COR_SERIE} stroke="#fff" strokeWidth="2" />
          </g>
        )}
        <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" fontSize="11" className="fill-on-surface-variant">% dos itens, do maior para o menor valor</text>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute top-2 left-14 rounded-lg bg-inverse-surface text-inverse-on-surface px-3 py-2 shadow-lg font-label-md text-label-md">
          {fmtNumero(hover.percentualItens)}% dos itens concentram <span className="font-semibold">{fmtNumero(hover.percentualValor)}%</span> do valor
        </div>
      )}
    </div>
  );
}

export function SeloClasse({ classe }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md font-label-md text-label-md font-bold text-white" style={{ background: COR_CLASSE[classe] }}
      title={`Classe ${classe}`}>
      <span className={classe === 'C' ? 'text-primary' : ''}>{classe}</span>
    </span>
  );
}
