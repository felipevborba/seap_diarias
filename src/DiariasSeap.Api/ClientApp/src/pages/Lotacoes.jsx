import React, { useState } from 'react';
import api from '../api';
import { usePerfil } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Vazio, useAviso } from '../components/ui';
import { fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

// Lotações = unidades (public.unidade), cadastro compartilhado com o sistema da Carteira.
export default function Lotacoes() {
  const admin = usePerfil() === 'ADMIN';
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados('/api/cadastros/lotacoes');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { sigla: form.sigla, nome: form.nome };
    const r = form.id ? await api.put(`/api/cadastros/lotacoes/${form.id}`, corpo) : await api.post('/api/cadastros/lotacoes', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  const excluir = async (l) => {
    if (!window.confirm(`Excluir a lotação "${l.nome}"?`)) return;
    const r = await api.del(`/api/cadastros/lotacoes/${l.id}`);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) recarregar();
  };

  const lista = (dados || []).filter((l) => !busca || `${l.sigla || ''} ${l.nome}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <CabecalhoPagina
        titulo="Lotações"
        subtitulo="Unidades de lotação dos servidores. O cadastro é compartilhado com o sistema da Carteira Funcional."
        acoes={admin && <button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ sigla: '', nome: '' }); }}><Icone nome="add" /> Nova lotação</button>}
      />
      <Alerta className="mb-4">{erro}</Alerta>
      <div className="cartao overflow-hidden">
        <div className="p-4 border-b border-outline-variant/60">
          <input className="campo sm:!w-80" placeholder="Buscar por sigla ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lotação" />
        </div>
        {carregando && !dados ? <Carregando /> : !lista.length ? <Vazio icone="domain" texto="Nenhuma lotação encontrada." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Sigla</th><th>Nome</th><th className="text-right">Policiais (Carteira)</th><th className="text-right">Servidores</th><th className="text-right">Diárias</th>{admin && <th />}</tr></thead>
              <tbody>
                {lista.map((l) => {
                  const emUso = l.policiais + l.servidores + l.diarias > 0;
                  return (
                    <tr key={l.id}>
                      <td className="font-semibold whitespace-nowrap">{l.sigla || '—'}</td>
                      <td>{l.nome}</td>
                      <td className="text-right tabular">{fmtNumero(l.policiais)}</td>
                      <td className="text-right tabular">{fmtNumero(l.servidores)}</td>
                      <td className="text-right tabular">{fmtNumero(l.diarias)}</td>
                      {admin && (
                        <td className="text-right whitespace-nowrap">
                          <button type="button" className="btn-icone" aria-label={`Editar ${l.nome}`} onClick={() => { setErroForm(''); setForm({ ...l, sigla: l.sigla || '' }); }}><Icone nome="edit" /></button>
                          <button type="button" className="btn-icone hover:!text-error disabled:opacity-30" disabled={emUso} onClick={() => excluir(l)}
                            aria-label={`Excluir ${l.nome}`} title={emUso ? 'Em uso: não pode ser excluída' : 'Excluir'}><Icone nome="delete" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar lotação' : 'Nova lotação'} onFechar={() => setForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-lotacao" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {form && (
          <form id="form-lotacao" onSubmit={salvar} className="grid grid-cols-3 gap-form-element-gap">
            <Alerta className="col-span-3">{erroForm}</Alerta>
            {form.id && <Alerta tipo="aviso" className="col-span-3">A alteração vale também para o sistema da Carteira.</Alerta>}
            <Campo rotulo="Sigla"><input className="campo uppercase" maxLength={50} value={form.sigla} onChange={(e) => setForm({ ...form, sigla: e.target.value })} /></Campo>
            <Campo rotulo="Nome *" className="col-span-2"><input className="campo" required maxLength={255} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          </form>
        )}
      </Modal>
    </>
  );
}
