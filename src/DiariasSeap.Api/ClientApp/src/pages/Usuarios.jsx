import React, { useState } from 'react';
import api, { getUsuario } from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Paginacao, Selo, Vazio, useAviso } from '../components/ui';
import { PERFIS, fmtCpf, mascaraCpf, rotuloPerfil } from '../lib/formato';
import { useDados } from '../lib/useDados';

export default function Usuarios() {
  const avisar = useAviso();
  const eu = getUsuario()?.usuarioId;
  const [busca, setBusca] = useState('');
  const [aplicado, setAplicado] = useState({ busca: '', somenteComAcesso: true });
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro, recarregar } = useDados('/api/usuarios', { ...aplicado, page: pagina, pageSize: 20 });
  const config = useDados('/api/usuarios/configuracao').dados;
  const [novo, setNovo] = useState(null);
  const [erroForm, setErroForm] = useState('');

  const definirPerfil = async (u, perfil) => {
    const r = await api.put(`/api/usuarios/${u.id}/perfil`, { perfil: perfil || null });
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) recarregar();
  };

  const criar = async (e) => {
    e.preventDefault();
    const r = await api.post('/api/usuarios', novo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setNovo(null);
    recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e acessos"
        subtitulo="Os usuários são os mesmos do sistema da Carteira Funcional. Aqui você concede ou revoga o acesso às Diárias."
        acoes={config?.criacaoPermitida && (
          <button type="button" className="btn-primario" onClick={() => { setErroForm(''); setNovo({ nome: '', cpf: '', matricula: '', senha: '', perfil: 'OPERADOR' }); }}>
            <Icone nome="person_add" /> Novo usuário
          </button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {PERFIS.map((p) => (
          <div key={p.valor} className="cartao px-4 py-3">
            <p className="font-body-md text-body-md font-semibold">{p.rotulo}</p>
            <p className="font-label-md text-label-md text-on-surface-variant">{p.descricao}</p>
          </div>
        ))}
      </div>

      <form className="cartao p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-end"
        onSubmit={(e) => { e.preventDefault(); setAplicado({ ...aplicado, busca }); setPagina(1); }}>
        <label className="flex-1 flex flex-col gap-1.5"><span className="rotulo">Busca</span>
          <input className="campo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF ou matrícula" /></label>
        <select className="campo sm:!w-auto" value={String(aplicado.somenteComAcesso)} aria-label="Exibir"
          onChange={(e) => { setAplicado({ ...aplicado, somenteComAcesso: e.target.value === 'true' }); setPagina(1); }}>
          <option value="true">Com acesso às Diárias</option>
          <option value="false">Todos os usuários (conceder acesso)</option>
        </select>
        <button className="btn-primario" type="submit"><Icone nome="search" /> Buscar</button>
      </form>

      <Alerta className="mb-4">{erro}</Alerta>
      <div className="cartao overflow-hidden">
        {carregando && !dados ? <Carregando /> : !dados?.items.length ? <Vazio icone="group" texto="Nenhum usuário encontrado." /> : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Perfil nas Diárias</th></tr></thead>
                <tbody>
                  {dados.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="font-semibold">{u.nome}</div>
                        {u.administradorGeral && <span className="font-label-md text-label-md text-on-surface-variant">Administrador geral (Carteira)</span>}
                      </td>
                      <td className="tabular whitespace-nowrap">{fmtCpf(u.cpf)}</td>
                      <td className="tabular">{u.matricula || '—'}</td>
                      <td>
                        {u.id === eu ? <Selo cor="azul">{rotuloPerfil(u.perfil)} (você)</Selo> : (
                          <select className="campo !py-1.5 !w-auto" value={u.perfil || ''} aria-label={`Perfil de ${u.nome}`}
                            onChange={(e) => definirPerfil(u, e.target.value)}>
                            <option value="">Sem acesso</option>
                            {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={dados.page} totalPaginas={dados.totalPages} totalItens={dados.totalItems} onMudar={setPagina} />
          </>
        )}
      </div>

      <Modal aberto={!!novo} titulo="Novo usuário" onFechar={() => setNovo(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setNovo(null)}>Cancelar</button>
          <button type="submit" form="form-usuario" className="btn-primario"><Icone nome="save" /> Criar</button></>}>
        {novo && (
          <form id="form-usuario" onSubmit={criar} className="grid grid-cols-2 gap-form-element-gap">
            <Alerta className="col-span-2">{erroForm}</Alerta>
            <Alerta tipo="aviso" className="col-span-2">O usuário é criado na base compartilhada e usa o mesmo login da Carteira Funcional.</Alerta>
            <Campo rotulo="Nome *" className="col-span-2"><input className="campo" required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
            <Campo rotulo="CPF *"><input className="campo" required value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: mascaraCpf(e.target.value) })} /></Campo>
            <Campo rotulo="Matrícula"><input className="campo" value={novo.matricula} onChange={(e) => setNovo({ ...novo, matricula: e.target.value })} /></Campo>
            <Campo rotulo="Senha inicial *" dica="Mínimo 6 caracteres"><input type="password" className="campo" required minLength={6} value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} /></Campo>
            <Campo rotulo="Perfil *">
              <select className="campo" value={novo.perfil} onChange={(e) => setNovo({ ...novo, perfil: e.target.value })}>
                {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </Campo>
          </form>
        )}
      </Modal>
    </>
  );
}
