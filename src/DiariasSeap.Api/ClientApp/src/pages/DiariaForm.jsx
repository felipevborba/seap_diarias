import React, { useEffect, useMemo, useState } from 'react';
import CampoData from '../components/ui/CampoData';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, useAviso } from '../components/ui';
import { SeletorMunicipio, SeletorServidor } from '../components/ui/Seletores';
import { diasEntre, fmtData, fmtMoeda, fmtNumero } from '../lib/formato';
import { useTipos } from '../lib/useDados';

let chaveSeq = 0;
const novoItem = (tipoDiariaId = '') => ({ chave: ++chaveSeq, id: null, tipoDiariaId, quantidade: '' });
const novoPeriodo = (base, tipoPadrao) => ({
  chave: ++chaveSeq,
  id: null,
  dataInicio: '',
  dataFim: '',
  destino: base?.destino || null,
  destinoTexto: null,
  itens: [novoItem(base?.itens?.[0]?.tipoDiariaId || tipoPadrao || '')],
});

function separarDestino(texto, id) {
  const i = texto.lastIndexOf('/');
  return { id, nome: texto.slice(0, i), uf: texto.slice(i + 1) };
}

const numero = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

export default function DiariaForm() {
  const { id } = useParams();
  const editando = !!id;
  const navigate = useNavigate();
  const avisar = useAviso();
  const tipos = useTipos(true);

  const [servidor, setServidor] = useState(null);
  const [origem, setOrigem] = useState(null);
  const [origemTexto, setOrigemTexto] = useState(null);
  const [objetivo, setObjetivo] = useState('');
  const [processoSei, setProcessoSei] = useState('');
  const [observacao, setObservacao] = useState('');
  const [periodos, setPeriodos] = useState([novoPeriodo()]);
  const [situacaoAtual, setSituacaoAtual] = useState(null);
  const [legado, setLegado] = useState(null);
  const [simulacao, setSimulacao] = useState(null);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!editando) return;
    (async () => {
      const r = await api.get(`/api/diarias/${id}`);
      if (!r.success) { setErro(r.message); setCarregando(false); return; }
      const d = r.data;
      if (d.situacao === 'CANCELADA') setErro('Esta diária está cancelada e não pode ser editada.');
      setSituacaoAtual(d.situacao);
      setLegado(d.origem === 'LEGADO' ? d.legadoCodigo : null);
      setServidor({ id: d.servidorId, nome: d.servidor, cpf: d.cpf, matricula: d.matricula });
      setOrigem(d.cidadeOrigemId ? separarDestino(d.cidadeOrigem, d.cidadeOrigemId) : null);
      setOrigemTexto(d.cidadeOrigemId ? null : d.cidadeOrigemTexto);
      setObjetivo(d.objetivo);
      setProcessoSei(d.processoSei || '');
      setObservacao(d.observacao || '');
      setPeriodos(d.periodos.map((p) => ({
        chave: ++chaveSeq,
        id: p.id,
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        destino: p.destinoMunicipioId ? separarDestino(p.destino, p.destinoMunicipioId) : null,
        destinoTexto: p.destinoMunicipioId ? null : p.destinoTexto,
        itens: p.itens.map((i) => ({
          chave: ++chaveSeq,
          id: i.id,
          tipoDiariaId: i.tipoDiariaId,
          quantidade: p.itens.length === 1 && Number(i.quantidade) === p.dias ? '' : String(i.quantidade).replace('.', ','),
        })),
      })));
      setCarregando(false);
    })();
  }, [editando, id]);

  // Tipo padrão (o primeiro ativo, normalmente "Integral") nos itens ainda sem tipo.
  useEffect(() => {
    if (!tipos.length || editando) return;
    setPeriodos((ps) => ps.map((p) => ({ ...p, itens: p.itens.map((i) => (i.tipoDiariaId ? i : { ...i, tipoDiariaId: tipos[0].id })) })));
  }, [tipos, editando]);

  const completo = (p) => p.dataInicio && p.dataFim && (p.destino || p.destinoTexto) && p.itens.length && p.itens.every((i) => i.tipoDiariaId);

  const requisicao = useMemo(() => ({
    servidorId: servidor?.id || 0,
    origemMunicipioId: origem?.id ?? null,
    objetivo,
    processoSei,
    observacao,
    periodos: periodos.filter(completo).map((p) => ({
      id: p.id,
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
      destinoMunicipioId: p.destino?.id ?? null,
      itens: p.itens.map((i) => ({ id: i.id, tipoDiariaId: Number(i.tipoDiariaId), quantidade: numero(i.quantidade) })),
    })),
  }), [servidor, origem, objetivo, processoSei, observacao, periodos]);

  // Pré-visualização: valores e conflitos calculados no servidor (mesma regra da gravação).
  useEffect(() => {
    if (!servidor || requisicao.periodos.length === 0) { setSimulacao(null); return undefined; }
    const t = setTimeout(async () => {
      const r = await api.post('/api/diarias/simular', { ...requisicao, objetivo: requisicao.objetivo || '-' }, editando ? { diariaId: id } : undefined);
      if (r.success) setSimulacao(r.data);
    }, 400);
    return () => clearTimeout(t);
  }, [requisicao, servidor, editando, id]);

  const alterarPeriodo = (chave, campo, valor) =>
    setPeriodos((ps) => ps.map((p) => {
      if (p.chave !== chave) return p;
      const novo = { ...p, [campo]: valor };
      if (campo === 'dataInicio' && (!p.dataFim || p.dataFim < valor)) novo.dataFim = valor;
      if (campo === 'destino' && valor) novo.destinoTexto = null;
      return novo;
    }));

  const alterarItem = (pChave, iChave, campo, valor) =>
    setPeriodos((ps) => ps.map((p) => (p.chave !== pChave ? p : {
      ...p, itens: p.itens.map((i) => (i.chave === iChave ? { ...i, [campo]: valor } : i)),
    })));

  const adicionarItem = (pChave) =>
    setPeriodos((ps) => ps.map((p) => {
      if (p.chave !== pChave) return p;
      const usado = new Set(p.itens.map((i) => String(i.tipoDiariaId)));
      const livre = tipos.find((t) => !usado.has(String(t.id)));
      return { ...p, itens: [...p.itens, novoItem(livre?.id || '')] };
    }));

  const removerItem = (pChave, iChave) =>
    setPeriodos((ps) => ps.map((p) => (p.chave !== pChave ? p : { ...p, itens: p.itens.filter((i) => i.chave !== iChave) })));

  const calculoDe = (p) => simulacao?.periodos.find((c) => c.dataInicio === p.dataInicio && c.dataFim === p.dataFim);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!servidor) { setErro('Selecione o servidor.'); return; }
    if (!origem && !origemTexto) { setErro('Informe a cidade de origem da viagem.'); return; }
    if (requisicao.periodos.length !== periodos.length) { setErro('Preencha datas, destino e tipo de diária de todos os períodos.'); return; }
    setSalvando(true);
    const r = editando ? await api.put(`/api/diarias/${id}`, requisicao) : await api.post('/api/diarias', requisicao);
    setSalvando(false);
    if (!r.success) { setErro(r.message); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    avisar(r.message);
    navigate(`/diarias/${editando ? id : r.data}`);
  };

  if (carregando) return <Carregando />;

  const conflitos = simulacao?.conflitos || [];
  const errosCalculo = simulacao?.erros || [];

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina
        titulo={editando ? `Editar diária nº ${id}` : 'Lançar diária'}
        subtitulo="Cada período tem destino e um ou mais tipos de diária (ex.: 2 integrais + 1 parcial). O valor vem da Tabela de Valores."
        acoes={<Link to={editando ? `/diarias/${id}` : '/diarias'} className="btn-secundario"><Icone nome="arrow_back" /> Voltar</Link>}
      />

      <Alerta className="mb-4">{erro}</Alerta>
      {editando && situacaoAtual && situacaoAtual !== 'PENDENTE' && situacaoAtual !== 'CANCELADA' && (
        <Alerta tipo="aviso" className="mb-4">Ao salvar, a diária volta para <strong>pendente de aprovação</strong>.</Alerta>
      )}
      {legado && (
        <Alerta tipo="info" className="mb-4">
          Diária migrada do sistema antigo (código {legado}). Itens que não mudarem de tipo e de data mantêm o valor original.
        </Alerta>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <div className="xl:col-span-2 flex flex-col gap-gutter-grid">
          <section className="cartao p-padding-card flex flex-col gap-form-element-gap">
            <h3 className="font-headline-sm text-headline-sm text-primary">Servidor e objetivo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-form-element-gap">
              <Campo rotulo="Servidor *" className="md:col-span-2">
                <SeletorServidor id="servidor" valor={servidor} onSelecionar={setServidor} />
              </Campo>
              <Campo rotulo="Cidade de origem *">
                <SeletorMunicipio id="origem" valor={origem} onSelecionar={(m) => { setOrigem(m); if (m) setOrigemTexto(null); }} placeholder="De onde parte a viagem" />
              </Campo>
            </div>
            {origemTexto && !origem && (
              <Alerta tipo="aviso">Cidade de origem no sistema antigo: <strong>{origemTexto}</strong> (sem município identificado). Selecione o município, se souber.</Alerta>
            )}
            <Campo rotulo="Objetivo da viagem *">
              <textarea className="campo min-h-[80px]" required maxLength={1000} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ex.: Escolta de custodiado para audiência na comarca de Caruaru" />
            </Campo>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-form-element-gap">
              <Campo rotulo="Processo SEI">
                <input className="campo" maxLength={50} value={processoSei} onChange={(e) => setProcessoSei(e.target.value)} placeholder="0000000000.000000/0000-00" />
              </Campo>
              <Campo rotulo="Observação">
                <input className="campo" maxLength={2000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </Campo>
            </div>
          </section>

          <section className="cartao p-padding-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline-sm text-headline-sm text-primary">Períodos</h3>
              <button type="button" className="btn-secundario" onClick={() => setPeriodos([...periodos, novoPeriodo(periodos[periodos.length - 1], tipos[0]?.id)])}>
                <Icone nome="add" /> Adicionar período
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {periodos.map((p, i) => {
                const calc = calculoDe(p);
                const dias = diasEntre(p.dataInicio, p.dataFim);
                return (
                  <div key={p.chave} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                        Período {i + 1}{dias ? ` · ${dias} dia${dias > 1 ? 's' : ''}` : ''}
                      </span>
                      {periodos.length > 1 && (
                        <button type="button" className="btn-icone !p-1 hover:!text-error" onClick={() => setPeriodos(periodos.filter((x) => x.chave !== p.chave))} aria-label={`Remover período ${i + 1}`}>
                          <Icone nome="delete" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
                      <Campo rotulo="Início *" className="lg:col-span-3">
                        <CampoData required value={p.dataInicio} onChange={(e) => alterarPeriodo(p.chave, 'dataInicio', e.target.value)} />
                      </Campo>
                      <Campo rotulo="Fim *" className="lg:col-span-3">
                        <CampoData required min={p.dataInicio} value={p.dataFim} onChange={(e) => alterarPeriodo(p.chave, 'dataFim', e.target.value)} />
                      </Campo>
                      <Campo rotulo="Destino *" className="col-span-2 lg:col-span-6">
                        <SeletorMunicipio valor={p.destino} onSelecionar={(m) => alterarPeriodo(p.chave, 'destino', m)} />
                      </Campo>
                    </div>
                    {p.destinoTexto && !p.destino && (
                      <Alerta tipo="aviso" className="mt-3">
                        Destino no sistema antigo: <strong>{p.destinoTexto}</strong> (sem município identificado). Selecione o município, se souber.
                      </Alerta>
                    )}

                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="rotulo">Diárias do período</span>
                        {p.itens.length < tipos.length && (
                          <button type="button" className="font-label-md text-label-md text-primary font-semibold hover:underline inline-flex items-center gap-1" onClick={() => adicionarItem(p.chave)}>
                            <Icone nome="add" className="text-base" /> outro tipo
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {p.itens.map((it) => {
                          const itCalc = calc?.itens.find((c) => String(c.tipoDiariaId) === String(it.tipoDiariaId));
                          return (
                            <div key={it.chave} className="grid grid-cols-12 gap-2 items-center">
                              <select className="campo col-span-5" aria-label="Tipo de diária" required value={it.tipoDiariaId}
                                onChange={(e) => alterarItem(p.chave, it.chave, 'tipoDiariaId', e.target.value)}>
                                <option value="">Tipo</option>
                                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                              </select>
                              <input className="campo col-span-3 tabular" inputMode="decimal" aria-label="Quantidade"
                                placeholder={p.itens.length === 1 && dias ? `${dias} (dias)` : 'Qtd.'}
                                value={it.quantidade} onChange={(e) => alterarItem(p.chave, it.chave, 'quantidade', e.target.value.replace(/[^\d.,]/g, ''))} />
                              <span className="col-span-3 text-right font-body-md text-body-md text-on-surface-variant tabular whitespace-nowrap">
                                {itCalc ? `${fmtNumero(itCalc.quantidade)} × ${fmtMoeda(itCalc.valorUnitario)}` : ''}
                              </span>
                              <div className="col-span-1 text-right">
                                {p.itens.length > 1 && (
                                  <button type="button" className="btn-icone !p-1 hover:!text-error" onClick={() => removerItem(p.chave, it.chave)} aria-label="Remover tipo">
                                    <Icone nome="close" className="text-lg" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {calc && (
                      <div className="mt-3 pt-3 border-t border-outline-variant/60 flex justify-end font-body-md text-body-md tabular">
                        <span className="font-semibold">Subtotal {fmtMoeda(calc.valorTotal)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 self-start w-full">
          <section className="cartao p-padding-card">
            <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-2">Total do lançamento</h3>
            <p className="font-headline-lg text-headline-lg text-primary tabular">{fmtMoeda(simulacao?.valorTotal || 0)}</p>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {periodos.length} período{periodos.length > 1 ? 's' : ''} · entra como <strong>pendente de aprovação</strong>
            </p>
          </section>

          {conflitos.length > 0 && (
            <Alerta tipo="erro">
              <p className="font-semibold mb-1">O servidor já tem diária nestas datas:</p>
              <ul className="list-disc pl-4">
                {conflitos.map((c) => (
                  <li key={`${c.diariaId}-${c.dataInicio}`}>
                    {fmtData(c.dataInicio)} a {fmtData(c.dataFim)} em {c.destino} (<Link className="underline" to={`/diarias/${c.diariaId}`} target="_blank">nº {c.diariaId}</Link>)
                  </li>
                ))}
              </ul>
            </Alerta>
          )}
          {errosCalculo.length > 0 && (
            <Alerta tipo="aviso">
              <ul className="list-disc pl-4">{errosCalculo.map((e) => <li key={e}>{e}</li>)}</ul>
            </Alerta>
          )}

          <button type="submit" className="btn-primario w-full !py-3" disabled={salvando || conflitos.length > 0 || errosCalculo.length > 0}>
            {salvando ? 'Salvando...' : <><Icone nome="save" /> {editando ? 'Salvar alterações' : 'Lançar diária'}</>}
          </button>
        </aside>
      </div>
    </form>
  );
}
