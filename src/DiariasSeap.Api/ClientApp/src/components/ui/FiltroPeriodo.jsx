import React from 'react';
import CampoData from './CampoData';

// Filtro de período dos painéis: intervalo (atalhos ou personalizado) + qual data considerar
// (data da diária = período da viagem; data do cadastro = quando foi lançada).

const hoje = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const PRESETS = {
  mes: { rotulo: 'Este mês', de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) },
  ano: { rotulo: 'Este ano', de: `${hoje.getFullYear()}-01-01`, ate: `${hoje.getFullYear()}-12-31` },
  anoAnterior: { rotulo: 'Ano passado', de: `${hoje.getFullYear() - 1}-01-01`, ate: `${hoje.getFullYear() - 1}-12-31` },
  doze: { rotulo: 'Últimos 12 meses', de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) },
  tudo: { rotulo: 'Todo o histórico', de: '', ate: '' },
};

/** Converte o estado do filtro em parâmetros da API (dataInicio/dataFim ou cadastroInicio/cadastroFim). */
export function periodoParaFiltro({ preset, base, de, ate }) {
  const [ini, fim] = preset === 'custom' ? [de, ate] : [PRESETS[preset]?.de ?? '', PRESETS[preset]?.ate ?? ''];
  return base === 'cadastro'
    ? { cadastroInicio: ini, cadastroFim: fim, situacao: 'VIGENTES' }
    : { dataInicio: ini, dataFim: fim, situacao: 'VIGENTES' };
}

export function FiltroPeriodo({ valor, onChange, className = '', children }) {
  const set = (k) => (e) => onChange({ ...valor, [k]: e.target.value, ...(k === 'preset' && e.target.value !== 'custom' ? { de: '', ate: '' } : {}) });
  const [de, ate] = valor.preset === 'custom' ? [valor.de, valor.ate] : [PRESETS[valor.preset]?.de, PRESETS[valor.preset]?.ate];
  return (
    <div className={`cartao p-4 flex flex-wrap items-end gap-3 ${className}`}>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo">Considerar</span>
        <select className="campo !w-56" value={valor.base} onChange={set('base')}>
          <option value="diaria">Data da diária (viagem)</option>
          <option value="cadastro">Data do cadastro (lançamento)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo">Período</span>
        <select className="campo !w-52" value={valor.preset} onChange={set('preset')}>
          {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.rotulo}</option>)}
          <option value="custom">Personalizado</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo">De</span>
        <CampoData value={de || ''} onChange={(e) => onChange({ ...valor, preset: 'custom', de: e.target.value, ate: valor.preset === 'custom' ? valor.ate : (ate || '') })} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo">Até</span>
        <CampoData value={ate || ''} min={de} onChange={(e) => onChange({ ...valor, preset: 'custom', ate: e.target.value, de: valor.preset === 'custom' ? valor.de : (de || '') })} />
      </label>
      {children}
    </div>
  );
}
