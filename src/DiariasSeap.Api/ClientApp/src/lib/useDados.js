import { useCallback, useEffect, useState } from 'react';
import api from '../api';

/** Carrega um endpoint GET e expõe { dados, carregando, erro, recarregar }. */
export function useDados(url, params) {
  const chave = JSON.stringify(params || {});
  const [estado, setEstado] = useState({ dados: null, carregando: true, erro: '' });

  const recarregar = useCallback(async () => {
    setEstado((e) => ({ ...e, carregando: true, erro: '' }));
    const r = await api.get(url, JSON.parse(chave));
    setEstado({ dados: r.success ? r.data : null, carregando: false, erro: r.success ? '' : r.message });
  }, [url, chave]);

  useEffect(() => { recarregar(); }, [recarregar]);
  return { ...estado, recarregar };
}

/** Listas de apoio usadas em filtros e formulários. */
export const useUnidades = () => useDados('/api/localidades/unidades').dados || [];
export const useTipos = (somenteAtivos = false) => useDados('/api/cadastros/tipos', { somenteAtivos }).dados || [];
export const useCargos = (somenteAtivos = false) => useDados('/api/cadastros/cargos', { somenteAtivos }).dados || [];
export const useRegioes = () => useDados('/api/cadastros/regioes').dados || [];
