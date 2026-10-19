import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export function Icone({ nome, className = '', preenchido = false }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={preenchido ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {nome}
    </span>
  );
}

export function CabecalhoPagina({ titulo, subtitulo, acoes }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="font-headline-md text-headline-md text-primary">{titulo}</h2>
        {subtitulo && <p className="font-body-md text-body-md text-on-surface-variant mt-1">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Alerta({ tipo = 'erro', children, className = '' }) {
  if (!children) return null;
  const estilos = {
    erro: 'bg-error/10 border-error/30 text-error',
    sucesso: 'bg-status-success/10 border-status-success/30 text-status-success',
    aviso: 'bg-status-warning/15 border-status-warning/50 text-on-surface',
    info: 'bg-primary-fixed/40 border-primary-fixed-dim text-on-primary-fixed-variant',
  };
  const icones = { erro: 'error', sucesso: 'check_circle', aviso: 'warning', info: 'info' };
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`border px-4 py-3 rounded-lg font-body-md text-body-md flex items-start gap-3 ${estilos[tipo]} ${className}`}>
      <Icone nome={icones[tipo]} className="flex-shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Carregando({ texto = 'Carregando...' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="font-body-md text-body-md">{texto}</span>
    </div>
  );
}

export function Vazio({ icone = 'inbox', texto, acao }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-12 text-on-surface-variant">
      <Icone nome={icone} className="text-4xl text-outline" />
      <p className="font-body-md text-body-md">{texto}</p>
      {acao}
    </div>
  );
}

export function Campo({ rotulo, erro, children, className = '', dica }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo && <span className="rotulo">{rotulo}</span>}
      {children}
      {dica && !erro && <span className="font-label-md text-label-md text-on-surface-variant px-1 normal-case">{dica}</span>}
      {erro && <span className="font-label-md text-label-md text-error px-1">{erro}</span>}
    </label>
  );
}

export function Selo({ cor = 'neutro', children }) {
  const cores = {
    neutro: 'bg-surface-container-high text-on-surface-variant',
    verde: 'bg-secondary-container text-on-secondary-container',
    vermelho: 'bg-error-container text-on-error-container',
    azul: 'bg-primary-fixed text-on-primary-fixed-variant',
    amarelo: 'bg-status-warning/20 text-on-surface',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-md text-label-md whitespace-nowrap ${cores[cor]}`}>{children}</span>;
}

export function Paginacao({ pagina, totalPaginas, totalItens, onMudar }) {
  if (!totalItens) return null;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-outline-variant/60">
      <span className="font-label-md text-label-md text-on-surface-variant">
        {totalItens} registro{totalItens === 1 ? '' : 's'} · página {pagina} de {Math.max(totalPaginas, 1)}
      </span>
      <div className="flex gap-1">
        <button type="button" className="btn-icone" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)} aria-label="Página anterior">
          <Icone nome="chevron_left" />
        </button>
        <button type="button" className="btn-icone" disabled={pagina >= totalPaginas} onClick={() => onMudar(pagina + 1)} aria-label="Próxima página">
          <Icone nome="chevron_right" />
        </button>
      </div>
    </div>
  );
}

export function Modal({ aberto, titulo, onFechar, children, rodape, largura = 'max-w-lg' }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-inverse-surface/50" onClick={onFechar} />
      <div className={`relative bg-surface-card w-full ${largura} rounded-t-xl sm:rounded-xl shadow-xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h3 className="font-headline-sm text-headline-sm text-primary">{titulo}</h3>
          <button type="button" className="btn-icone" onClick={onFechar} aria-label="Fechar"><Icone nome="close" /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-outline-variant flex justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------- Avisos rápidos (toasts) ----------
const AvisoContext = createContext(() => {});

export function AvisoProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((mensagem, tipo = 'sucesso') => {
    const id = Math.random();
    setAvisos((a) => [...a, { id, mensagem, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 4000);
  }, []);
  return (
    <AvisoContext.Provider value={avisar}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[70] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {avisos.map((a) => (
          <Alerta key={a.id} tipo={a.tipo} className="shadow-lg bg-surface-card">{a.mensagem}</Alerta>
        ))}
      </div>
    </AvisoContext.Provider>
  );
}

export const useAviso = () => useContext(AvisoContext);

// ---------- Autocomplete genérico (servidor, município) ----------
export function AutoComplete({ valor, onSelecionar, buscar, renderItem, rotuloSelecionado, placeholder, desabilitado, id }) {
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const t = setTimeout(async () => {
      if (termo.trim().length < 2) { setItens([]); return; }
      setItens(await buscar(termo));
      setAtivo(0);
    }, 250);
    return () => clearTimeout(t);
  }, [termo, aberto, buscar]);

  useEffect(() => {
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const escolher = (item) => {
    onSelecionar(item);
    setTermo('');
    setAberto(false);
  };

  if (valor) {
    return (
      <div className="campo flex items-center justify-between gap-2 !py-2">
        <span className="truncate">{rotuloSelecionado(valor)}</span>
        {!desabilitado && (
          <button type="button" className="btn-icone !p-1" onClick={() => onSelecionar(null)} aria-label="Limpar seleção">
            <Icone nome="close" className="text-lg" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={caixa}>
      <input
        id={id}
        className="campo"
        value={termo}
        disabled={desabilitado}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, itens.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && itens[ativo]) { e.preventDefault(); escolher(itens[ativo]); }
        }}
      />
      {aberto && termo.trim().length >= 2 && (
        <ul className="absolute z-30 mt-1 w-full bg-surface-card border border-outline-variant rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {itens.length === 0 && <li className="px-4 py-3 text-on-surface-variant font-body-md text-body-md">Nenhum resultado.</li>}
          {itens.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full text-left px-4 py-2.5 font-body-md text-body-md ${i === ativo ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'}`}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(item)}
              >
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
