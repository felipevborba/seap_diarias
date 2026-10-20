import React, { useEffect, useRef, useState } from 'react';
import { Icone } from './index';

// Campo de data sempre exibido como dd/mm/aaaa. O <input type="date"> nativo segue o idioma do sistema
// operacional (mm/dd/aaaa em máquinas em inglês), por isso o texto é nosso e o nativo só abre o calendário.
// Contrato igual ao do campo nativo: value e onChange trabalham com "aaaa-mm-dd" (ou "" quando vazio).

const doisDigitos = (n) => String(n).padStart(2, '0');

export function isoParaBr(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

export function brParaIso(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || '');
  if (!m) return null;
  const [, d, mes, a] = m.map(Number);
  const data = new Date(a, mes - 1, d);
  if (data.getFullYear() !== a || data.getMonth() !== mes - 1 || data.getDate() !== d) return null;
  return `${a}-${doisDigitos(mes)}-${doisDigitos(d)}`;
}

const mascara = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');

export default function CampoData({ value, onChange, min, max, required, disabled, id, className = '', 'aria-label': rotulo }) {
  const [texto, setTexto] = useState(isoParaBr(value));
  const [invalida, setInvalida] = useState(false);
  const nativo = useRef(null);

  useEffect(() => { setTexto(isoParaBr(value)); setInvalida(false); }, [value]);

  const emitir = (iso) => onChange?.({ target: { value: iso, type: 'date' } });

  const digitar = (e) => {
    const t = mascara(e.target.value);
    setTexto(t);
    if (t === '') { setInvalida(false); emitir(''); return; }
    if (t.length === 10) {
      const iso = brParaIso(t);
      setInvalida(!iso);
      if (iso) emitir(iso);
    }
  };

  const sair = () => {
    if (texto && !brParaIso(texto)) setInvalida(true);
  };

  return (
    <div className="relative">
      <input
        id={id}
        className={`campo !pr-10 tabular ${invalida ? '!border-error focus:!ring-error' : ''} ${className}`}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        onChange={digitar}
        onBlur={sair}
        required={required}
        disabled={disabled}
        aria-label={rotulo}
        aria-invalid={invalida || undefined}
        title={invalida ? 'Data inválida (use dd/mm/aaaa)' : undefined}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-icone !p-1"
        onClick={() => { try { nativo.current?.showPicker(); } catch { nativo.current?.focus(); } }}
        aria-label="Abrir calendário"
      >
        <Icone nome="calendar_month" className="text-xl" />
      </button>
      <input
        ref={nativo}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => emitir(e.target.value)}
      />
    </div>
  );
}
