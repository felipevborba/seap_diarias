import React, { useState } from 'react';
import api from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, Vazio, useAviso } from '../components/ui';
import { useDados } from '../lib/useDados';

export default function Cargos() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados('/api/cadastros/cargos');
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    const r = form.id ? await api.put(`/api/cadastros/cargos/${form.id}`, form) : await api.post('/api/cadastros/cargos', form);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Cargos"
        subtitulo="Usados no cadastro de servidores e na tabela de valores. Compartilhados com os demais módulos."
        acoes={<button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ nome: '', ativo: true }); }}><Icone nome="add" /> Novo cargo</button>}
      />
      <Alerta className="mb-4">{erro}</Alerta>
      <div className="cartao overflow-hidden max-w-3xl">
        {carregando && !dados ? <Carregando /> : !dados?.length ? <Vazio icone="work" texto="Nenhum cargo cadastrado." /> : (
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {dados.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.nome}</td>
                  <td>{c.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                  <td className="text-right"><button type="button" className="btn-icone" aria-label={`Editar ${c.nome}`} onClick={() => { setErroForm(''); setForm({ ...c }); }}><Icone nome="edit" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar cargo' : 'Novo cargo'} onFechar={() => setForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-cargo" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {form && (
          <form id="form-cargo" onSubmit={salvar} className="flex flex-col gap-form-element-gap">
            <Alerta>{erroForm}</Alerta>
            <Campo rotulo="Nome *"><input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              <span className="font-body-md text-body-md">Ativo</span>
            </label>
          </form>
        )}
      </Modal>
    </>
  );
}
