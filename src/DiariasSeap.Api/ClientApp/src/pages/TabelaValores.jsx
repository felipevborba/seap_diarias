import React, { useState } from 'react';
import CampoData from '../components/ui/CampoData';
import api from '../api';
import { usePerfil } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, Vazio, useAviso } from '../components/ui';
import { CLASSES_BENEFICIARIO, FAIXAS_DESTINO, VINCULOS, fmtData, fmtMoeda, hojeIso, rotuloFaixa } from '../lib/formato';

/** Matriz no formato do Anexo do decreto: classes × integral/parcial nas linhas, faixas de destino nas colunas. */
function TabelaNacional({ valores, admin, onEditar }) {
  const hoje = hojeIso();
  const oficiais = valores.filter((v) => v.classeBeneficiario && v.faixaDestino && !v.vinculo && !v.cargoId
    && v.vigenciaInicio <= hoje && (!v.vigenciaFim || v.vigenciaFim >= hoje));
  if (!oficiais.length) return null;
  const tipos = [...new Set(oficiais.map((v) => v.tipoDiaria))].sort((a, b) => (a === 'Integral' ? -1 : b === 'Integral' ? 1 : a.localeCompare(b)));
  const celula = (classe, tipo, faixa) => oficiais.find((v) => v.classeBeneficiario === classe && v.tipoDiaria === tipo && v.faixaDestino === faixa);
  return (
    <section className="cartao overflow-hidden mb-gutter-grid">
      <div className="p-4 border-b border-outline-variant/60">
        <h3 className="font-headline-sm text-headline-sm text-primary">Tabela de Diárias Nacionais</h3>
        <p className="font-label-md text-label-md text-on-surface-variant">
          Decreto Estadual nº 25.845/2003 · valores vigentes hoje. A faixa vem do município de destino; a classe, do servidor ou do cargo.
          {admin ? ' Clique num valor para editar.' : ''}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="tabela [&_th]:!whitespace-normal [&_td]:!px-3 [&_th]:!px-3">
          <thead>
            <tr>
              <th rowSpan={2} className="align-bottom">Beneficiário</th>
              <th rowSpan={2} className="align-bottom">Modalidade</th>
              <th colSpan={3} className="text-center">Fora do estado · Grupo I</th>
              <th className="text-center">Grupo II</th>
              <th className="text-center">Dentro do estado · Grupo III</th>
            </tr>
            <tr>{FAIXAS_DESTINO.map((f) => <th key={f.valor} className="text-right !normal-case font-normal align-bottom min-w-[6.5rem] max-w-[10rem]">{f.rotulo}</th>)}</tr>
          </thead>
          <tbody>
            {CLASSES_BENEFICIARIO.flatMap((c) => tipos.map((t, i) => (
              <tr key={`${c.valor}-${t}`}>
                {i === 0 && <td rowSpan={tipos.length} className="align-top"><div className="font-semibold">{c.rotulo}</div><div className="font-label-md text-label-md text-on-surface-variant max-w-[11rem]">{c.descricao}</div></td>}
                <td className="font-semibold">{t}</td>
                {FAIXAS_DESTINO.map((f) => {
                  const v = celula(c.valor, t, f.valor);
                  return (
                    <td key={f.valor} className="text-right tabular whitespace-nowrap">
                      {!v ? '—' : admin
                        ? <button type="button" className="hover:underline text-primary font-semibold" onClick={() => onEditar(v)}>{fmtMoeda(v.valor)}</button>
                        : fmtMoeda(v.valor)}
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
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
      classeBeneficiario: form.classeBeneficiario ? Number(form.classeBeneficiario) : null, faixaDestino: form.faixaDestino || null,
      valor: Number(String(form.valor).replace(/\./g, '').replace(',', '.')), vigenciaInicio: form.vigenciaInicio, vigenciaFim: form.vigenciaFim || null,
    };
    const r = form.id ? await api.put(`/api/cadastros/valores/${form.id}`, corpo) : await api.post('/api/cadastros/valores', corpo);
    if (!r.success) { setErroForm(r.message); return; }
    avisar(r.message);
    setForm(null);
    valores.recarregar();
  };

  const abrirValor = (v) => {
    setErroForm('');
    setForm({ ...v, vinculo: v.vinculo || '', cargoId: v.cargoId || '', classeBeneficiario: v.classeBeneficiario || '', faixaDestino: v.faixaDestino || '',
      valor: String(v.valor).replace('.', ','), vigenciaFim: v.vigenciaFim || '' });
  };

  const excluirValor = async (v) => {
    if (!window.confirm(`Excluir o valor de ${fmtMoeda(v.valor)} (${v.tipoDiaria})? Diárias já lançadas mantêm o valor gravado.`)) return;
    const r = await api.del(`/api/cadastros/valores/${v.id}`);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) valores.recarregar();
  };

  const excluirTipo = async (t) => {
    if (!window.confirm(`Excluir o tipo de diária "${t.nome}"? As linhas da tabela de valores desse tipo também serão excluídas.`)) return;
    const r = await api.del(`/api/cadastros/tipos/${t.id}`);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) { tipos.recarregar(); valores.recarregar(); }
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
        subtitulo="O valor da diária é preenchido automaticamente no lançamento pela linha vigente mais específica: faixa de destino, classe do beneficiário, cargo e vínculo (nessa ordem de peso)."
        acoes={admin && <button type="button" className="btn-primario" onClick={() => { setErroForm(''); setForm({ tipoDiariaId: tipos.dados?.[0]?.id || '', vinculo: '', cargoId: '', classeBeneficiario: '', faixaDestino: '', valor: '', vigenciaInicio: hojeIso(), vigenciaFim: '' }); }}>
          <Icone nome="add" /> Novo valor
        </button>}
      />

      {valores.dados && <TabelaNacional valores={valores.dados} admin={admin} onEditar={(v) => abrirValor(v)} />}

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
                <thead><tr><th>Tipo</th><th>Classe</th><th>Destino</th><th>Vínculo</th><th>Cargo</th><th className="text-right">Valor</th><th>Vigência</th>{admin && <th />}</tr></thead>
                <tbody>
                  {valores.dados.map((v) => (
                    <tr key={v.id}>
                      <td className="font-semibold">{v.tipoDiaria}</td>
                      <td className="whitespace-nowrap">{v.classeBeneficiario ? `Classe ${v.classeBeneficiario}` : <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td className="min-w-[10rem]">{rotuloFaixa(v.faixaDestino) || <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td>{v.vinculo || <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td>{v.cargo || <span className="text-on-surface-variant">Qualquer</span>}</td>
                      <td className="text-right tabular font-semibold">{fmtMoeda(v.valor)}</td>
                      <td className="whitespace-nowrap tabular">{fmtData(v.vigenciaInicio)} {v.vigenciaFim ? `a ${fmtData(v.vigenciaFim)}` : <Selo cor="verde">em diante</Selo>}</td>
                      {admin && (
                        <td className="text-right whitespace-nowrap">
                          <button type="button" className="btn-icone" aria-label="Editar valor" onClick={() => abrirValor(v)}><Icone nome="edit" /></button>
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
            {admin && <button type="button" className="btn-icone" aria-label="Novo tipo" onClick={() => { setErroForm(''); setTipoForm({ nome: '', descricao: '', ativo: true, colunaMapa: 'INTEGRAL' }); }}><Icone nome="add" /></button>}
          </div>
          <ul>
            {(tipos.dados || []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/50 last:border-0">
                <div>
                  <p className="font-body-md text-body-md font-semibold">{t.nome} {!t.ativo && <Selo>Inativo</Selo>} {t.obsoleto && <Selo cor="amarelo">Fora de uso (passagem tem campo próprio)</Selo>}</p>
                  <p className="font-label-md text-label-md text-on-surface-variant">Planilha da Controladoria: coluna {t.colunaMapa === 'PARCIAL' ? 'Parciais' : 'Integrais'}</p>
                  {t.descricao && <p className="font-label-md text-label-md text-on-surface-variant">{t.descricao}</p>}
                </div>
                {admin && (
                  <div className="flex">
                    <button type="button" className="btn-icone" aria-label={`Editar ${t.nome}`} onClick={() => { setErroForm(''); setTipoForm({ ...t, descricao: t.descricao || '' }); }}><Icone nome="edit" /></button>
                    <button type="button" className="btn-icone hover:!text-error" aria-label={`Excluir ${t.nome}`} title="Excluir tipo" onClick={() => excluirTipo(t)}><Icone nome="delete" /></button>
                  </div>
                )}
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
            <Campo rotulo="Classe do beneficiário">
              <select className="campo" value={form.classeBeneficiario} onChange={(e) => setForm({ ...form, classeBeneficiario: e.target.value })}>
                <option value="">Qualquer</option>{CLASSES_BENEFICIARIO.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Destino">
              <select className="campo" value={form.faixaDestino} onChange={(e) => setForm({ ...form, faixaDestino: e.target.value })}>
                <option value="">Qualquer</option>{FAIXAS_DESTINO.map((f) => <option key={f.valor} value={f.valor}>{f.grupo} – {f.rotulo}</option>)}
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
              <CampoData required value={form.vigenciaInicio} onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })} />
            </Campo>
            <Campo rotulo="Vigência fim" dica="Vazio = sem prazo">
              <CampoData min={form.vigenciaInicio} value={form.vigenciaFim} onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })} />
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
            <Campo rotulo="Na planilha da Controladoria, conta como" dica="Mapa de Diárias e Passagens (ANEXO VII): colunas Integrais ou Parciais">
              <select className="campo" value={tipoForm.colunaMapa || 'INTEGRAL'} onChange={(e) => setTipoForm({ ...tipoForm, colunaMapa: e.target.value })}>
                <option value="INTEGRAL">Integrais</option>
                <option value="PARCIAL">Parciais</option>
              </select>
            </Campo>
          </form>
        )}
      </Modal>
    </>
  );
}
