import React, { useState } from 'react';
import api, { getUsuario } from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Paginacao, Selo, Vazio, useAviso } from '../components/ui';
import { PERFIS, fmtCpf, mascaraCpf, rotuloPerfil } from '../lib/formato';
import { useDados } from '../lib/useDados';

// Usuários são os mesmos do sistema da Carteira (public.usuario): nome, CPF, matrícula e senha valem para os dois.
export default function Usuarios() {
  const avisar = useAviso();
  const eu = getUsuario()?.usuarioId;
  const [busca, setBusca] = useState('');
  const [aplicado, setAplicado] = useState({ busca: '', somenteComAcesso: true });
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro, recarregar } = useDados('/api/usuarios', { ...aplicado, page: pagina, pageSize: 20 });
  const config = useDados('/api/usuarios/configuracao').dados;
  const [form, setForm] = useState(null); // { id?, nome, cpf, matricula, senha, perfil }
  const [excluir, setExcluir] = useState(null);
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);

  const definirPerfil = async (u, perfil) => {
    const r = await api.put(`/api/usuarios/${u.id}/perfil`, { perfil: perfil || null });
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) recarregar();
  };

  const abrirNovo = () => { setErroForm(''); setForm({ nome: '', cpf: '', matricula: '', senha: '', perfil: 'OPERADOR' }); };
  const abrirEdicao = (u) => { setErroForm(''); setForm({ id: u.id, nome: u.nome, cpf: fmtCpf(u.cpf || ''), matricula: u.matricula || '', senha: '', perfil: u.perfil || '', proprio: u.id === eu, administradorGeral: u.administradorGeral }); };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    const r = form.id
      ? await api.put(`/api/usuarios/${form.id}`, { nome: form.nome, cpf: form.cpf, matricula: form.matricula, novaSenha: form.senha || null, perfil: form.proprio ? null : (form.perfil || '') })
      : await api.post('/api/usuarios', { nome: form.nome, cpf: form.cpf, matricula: form.matricula, senha: form.senha, perfil: form.perfil });
    setSalvando(false);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  const confirmarExclusao = async () => {
    const r = await api.del(`/api/usuarios/${excluir.id}`);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    setExcluir(null);
    if (r.success) recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e acessos"
        subtitulo="Os usuários são os mesmos do sistema da Carteira Funcional. Aqui você cadastra, edita, concede ou remove o acesso às Diárias."
        acoes={config?.criacaoPermitida && (
          <button type="button" className="btn-primario" onClick={abrirNovo}><Icone nome="person_add" /> Novo usuário</button>
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
                <thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Perfil nas Diárias</th><th className="text-right">Ações</th></tr></thead>
                <tbody>
                  {dados.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="font-semibold">{u.nome}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {u.administradorGeral && <Selo cor="azul">Administrador geral (Carteira)</Selo>}
                          {u.criadoPelasDiarias && <Selo>Cadastrado nas Diárias</Selo>}
                        </div>
                      </td>
                      <td className="tabular whitespace-nowrap">{u.cpf ? fmtCpf(u.cpf) : '—'}</td>
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
                      <td className="text-right whitespace-nowrap">
                        <button type="button" className="btn-icone" onClick={() => abrirEdicao(u)} aria-label={`Editar ${u.nome}`} title="Editar"><Icone nome="edit" /></button>
                        {u.id !== eu && !u.administradorGeral && (
                          <button type="button" className="btn-icone hover:!text-error" onClick={() => setExcluir(u)} aria-label={`Excluir ${u.nome}`}
                            title={u.criadoPelasDiarias ? 'Excluir usuário' : 'Remover acesso às Diárias'}>
                            <Icone nome={u.criadoPelasDiarias ? 'delete' : 'person_remove'} />
                          </button>
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

      <Modal aberto={!!form} titulo={form?.id ? 'Editar usuário' : 'Novo usuário'} onFechar={() => setForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-usuario" className="btn-primario" disabled={salvando}><Icone nome="save" /> {form?.id ? 'Salvar' : 'Criar'}</button></>}>
        {form && (
          <form id="form-usuario" onSubmit={salvar} className="grid grid-cols-2 gap-form-element-gap">
            <Alerta className="col-span-2">{erroForm}</Alerta>
            <Alerta tipo="aviso" className="col-span-2">
              {form.id
                ? 'Nome, CPF, matrícula e senha são compartilhados com o sistema da Carteira: a alteração vale para os dois.'
                : 'O usuário é criado na base compartilhada e usa o mesmo login (CPF e senha) da Carteira Funcional.'}
            </Alerta>
            <Campo rotulo="Nome *" className="col-span-2"><input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
            <Campo rotulo="CPF (login) *"><input className="campo tabular" required inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })} /></Campo>
            <Campo rotulo="Matrícula"><input className="campo" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} /></Campo>
            <Campo rotulo={form.id ? 'Nova senha' : 'Senha inicial *'} dica={form.id ? 'Deixe em branco para manter a atual' : 'Mínimo 6 caracteres'}>
              <input type="password" className="campo" required={!form.id} minLength={6} autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            </Campo>
            <Campo rotulo="Perfil nas Diárias" dica={form.proprio ? 'Você não pode alterar o seu próprio perfil' : undefined}>
              <select className="campo" value={form.perfil} disabled={form.proprio} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
                {form.id && <option value="">Sem acesso</option>}
                {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </Campo>
          </form>
        )}
      </Modal>

      <Modal aberto={!!excluir} titulo={excluir?.criadoPelasDiarias ? 'Excluir usuário' : 'Remover acesso às Diárias'} onFechar={() => setExcluir(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setExcluir(null)}>Cancelar</button>
          <button type="button" className="btn-perigo" onClick={confirmarExclusao}>{excluir?.criadoPelasDiarias ? 'Excluir' : 'Remover acesso'}</button></>}>
        {excluir && (
          <p className="font-body-md text-body-md">
            {excluir.criadoPelasDiarias
              ? <>O usuário <strong>{excluir.nome}</strong> foi cadastrado pelas Diárias e será excluído da base. As diárias que ele lançou continuam registradas com o nome dele.</>
              : <>O usuário <strong>{excluir.nome}</strong> pertence ao sistema da Carteira. Ele perderá o acesso às Diárias, mas continuará entrando normalmente na Carteira.</>}
          </p>
        )}
      </Modal>
    </>
  );
}
