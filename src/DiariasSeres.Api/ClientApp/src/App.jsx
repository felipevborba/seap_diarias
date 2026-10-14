import React from 'react';
import { Navigate, useRoutes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { AvisoProvider } from './components/ui';
import Login from './pages/Login';
import Painel from './pages/Painel';
import Diarias from './pages/Diarias';
import DiariaForm from './pages/DiariaForm';
import DiariaDetalhe from './pages/DiariaDetalhe';
import Relatorios from './pages/Relatorios';
import Servidores from './pages/Servidores';
import TabelaValores from './pages/TabelaValores';
import Regioes from './pages/Regioes';
import Cargos from './pages/Cargos';
import Usuarios from './pages/Usuarios';
import Auditoria from './pages/Auditoria';

const rotas = [
  // Área pública: somente o login.
  { index: true, element: <Login /> },
  // Área de gestão (exige sessão).
  {
    element: <Layout />,
    children: [
      { path: '/painel', element: <Painel /> },
      { path: '/diarias', element: <Diarias /> },
      { path: '/diarias/nova', element: <DiariaForm /> },
      { path: '/diarias/:id', element: <DiariaDetalhe /> },
      { path: '/diarias/:id/editar', element: <DiariaForm /> },
      { path: '/relatorios', element: <Relatorios /> },
      { path: '/servidores', element: <Servidores /> },
      { path: '/tabela-valores', element: <TabelaValores /> },
      { path: '/regioes', element: <Regioes /> },
      { path: '/cargos', element: <Cargos /> },
      { path: '/usuarios', element: <Usuarios /> },
      { path: '/auditoria', element: <Auditoria /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export default function App() {
  return <AvisoProvider>{useRoutes(rotas)}</AvisoProvider>;
}
