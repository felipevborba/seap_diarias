import React, { useState } from 'react';
import api from '../api';
import { usePerfil } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Vazio, useAviso } from '../components/ui';
import { SeletorMunicipio } from '../components/ui/Seletores';
import { useDados } from '../lib/useDados';

export default function Regioes() {
  const admin = usePerfil() === 'ADMIN';
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados('/api/cadastros/regioes');
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { nome: form.nome, municipioIds: form.municipios.map((m) => m.id) };
    const r = form.id ? await api.put(`/api/cadastros/regioes/${form.id}`, corpo) : await api.post('/api/cadastros/regioes', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    recarregar();
  };

  const excluir = async (r) => {
    if (!window.confirm(`Excluir a região "${r.nome}"? Os municípios ficam sem região nos relatórios.`)) return;
    const res = await api.del(`/api/cadastros/regioes/${r.id}`);
    avisar(res.message, res.success ? 'sucesso' : 'erro');
    if (res.success) recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Regiões"
        subtitulo="Agrupamento de municípios de destino para relatórios (ex.: Região Metropolitana, Agreste, Sertão 1). Compartilhado com os demais módulos."
        acoes={admin && <button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ nome: '', municipios: [] }); }}><Icone nome="add" /> Nova região</button>}
      />
      <Alerta className="mb-4">{erro}</Alerta>
      {carregando && !dados ? <Carregando /> : !dados?.length ? (
        <div className="cartao"><Vazio icone="map" texto="Nenhuma região cadastrada." /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter-grid">
          {dados.map((r) => (
            <section key={r.id} className="cartao p-padding-card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-primary">{r.nome}</h3>
                  <p className="font-label-md text-label-md text-on-surface-variant">{r.municipios.length} município{r.municipios.length === 1 ? '' : 's'}</p>
                </div>
                {admin && (
                  <div className="flex">
                    <button type="button" className="btn-icone" aria-label={`Editar ${r.nome}`} onClick={() => { setErroForm(''); setForm({ ...r }); }}><Icone nome="edit" /></button>
                    <button type="button" className="btn-icone hover:!text-error" aria-label={`Excluir ${r.nome}`} onClick={() => excluir(r)}><Icone nome="delete" /></button>
                  </div>
                )}
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">{r.municipios.map((m) => m.nome).join(', ') || '—'}</p>
            </section>
          ))}
        </div>
      )}

      <Modal aberto={!!form} titulo={form?.id ? 'Editar região' : 'Nova região'} onFechar={() => setForm(null)} largura="max-w-xl"
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-regiao" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {form && (
          <form id="form-regiao" onSubmit={salvar} className="flex flex-col gap-form-element-gap">
            <Alerta>{erroForm}</Alerta>
            <Campo rotulo="Nome *"><input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
            <Campo rotulo="Adicionar município">
              <SeletorMunicipio valor={null} onSelecionar={(m) => m && !form.municipios.some((x) => x.id === m.id) && setForm({ ...form, municipios: [...form.municipios, m] })} />
            </Campo>
            <div className="flex flex-wrap gap-2">
              {form.municipios.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-surface-container-high font-body-md text-body-md">
                  {m.nome}/{m.uf}
                  <button type="button" className="rounded-full p-0.5 hover:bg-surface-dim" aria-label={`Remover ${m.nome}`}
                    onClick={() => setForm({ ...form, municipios: form.municipios.filter((x) => x.id !== m.id) })}>
                    <Icone nome="close" className="text-base" />
                  </button>
                </span>
              ))}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
