import React from 'react';
import { Selo } from './index';

export const SITUACOES = [
  { valor: 'VIGENTES', rotulo: 'Pendentes e aprovadas' },
  { valor: 'PENDENTE', rotulo: 'Pendentes de aprovação' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'REJEITADA', rotulo: 'Rejeitadas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' },
  { valor: '', rotulo: 'Todas' },
];

const ESTILO = {
  PENDENTE: ['amarelo', 'Pendente'],
  APROVADA: ['verde', 'Aprovada'],
  REJEITADA: ['vermelho', 'Rejeitada'],
  CANCELADA: ['neutro', 'Cancelada'],
};

export function SeloSituacao({ situacao }) {
  const [cor, rotulo] = ESTILO[situacao] || ['neutro', situacao];
  return <Selo cor={cor}>{rotulo}</Selo>;
}
