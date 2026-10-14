import React, { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { getUsuario, logout, sessaoValida } from '../../api';
import { rotuloPerfil } from '../../lib/formato';
import { Icone } from '../ui';

// Menu por perfil: ADMIN vê tudo; OPERADOR lança; CONSULTA só consulta.
const MENU = [
  { secao: 'Operação' },
  { para: '/painel', icone: 'dashboard', rotulo: 'Painel' },
  { para: '/diarias', icone: 'flight_takeoff', rotulo: 'Diárias' },
  { para: '/diarias/nova', icone: 'add_circle', rotulo: 'Lançar Diária', perfis: ['ADMIN', 'OPERADOR'] },
  { para: '/relatorios', icone: 'monitoring', rotulo: 'Relatórios' },
  { secao: 'Cadastros' },
  { para: '/servidores', icone: 'badge', rotulo: 'Servidores' },
  { para: '/tabela-valores', icone: 'payments', rotulo: 'Tabela de Valores' },
  { para: '/regioes', icone: 'map', rotulo: 'Regiões' },
  { para: '/cargos', icone: 'work', rotulo: 'Cargos', perfis: ['ADMIN'] },
  { secao: 'Administração', perfis: ['ADMIN'] },
  { para: '/usuarios', icone: 'group', rotulo: 'Usuários e Acessos', perfis: ['ADMIN'] },
  { para: '/auditoria', icone: 'history', rotulo: 'Auditoria', perfis: ['ADMIN'] },
];

export function usePerfil() {
  return getUsuario()?.perfil;
}

export function Permitido({ perfis, children }) {
  const perfil = usePerfil();
  return !perfis || perfis.includes(perfil) ? children : null;
}

function Sidebar({ aberta, onFechar }) {
  const perfil = usePerfil();
  const classe = ({ isActive }) =>
    `rounded-lg mx-2 px-4 py-2.5 flex items-center gap-3 transition-all ${
      isActive
        ? 'bg-secondary-container text-on-secondary-container font-bold'
        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
    }`;

  return (
    <>
      {aberta && <div className="fixed inset-0 bg-inverse-surface/40 z-40 lg:hidden" onClick={onFechar} />}
      <aside
        className={`fixed left-0 top-0 h-full w-[272px] bg-surface-container-lowest shadow-md flex flex-col py-6 z-50 transition-transform lg:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 mb-6 flex items-center gap-3">
          <img alt="Brasão da Polícia Penal de Pernambuco" className="w-11 h-11 object-contain flex-shrink-0" src="/brasao-policia-penal-pe.png" />
          <div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-primary leading-tight">SERES</h1>
            <p className="font-label-md text-label-md text-on-surface-variant">Gestão de Diárias</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto space-y-0.5" onClick={onFechar}>
          {MENU.filter((m) => !m.perfis || m.perfis.includes(perfil)).map((m) =>
            m.secao ? (
              <p key={m.secao} className="px-6 pt-4 pb-1 font-label-md text-label-md uppercase tracking-wider text-outline">{m.secao}</p>
            ) : (
              <NavLink key={m.para} to={m.para} end={m.para === '/diarias'} className={classe}>
                <Icone nome={m.icone} />
                <span className="font-body-md text-body-md">{m.rotulo}</span>
              </NavLink>
            )
          )}
        </nav>
        <div className="mt-2 border-t border-outline-variant pt-3">
          <button type="button" onClick={() => logout()} className="w-[calc(100%-1rem)] text-status-error hover:bg-error-container/30 transition-colors rounded-lg mx-2 px-4 py-2.5 flex items-center gap-3">
            <Icone nome="logout" />
            <span className="font-body-md text-body-md">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function TopBar({ onMenu }) {
  const u = getUsuario() || {};
  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur shadow-sm h-16 flex justify-between items-center px-4 md:px-margin-page border-b border-outline-variant/30">
      <button type="button" className="btn-icone lg:hidden" onClick={onMenu} aria-label="Abrir menu"><Icone nome="menu" /></button>
      <div className="hidden lg:block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
        Secretaria Executiva de Ressocialização
      </div>
      <div className="flex items-center gap-3 text-right">
        <div className="min-w-0">
          <p className="font-label-md text-label-md font-bold text-on-surface truncate max-w-[180px] sm:max-w-none">{u.nome}</p>
          <p className="font-label-md text-label-md text-on-surface-variant">{rotuloPerfil(u.perfil)}{u.matricula ? ` · Mat. ${u.matricula}` : ''}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center flex-shrink-0">
          <Icone nome="person" />
        </div>
      </div>
    </header>
  );
}

/** Área de gestão: exige sessão válida (o CarteiraPenal confia só no 401; aqui também protegemos a rota). */
export default function Layout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  if (!sessaoValida()) return <Navigate to="/" replace state={{ de: local.pathname }} />;

  return (
    <div className="bg-background text-on-surface min-h-screen">
      <Sidebar aberta={menuAberto} onFechar={() => setMenuAberto(false)} />
      <main className="lg:ml-[272px] min-h-screen flex flex-col">
        <TopBar onMenu={() => setMenuAberto(true)} />
        <div className="p-4 md:p-margin-page flex-1 w-full max-w-[1400px] mx-auto">
          <Outlet />
        </div>
        <footer className="border-t border-outline-variant py-5 px-4 md:px-margin-page text-center md:text-left">
          <p className="font-label-md text-label-md text-on-surface-variant">
            © {new Date().getFullYear()} SEAP/SERES · Governo de Pernambuco · Sistema de Diárias
          </p>
        </footer>
      </main>
    </div>
  );
}
