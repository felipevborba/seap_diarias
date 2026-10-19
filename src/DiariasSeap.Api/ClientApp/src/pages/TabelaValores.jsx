import React, { useState } from 'react';
import api from '../api';
import { usePerfil } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, Vazio, useAviso } from '../components/ui';
import { VINCULOS, fmtData, fmtMoeda, hojeIso } from '../lib/formato';
import { useCargos, useDados } from '../lib/useDados';

export default function TabelaValores() {
  const admin = usePerfil() === 'ADMIN';
  const avisar = useAviso();
  const cargos = useCargos();
  const tipos = useDados('/api/cadastros/tipos');
  const [somenteVigentes, setSomenteVigentes] = useState(true);
  const valores = useDados('/api/cadastros/valores', { somenteVigentes });
  const [form, setForm] = useState(null);
  const [tipoForm, setTipoForm] = useState(null);
  const [erroForm, setErroForm] = useState('');

  const salvarValor = async (e) => {
    e.preventDefault();
    const corpo = {
      tipoDiariaId: Number(form.tipoDiariaId), vinculo: form.vinculo || null, cargoId: form.cargoId ? Number(form.cargoId) : null,
      valor: Number(String(form.valor).replace(/\./g, '').replace(',', '.')), vigenciaInicio: form.vigenciaInicio, vigenciaFim: form.vigenciaFim || null,
    };
    const r = form.id ? await api.put(`/api/cadastros/valores/${form.id}`, corpo) : await api.post('/api/cadastros/valores', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    valores.recarregar();
  };

  const excluirValor = async (v) => {
    if (!window.confirm(`Excluir o valor de ${fmtMoeda(v.valor)} (${v.tipoDiaria})? Diárias já lançadas mantêm o valor gravado.`)) return;
    const r = await api.del(`/api/cadastros/valores/${v.id}`);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) valores.recarregar();
  };

  const salvarTipo = async (e) => {
    e.preventDefault();
    const r = tipoForm.id ? await api.put(`/api/cadastros/tipos/${tipoForm.id}`, tipoForm) : await api.post('/api/cadastros/tipos', tipoForm);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setTipoForm(null);
    tipos.recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Tabela de valores"
        subtitulo="O valor da diária é preenchido automaticamente no lançamento pela linha vigente mais específica: cargo + vínculo, só cargo, só vínculo ou genérica."
        acoes={admin && <button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ tipoDiariaId: tipos.dados?.[0]?.id || '', vinculo: '', cargoId: '', valor: '', vigenciaInicio: hojeIso(), vigenciaFim: '' }); }}>
          <Icone nome="add" /> Novo valor
        </button>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <section className="cartao overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-outline-variant/60">
            <h3 className="font-headline-sm text-headline-sm text-primary">Valores</h3>
            <label className="flex items-center gap-2 font-body-md text-body-md">
              <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={somenteVigentes} onChange={(e) => setSomenteVigentes(e.target.checked)} />
              Somente vigentes
            </label>
          </div>
          {valores.carregando && !valores.dados ? <Carregando /> : !valores.dados?.length ? (
            <Vazio icone="payments" texto="Nenhum valor cadastrado. Sem valor vigente, o lançamento de diárias fica bloqueado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Tipo</th><th>Vínculo</th><th>Cargo</th><th className="text-right">Valor</th><th>Vigência</th>{admin && <th />}</tr></thead>
                <tbody>
                  {valores.dados.map((v) => (
                    <tr key={v.id}>
                      <td className="font-semibold">{v.tipoDiaria}</td>
                      <td>{v.vinculo || <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td>{v.cargo || <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td className="text-right tabular font-semibold">{fmtMoeda(v.valor)}</td>
                      <td className="whitespace-nowrap tabular">{fmtData(v.vigenciaInicio)} {v.vigenciaFim ? `a ${fmtData(v.vigenciaFim)}` : <Selo cor="verde">em diante</Selo>}</td>
                      {admin && (
                        <td className="text-right whitespace-nowrap">
                          <button type="button" className="btn-icone" aria-label="Editar valor" onClick={() => { setErroForm(''); setForm({ ...v, vinculo: v.vinculo || '', cargoId: v.cargoId || '', valor: String(v.valor).replace('.', ','), vigenciaFim: v.vigenciaFim || '' }); }}><Icone nome="edit" /></button>
                          <button type="button" className="btn-icone hover:!text-error" aria-label="Excluir valor" onClick={() => excluirValor(v)}><Icone nome="delete" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="p-4 font-label-md text-label-md text-on-surface-variant">
            Reajuste: encerre a vigência da linha atual (data fim) e cadastre uma nova a partir do dia seguinte. Diárias antigas mantêm o valor da época.
          </p>
        </section>

        <section className="cartao overflow-hidden self-start">
          <div className="flex items-center justify-between p-4 border-b border-outline-variant/60">
            <h3 className="font-headline-sm text-headline-sm text-primary">Tipos de diária</h3>
            {admin && <button type="button" className="btn-icone" aria-label="Novo tipo" onClick={() => { setErroForm(''); setTipoForm({ nome: '', descricao: '', ativo: true }); }}><Icone nome="add" /></button>}
          </div>
          <ul>
            {(tipos.dados || []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/50 last:border-0">
                <div>
                  <p className="font-body-md text-body-md font-semibold">{t.nome} {!t.ativo && <Selo>Inativo</Selo>}</p>
                  {t.descricao && <p className="font-label-md text-label-md text-on-surface-variant">{t.descricao}</p>}
                </div>
                {admin && <button type="button" className="btn-icone" aria-label={`Editar ${t.nome}`} onClick={() => { setErroForm(''); setTipoForm({ ...t, descricao: t.descricao || '' }); }}><Icone nome="edit" /></button>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar valor' : 'Novo valor'} onFechar={() => setForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          <button type="submit" form="form-valor" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {form && (
          <form id="form-valor" onSubmit={salvarValor} className="grid grid-cols-2 gap-form-element-gap">
            <Alerta className="col-span-2">{erroForm}</Alerta>
            <Campo rotulo="Tipo *" className="col-span-2">
              <select className="campo" required value={form.tipoDiariaId} onChange={(e) => setForm({ ...form, tipoDiariaId: e.target.value })}>
                {(tipos.dados || []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Vínculo">
              <select className="campo" value={form.vinculo} onChange={(e) => setForm({ ...form, vinculo: e.target.value })}>
                <option value="">Qualquer</option>{VINCULOS.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Cargo">
              <select className="campo" value={form.cargoId} onChange={(e) => setForm({ ...form, cargoId: e.target.value })}>
                <option value="">Qualquer</option>{cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Valor (R$) *" className="col-span-2">
              <input className="campo tabular" required inputMode="decimal" placeholder="0,00" value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value.replace(/[^\d,.]/g, '') })} />
            </Campo>
            <Campo rotulo="Vigência início *">
              <input type="date" className="campo" required value={form.vigenciaInicio} onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })} />
            </Campo>
            <Campo rotulo="Vigência fim" dica="Vazio = sem prazo">
              <input type="date" className="campo" min={form.vigenciaInicio} value={form.vigenciaFim} onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })} />
            </Campo>
          </form>
        )}
      </Modal>

      <Modal aberto={!!tipoForm} titulo={tipoForm?.id ? 'Editar tipo' : 'Novo tipo de diária'} onFechar={() => setTipoForm(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setTipoForm(null)}>Cancelar</button>
          <button type="submit" form="form-tipo" className="btn-primario"><Icone nome="save" /> Salvar</button></>}>
        {tipoForm && (
          <form id="form-tipo" onSubmit={salvarTipo} className="flex flex-col gap-form-element-gap">
            <Alerta>{erroForm}</Alerta>
            <Campo rotulo="Nome *"><input className="campo" required value={tipoForm.nome} onChange={(e) => setTipoForm({ ...tipoForm, nome: e.target.value })} /></Campo>
            <Campo rotulo="Descrição"><input className="campo" value={tipoForm.descricao} onChange={(e) => setTipoForm({ ...tipoForm, descricao: e.target.value })} /></Campo>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-outline text-primary focus:ring-primary" checked={tipoForm.ativo} onChange={(e) => setTipoForm({ ...tipoForm, ativo: e.target.checked })} />
              <span className="font-body-md text-body-md">Ativo (disponível no lançamento)</span>
            </label>
          </form>
        )}
      </Modal>
    </>
  );
}
