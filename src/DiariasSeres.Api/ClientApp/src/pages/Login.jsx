import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import api, { salvarSessao, sessaoValida } from '../api';
import { mascaraCpf } from '../lib/formato';
import { Alerta, Icone } from '../components/ui';

// Área pública (exposta em diarias.seap.pe.gov.br). Mesmos usuários e senhas do sistema da Carteira;
// o acesso depende do perfil concedido no módulo de Diárias.
export default function Login() {
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();
  const destino = useLocation().state?.de || '/painel';

  if (sessaoValida()) return <Navigate to="/painel" replace />;

  const entrar = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    const r = await api.login({ cpf, senha });
    setCarregando(false);
    if (!r.success) {
      setErro(r.message || 'Falha na autenticação.');
      return;
    }
    salvarSessao(r.data);
    navigate(destino, { replace: true });
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col justify-center items-center relative overflow-hidden">
      <div className="absolute inset-0 bg-institutional-pattern pointer-events-none" />
      <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary opacity-5 blur-[120px] rounded-full" />
      <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-secondary opacity-5 blur-[120px] rounded-full" />

      <main className="relative z-10 w-full max-w-[440px] px-4 sm:px-6 py-12">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 bg-white p-4 rounded-xl shadow-sm border border-outline-variant">
            <img alt="Brasão da Polícia Penal de Pernambuco" className="w-20 h-auto" src="/brasao-policia-penal-pe.png" />
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile sm:font-headline-lg sm:text-headline-lg text-primary text-center tracking-tight">SERES</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant text-center opacity-80">Sistema de Gestão de Diárias</p>
        </div>

        <div className="bg-surface-card rounded-xl border border-outline-variant shadow-md p-padding-card">
          <Alerta className="mb-6">{erro}</Alerta>

          <form onSubmit={entrar} className="flex flex-col gap-form-element-gap">
            <div className="flex flex-col gap-2">
              <label className="rotulo" htmlFor="cpf">CPF</label>
              <div className="relative flex items-center">
                <Icone nome="badge" className="absolute left-3 text-outline" />
                <input
                  id="cpf"
                  className="campo !pl-10 !py-3"
                  required
                  inputMode="numeric"
                  autoComplete="username"
                  value={cpf}
                  onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="rotulo" htmlFor="senha">Senha</label>
              <div className="relative flex items-center">
                <Icone nome="lock" className="absolute left-3 text-outline" />
                <input
                  id="senha"
                  className="campo !pl-10 !pr-12 !py-3"
                  required
                  autoComplete="current-password"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                />
                <button
                  type="button"
                  className="absolute right-3 text-outline hover:text-on-surface-variant"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <Icone nome={mostrarSenha ? 'visibility_off' : 'visibility'} />
                </button>
              </div>
            </div>

            <button className="btn-primario w-full !py-4 font-headline-sm text-headline-sm" type="submit" disabled={carregando}>
              {carregando ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Entrar <Icone nome="login" /></>
              )}
            </button>
          </form>

          <p className="mt-6 font-label-md text-label-md text-on-surface-variant text-center">
            Use o mesmo CPF e senha do sistema da Carteira Funcional. Sem acesso? Procure a administração da SERES.
          </p>
        </div>

        <div className="mt-8 flex justify-center items-center gap-2">
          <Icone nome="verified_user" className="text-sm text-outline" />
          <span className="font-label-md text-label-md text-on-surface-variant">Acesso restrito a servidores autorizados</span>
        </div>
      </main>

      <footer className="relative z-10 pb-8 w-full text-center">
        <p className="font-label-md text-label-md text-outline tracking-widest uppercase">Secretaria Executiva de Ressocialização</p>
        <p className="font-label-md text-label-md text-outline opacity-60 mt-1">Governo do Estado de Pernambuco</p>
      </footer>
    </div>
  );
}
