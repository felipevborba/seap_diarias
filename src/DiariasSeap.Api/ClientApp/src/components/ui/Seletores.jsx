import React, { useCallback } from 'react';
import api from '../../api';
import { fmtCpf } from '../../lib/formato';
import { AutoComplete } from './index';

export function SeletorServidor({ valor, onSelecionar, desabilitado, id }) {
  const buscar = useCallback(async (termo) => {
    const r = await api.get('/api/servidores/buscar', { termo });
    return r.success ? r.data : [];
  }, []);

  return (
    <AutoComplete
      id={id}
      valor={valor}
      onSelecionar={onSelecionar}
      buscar={buscar}
      desabilitado={desabilitado}
      placeholder="Nome, CPF ou matrícula (mín. 2 caracteres)"
      rotuloSelecionado={(s) => `${s.nome} · ${fmtCpf(s.cpf)}${s.matricula ? ` · Mat. ${s.matricula}` : ''}`}
      renderItem={(s) => (
        <div>
          <div className="font-semibold text-on-surface">{s.nome}</div>
          <div className="font-label-md text-label-md text-on-surface-variant">
            CPF {fmtCpf(s.cpf)}{s.matricula ? ` · Mat. ${s.matricula}` : ''} · {s.vinculo}{s.cargo ? ` · ${s.cargo}` : ''}
            {s.unidade ? ` · ${s.unidade}` : ''}
          </div>
        </div>
      )}
    />
  );
}

export function SeletorMunicipio({ valor, onSelecionar, desabilitado, id, placeholder = 'Buscar município' }) {
  const buscar = useCallback(async (busca) => {
    const r = await api.get('/api/localidades/municipios', { busca });
    return r.success ? r.data : [];
  }, []);

  return (
    <AutoComplete
      id={id}
      valor={valor}
      onSelecionar={onSelecionar}
      buscar={buscar}
      desabilitado={desabilitado}
      placeholder={placeholder}
      rotuloSelecionado={(m) => `${m.nome}/${m.uf}`}
      renderItem={(m) => <span>{m.nome}<span className="text-on-surface-variant">/{m.uf}</span></span>}
    />
  );
}
