import React, { useState } from 'react';
import api from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, Vazio, useAviso } from '../components/ui';
import { CLASSES_BENEFICIARIO, fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

// Exclusão de cargo em uso pede um substituto: serve para unificar cadastros duplicados vindos do legado
// ("AGENTE SEG PENITENCIARIA", "AGENTE DE SEG PENITENCIARIA"...).
export default function Cargos() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados('/api/cadastros/cargos');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');
  const [excluir, setExcluir] = useState(null); // { cargo, substitutoId }
  const [erroExcluir, setErroExcluir] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { ...form, classeBeneficiario: form.classeBeneficiario ? Number(form.classeBeneficiario) : null };
    const r = form.id ? await api.put(`/api/cadastros/cargos/${form.id}`, corpo) : await api.post('/api/cadastros/cargos', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  const confirmarExclusao = async () => {
    setErroExcluir('');
    setExcluindo(true);
    const sufixo = excluir.substitutoId ? `?substitutoId=${excluir.substitutoId}` : '';
    const r = await api.del(`/api/cadastros/cargos/${excluir.cargo.id}${sufixo}`);
    setExcluindo(false);
    if (!r.success) { setErroExcluir(r.message); return; }
    avisar(r.message);
    setExcluir(null);
    recarregar();
  };

  const emUso = (c) => c.servidores + c.diarias + c.valores > 0;
  const lista = (dados || []).filter((c) => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <CabecalhoPagina
        titulo="Cargos"
        subtitulo="Usados no cadastro de servidores e na tabela de valores. Compartilhados com os demais módulos."
        acoes={<button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ nome: '', ativo: true, classeBeneficiario: '' }); }}><Icone nome="add" /> Novo cargo</button>}
      />
      <Alerta className="mb-4">{erro}</Alerta>
      <div className="cartao overflow-hidden max-w-4xl">
        <div className="p-4 border-b border-outline-variant/60">
          <input className="campo sm:!w-80" placeholder="Buscar cargo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cargo" />
        </div>
        {carregando && !dados ? <Carregando /> : !lista.length ? <Vazio icone="work" texto="Nenhum cargo encontrado." /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nome</th><th>Classe (diárias)</th><th className="text-right">Servidores</th><th className="text-right">Diárias</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.nome}</td>
                    <td className="whitespace-nowrap">{c.classeBeneficiario ? `Classe ${c.classeBeneficiario}` : <span className="text-on-surface-variant">Pelo vínculo</span>}</td>
                    <td className="text-right tabular">{fmtNumero(c.servidores)}</td>
                    <td className="text-right tabular">{fmtNumero(c.diarias)}</td>
                    <td>{c.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                    <td className="text-right whitespace-nowrap">
                      <button type="button" className="btn-icone" aria-label={`Editar ${c.nome}`} onClick={() => { setErroForm(''); setForm({ ...c, classeBeneficiario: c.classeBeneficiario || '' }); }}><Icone nome="edit" /></button>
                      <button type="button" className="btn-icone hover:!text-error" aria-label={`Excluir ${c.nome}`} title={emUso(c) ? 'Excluir e passar os registros para outro cargo' : 'Excluir'}
                        onClick={() => { setErroExcluir(''); setExcluir({ cargo: c, substitutoId: '' }); }}><Icone nome="delete" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar cargo' : 'Novo cargo'} onFechar={() => setForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-cargo" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {form && (
          <form id="form-cargo" onSubmit={salvar} className="flex flex-col gap-form-element-gap">
            <Alerta>{erroForm}</Alerta>
            <Campo rotulo="Nome *"><input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
            <Campo rotulo="Classe na Tabela de Diárias Nacionais" dica="Sem classe: 3 para contratados e 2 para os demais vínculos. O servidor pode ter classe própria.">
              <select className="campo" value={form.classeBeneficiario} onChange={(e) => setForm({ ...form, classeBeneficiario: e.target.value })}>
                <option value="">Pelo vínculo do servidor</option>
                {CLASSES_BENEFICIARIO.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo} – {c.descricao}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              <span className="font-body-md text-body-md">Ativo</span>
            </label>
          </form>
        )}
      </Modal>

      <Modal aberto={!!excluir} titulo="Excluir cargo" onFechar={() => setExcluir(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setExcluir(null)}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={excluindo || (emUso(excluir?.cargo || {}) && !excluir?.substitutoId)} onClick={confirmarExclusao}>
            <Icone nome="delete" /> Excluir</button></>}>
        {excluir && (
          <div className="flex flex-col gap-form-element-gap">
            <Alerta>{erroExcluir}</Alerta>
            {emUso(excluir.cargo) ? (
              <>
                <p className="font-body-md text-body-md">
                  <strong>{excluir.cargo.nome}</strong> está em uso por {fmtNumero(excluir.cargo.servidores)} servidores, {fmtNumero(excluir.cargo.diarias)} diárias
                  e {fmtNumero(excluir.cargo.valores)} valores da tabela. Escolha o cargo que vai ficar no lugar dele:
                </p>
                <Campo rotulo="Substituir por *">
                  <select className="campo" value={excluir.substitutoId} onChange={(e) => setExcluir({ ...excluir, substitutoId: e.target.value })}>
                    <option value="">Selecione</option>
                    {(dados || []).filter((c) => c.id !== excluir.cargo.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Campo>
              </>
            ) : (
              <p className="font-body-md text-body-md">Excluir o cargo <strong>{excluir.cargo.nome}</strong>? Ele não está em uso.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
