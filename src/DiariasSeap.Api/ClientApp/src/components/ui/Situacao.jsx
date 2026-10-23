import React from 'react';
import { Selo } from './index';

// Sem etapa de aprovação: lançar = aprovar. Pendentes, rejeitadas e canceladas só existem em registros antigos.
export const SITUACOES = [
  { valor: 'VIGENTES', rotulo: 'Vigentes' },
  { valor: 'CANCELADA', rotulo: 'Canceladas (versão anterior)' },
  { valor: 'REJEITADA', rotulo: 'Rejeitadas (versão anterior)' },
  { valor: '', rotulo: 'Todas' },
];

const ESTILO = {
  PENDENTE: ['amarelo', 'Pendente'],
  APROVADA: ['verde', 'Lançada'],
  REJEITADA: ['vermelho', 'Rejeitada'],
  CANCELADA: ['neutro', 'Cancelada'],
};

export function SeloSituacao({ situacao }) {
  const [cor, rotulo] = ESTILO[situacao] || ['neutro', situacao];
  return <Selo cor={cor}>{rotulo}</Selo>;
}
