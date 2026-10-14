import React, { useState } from 'react';
import api from '../api';
import { Permitido, usePerfil } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Paginacao, Selo, Vazio, useAviso } from '../components/ui';
import { VINCULOS, fmtCpf, mascaraCpf } from '../lib/formato';
import { useCargos, useDados, useUnidades } from '../lib/useDados';

const VAZIO = { nome: '', cpf: '', matricula: '', vinculo: 'Efetivo', cargoId: '', unidadeId: '', email: '', celular: '', banco: '', agencia: '', conta: '', ativo: true };

export default function Servidores() {
  const perfil = usePerfil();
  const podeEditar = perfil === 'ADMIN' || perfil === 'OPERADOR';
  const unidades = useUnidades();
  const cargos = useCargos();
  const avisar = useAviso();
  const [filtro, setFiltro] = useState({ busca: '', unidadeId: '', vinculo: '', ativo: 'true' });
  const [aplicado, setAplicado] = useState(filtro);
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro, recarregar } = useDados('/api/servidores', { ...aplicado, page: pagina, pageSize: 20 });

  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  const abrir = async (id) => {
    setErroForm('');
    if (!id) { setForm({ ...VAZIO }); return; }
    const r = await api.get(`/api/servidores/${id}`);
    if (r.success) setForm({ ...r.data, cpf: fmtCpf(r.data.cpf), cargoId: r.data.cargoId || '', unidadeId: r.data.unidadeId || '' });
  };

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { ...form, cargoId: form.cargoId || null, unidadeId: form.unidadeId || null };
    const r = form.id ? await api.put(`/api/servidores/${form.id}`, corpo) : await api.post('/api/servidores', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  const sincronizar = async () => {
    setSincronizando(true);
    const r = await api.post('/api/servidores/sincronizar-policiais');
    setSincronizando(false);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) recarregar();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setF = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.value });
  const policial = !!form?.policiaPenalId;

  return (
    <>
      <CabecalhoPagina
        titulo="Servidores"
        subtitulo="Qualquer servidor com vínculo com o Estado. Policiais penais vêm do cadastro da Carteira Funcional."
        acoes={<>
          <Permitido perfis={['ADMIN']}>
            <button type="button" className="btn-secundario" onClick={sincronizar} disabled={sincronizando}>
              <Icone nome="sync" /> {sincronizando ? 'Sincronizando...' : 'Sincronizar policiais penais'}
            </button>
          </Permitido>
          {podeEditar && <button type="button" className="btn-primario" onClick={() => abrir(null)}><Icone nome="person_add" /> Novo servidor</button>}
        </>}
      />

      <form className="cartao p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); }}>
        <label className="lg:col-span-2 flex flex-col gap-1.5"><span className="rotulo">Busca</span>
          <input className="campo" value={filtro.busca} onChange={setF('busca')} placeholder="Nome, CPF ou matrícula" /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Lotação</span>
          <select className="campo" value={filtro.unidadeId} onChange={setF('unidadeId')}>
            <option value="">Todas</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Vínculo</span>
          <select className="campo" value={filtro.vinculo} onChange={setF('vinculo')}>
            <option value="">Todos</option>{VINCULOS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
          </select></label>
        <div className="flex gap-2">
          <select className="campo" value={filtro.ativo} onChange={setF('ativo')} aria-label="Situação">
            <option value="true">Ativos</option><option value="false">Inativos</option><option value="">Todos</option>
          </select>
          <button className="btn-primario !px-3" type="submit" aria-label="Filtrar"><Icone nome="search" /></button>
        </div>
      </form>

      <Alerta className="mb-4">{erro}</Alerta>

      <div className="cartao overflow-hidden">
        {carregando && !dados ? <Carregando /> : !dados?.items.length ? (
          <Vazio icone="badge" texto="Nenhum servidor encontrado. Administradores podem sincronizar os policiais penais da Carteira." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Vínculo / Cargo</th><th>Lotação</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {dados.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-semibold">{s.nome}</div>
                        {s.policialPenal && <span className="font-label-md text-label-md text-on-surface-variant">Policial penal · cadastro da Carteira</span>}
                      </td>
                      <td className="tabular whitespace-nowrap">{fmtCpf(s.cpf)}</td>
                      <td className="tabular">{s.matricula || '—'}</td>
                      <td>{s.vinculo}{s.cargo ? <span className="text-on-surface-variant"> · {s.cargo}</span> : ''}</td>
                      <td className="text-on-surface-variant">{s.unidade || '—'}</td>
                      <td>{s.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                      <td className="text-right">
                        <button type="button" className="btn-icone" onClick={() => abrir(s.id)} aria-label={`${podeEditar ? 'Editar' : 'Ver'} ${s.nome}`}>
                          <Icone nome={podeEditar ? 'edit' : 'visibility'} />
                        </button>
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

      <Modal
        aberto={!!form}
        largura="max-w-2xl"
        titulo={form?.id ? 'Servidor' : 'Novo servidor'}
        onFechar={() => setForm(null)}
        rodape={podeEditar && <>
          <button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-servidor" className="btn-primario"><Icone nome="save" /> Salvar</button>
        </>}
      >
        {form && (
          <form id="form-servidor" onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-form-element-gap">
            <Alerta className="sm:col-span-2">{erroForm}</Alerta>
            {policial && (
              <Alerta tipo="info" className="sm:col-span-2">
                Nome, CPF, matrícula e lotação vêm do cadastro de policiais da Carteira e são atualizados pela sincronização.
              </Alerta>
            )}
            <fieldset disabled={!podeEditar} className="contents">
              <Campo rotulo="Nome *" className="sm:col-span-2">
                <input className="campo" required disabled={policial} value={form.nome} onChange={set('nome')} />
              </Campo>
              <Campo rotulo="CPF *">
                <input className="campo" required disabled={policial} inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })} />
              </Campo>
              <Campo rotulo="Matrícula">
                <input className="campo" disabled={policial} value={form.matricula || ''} onChange={set('matricula')} />
              </Campo>
              <Campo rotulo="Vínculo *" dica="Define, com o cargo, o valor da diária">
                <select className="campo" value={form.vinculo} onChange={set('vinculo')}>
                  {VINCULOS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Cargo">
                <select className="campo" value={form.cargoId} onChange={set('cargoId')}>
                  <option value="">Não informado</option>{cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Lotação" className="sm:col-span-2">
                <select className="campo" disabled={policial} value={form.unidadeId} onChange={set('unidadeId')}>
                  <option value="">Não informada</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="E-mail"><input type="email" className="campo" value={form.email || ''} onChange={set('email')} /></Campo>
              <Campo rotulo="Celular"><input className="campo" value={form.celular || ''} onChange={set('celular')} /></Campo>
              <Campo rotulo="Banco"><input className="campo" value={form.banco || ''} onChange={set('banco')} /></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Agência"><input className="campo" value={form.agencia || ''} onChange={set('agencia')} /></Campo>
                <Campo rotulo="Conta"><input className="campo" value={form.conta || ''} onChange={set('conta')} /></Campo>
              </div>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={form.ativo} onChange={set('ativo')} />
                <span className="font-body-md text-body-md">Ativo (pode receber novas diárias)</span>
              </label>
            </fieldset>
          </form>
        )}
      </Modal>
    </>
  );
}
