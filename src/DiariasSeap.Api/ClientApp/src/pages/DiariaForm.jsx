import React, { useEffect, useMemo, useState } from 'react';
import CampoData from '../components/ui/CampoData';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, useAviso } from '../components/ui';
import { SeletorMunicipio, SeletorServidor } from '../components/ui/Seletores';
import { diasEntre, fmtData, fmtMoeda, fmtNumero } from '../lib/formato';
import { useTipos } from '../lib/useDados';

export const ORGAO = 'SEAP - Secretaria de Administração Penitenciária';
// Decreto nº 38.560/2012, art. 4º: passagens na categoria econômica, salvo exceções (Governador, Secretários).
const CATEGORIAS = ['ECONÔMICA', 'EXECUTIVA', 'PRIMEIRA CLASSE'];

let chaveSeq = 0;
const novoItem = (tipoDiariaId = '') => ({ chave: ++chaveSeq, id: null, tipoDiariaId, quantidade: '' });
const novaPassagem = (p) => ({ agencia: '', categoria: CATEGORIAS[0], dataIda: p.dataInicio || '', dataVolta: p.dataFim || '', valorIda: '', valorVolta: '' });
// Próximo período repete origem, destino e tipo do anterior (lançamentos com datas variadas para o mesmo trecho).
const novoPeriodo = (base, tipoPadrao) => ({
  chave: ++chaveSeq,
  id: null,
  dataInicio: '',
  dataFim: '',
  origem: base?.origem || null,
  origemTexto: null,
  destino: base?.destino || null,
  destinoTexto: null,
  itens: [novoItem(base?.itens?.[0]?.tipoDiariaId || tipoPadrao || '')],
  passagem: null,
});

function separarMunicipio(texto, id) {
  const i = texto.lastIndexOf('/');
  return { id, nome: texto.slice(0, i), uf: texto.slice(i + 1) };
}

// Quantidade aceita "1,5" ou "1.5"; valores em R$ só têm vírgula (o campo não aceita ponto).
const numero = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
const moedaParaCampo = (v) => (v ? Number(v).toFixed(2).replace('.', ',') : '');
const totalPassagem = (x) => (numero(x.valorIda) || 0) + (numero(x.valorVolta) || 0);

function CampoMoeda({ value, onChange, ...props }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-body-md text-body-md pointer-events-none">R$</span>
      <input className="campo !pl-9 tabular" inputMode="decimal" placeholder="0,00" value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,]/g, ''))} {...props} />
    </div>
  );
}

function TotalCartao({ rotulo, valor, destaque, children }) {
  return (
    <section className={`cartao p-padding-card ${destaque ? 'border-2 !border-primary' : ''}`}>
      <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-1">{rotulo}</h3>
      <p className={`tabular ${destaque ? 'font-headline-lg text-headline-lg text-primary' : 'font-headline-sm text-headline-sm text-on-surface'}`}>{fmtMoeda(valor || 0)}</p>
      {children}
    </section>
  );
}

export default function DiariaForm() {
  const { id } = useParams();
  const editando = !!id;
  const navigate = useNavigate();
  const avisar = useAviso();
  const tipos = useTipos(true);

  const [servidor, setServidor] = useState(null);
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
      setServidor({ id: d.servidorId, nome: d.servidor, cpf: d.cpf, matricula: d.matricula, unidade: d.unidade });
      setObjetivo(d.objetivo);
      setProcessoSei(d.processoSei || '');
      setObservacao(d.observacao || '');
      setPeriodos(d.periodos.map((p) => ({
        chave: ++chaveSeq,
        id: p.id,
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        origem: p.origemMunicipioId ? separarMunicipio(p.origem, p.origemMunicipioId) : null,
        origemTexto: p.origemMunicipioId ? null : p.origemTexto,
        destino: p.destinoMunicipioId ? separarMunicipio(p.destino, p.destinoMunicipioId) : null,
        destinoTexto: p.destinoMunicipioId ? null : p.destinoTexto,
        itens: p.itens.map((i) => ({
          chave: ++chaveSeq,
          id: i.id,
          tipoDiariaId: i.tipoDiariaId,
          quantidade: p.itens.length === 1 && Number(i.quantidade) === p.dias ? '' : String(i.quantidade).replace('.', ','),
        })),
        passagem: p.passagem ? {
          agencia: p.passagem.agencia || '',
          categoria: p.passagem.categoria || '',
          dataIda: p.passagem.dataIda || '',
          dataVolta: p.passagem.dataVolta || '',
          valorIda: moedaParaCampo(p.passagem.valorIda),
          valorVolta: moedaParaCampo(p.passagem.valorVolta),
        } : null,
      })));
      setCarregando(false);
    })();
  }, [editando, id]);

  // Tipo padrão (o primeiro ativo, normalmente "Integral") nos itens ainda sem tipo.
  useEffect(() => {
    if (!tipos.length || editando) return;
    setPeriodos((ps) => ps.map((p) => ({ ...p, itens: p.itens.map((i) => (i.tipoDiariaId ? i : { ...i, tipoDiariaId: tipos[0].id })) })));
  }, [tipos, editando]);

  const completo = (p) => p.dataInicio && p.dataFim && (p.destino || p.destinoTexto) && (p.origem || p.origemTexto)
    && (p.itens.length || p.passagem) && p.itens.every((i) => i.tipoDiariaId);

  const requisicao = useMemo(() => ({
    servidorId: servidor?.id || 0,
    objetivo,
    processoSei,
    observacao,
    periodos: periodos.filter(completo).map((p) => ({
      id: p.id,
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
      origemMunicipioId: p.origem?.id ?? null,
      destinoMunicipioId: p.destino?.id ?? null,
      itens: p.itens.map((i) => ({ id: i.id, tipoDiariaId: Number(i.tipoDiariaId), quantidade: numero(i.quantidade) })),
      passagem: p.passagem ? {
        agencia: p.passagem.agencia,
        categoria: p.passagem.categoria,
        dataIda: p.passagem.dataIda || null,
        dataVolta: p.passagem.dataVolta || null,
        valorIda: numero(p.passagem.valorIda),
        valorVolta: numero(p.passagem.valorVolta),
      } : null,
    })),
  }), [servidor, objetivo, processoSei, observacao, periodos]);

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
      if (campo === 'origem' && valor) novo.origemTexto = null;
      return novo;
    }));

  const alterarPassagem = (chave, campo, valor) =>
    setPeriodos((ps) => ps.map((p) => (p.chave !== chave ? p : { ...p, passagem: { ...p.passagem, [campo]: valor } })));

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
    if (requisicao.periodos.length !== periodos.length) {
      setErro('Preencha datas, cidade de origem, destino e diárias (ou passagem aérea) de todos os períodos.');
      return;
    }
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
  const qtdPassagens = periodos.filter((p) => p.passagem).length;

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina
        titulo={editando ? `Editar diária nº ${id}` : 'Lançar diária'}
        subtitulo="Cada período tem origem, destino e um ou mais tipos de diária (ex.: 2 integrais + 1 parcial), com valor da Tabela de Valores, e pode ter passagem aérea. A diária fica aprovada no lançamento."
        acoes={<Link to={editando ? `/diarias/${id}` : '/diarias'} className="btn-secundario"><Icone nome="arrow_back" /> Voltar</Link>}
      />

      <Alerta className="mb-4">{erro}</Alerta>
      {editando && (situacaoAtual === 'PENDENTE' || situacaoAtual === 'REJEITADA') && (
        <Alerta tipo="info" className="mb-4">Esta diária ficou {situacaoAtual === 'PENDENTE' ? 'pendente' : 'rejeitada'} na etapa de aprovação, que não existe mais. Ao salvar, ela fica aprovada.</Alerta>
      )}
      {legado && (
        <Alerta tipo="info" className="mb-4">
          Diária migrada do sistema antigo (código {legado}). Itens que não mudarem de tipo e de data mantêm o valor original.
        </Alerta>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <div className="xl:col-span-2 flex flex-col gap-gutter-grid">
          <section className="cartao p-padding-card flex flex-col gap-form-element-gap">
            <h3 className="font-headline-sm text-headline-sm text-primary">Servidor e finalidade</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-form-element-gap">
              <Campo rotulo="Servidor *" className="md:col-span-2">
                <SeletorServidor id="servidor" valor={servidor} onSelecionar={setServidor} />
              </Campo>
              <Campo rotulo="Órgão">
                <input className="campo" value="SEAP" disabled title={ORGAO} aria-label={`Órgão: ${ORGAO}`} />
              </Campo>
            </div>
            {servidor && (servidor.matricula || servidor.unidade) && (
              <p className="font-label-md text-label-md text-on-surface-variant -mt-2">
                {servidor.matricula ? `Matrícula ${servidor.matricula}` : ''}{servidor.matricula && servidor.unidade ? ' · ' : ''}{servidor.unidade ? `Lotação: ${servidor.unidade}` : ''}
              </p>
            )}
            <Campo rotulo="Finalidade (objetivo da viagem) *">
              <textarea className="campo min-h-[80px]" required maxLength={1000} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ex.: Escolta de custodiado para audiência na comarca de Caruaru" />
            </Campo>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-form-element-gap">
              <Campo rotulo="Processo SEI">
                <input className="campo" maxLength={50} value={processoSei} onChange={(e) => setProcessoSei(e.target.value)} placeholder="0000000000.000000/0000-00" />
              </Campo>
              <Campo rotulo="Observação">
                <input className="campo" maxLength={2000} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: CI nº 98" />
              </Campo>
            </div>
          </section>

          <section className="cartao p-padding-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary">Períodos</h3>
                <p className="font-label-md text-label-md text-on-surface-variant">Datas variadas no mesmo lançamento: adicione um período para cada data ou intervalo.</p>
              </div>
              <button type="button" className="btn-secundario shrink-0" onClick={() => setPeriodos([...periodos, novoPeriodo(periodos[periodos.length - 1], tipos[0]?.id)])}>
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
                      <Campo rotulo="Cidade de origem *" className="col-span-2 lg:col-span-3">
                        <SeletorMunicipio valor={p.origem} onSelecionar={(m) => alterarPeriodo(p.chave, 'origem', m)} placeholder="De onde parte" />
                      </Campo>
                      <Campo rotulo="Destino *" className="col-span-2 lg:col-span-3">
                        <SeletorMunicipio valor={p.destino} onSelecionar={(m) => alterarPeriodo(p.chave, 'destino', m)} placeholder="Para onde vai" />
                      </Campo>
                    </div>
                    {p.origemTexto && !p.origem && (
                      <Alerta tipo="aviso" className="mt-3">
                        Cidade de origem no sistema antigo: <strong>{p.origemTexto}</strong> (sem município identificado). Selecione o município, se souber.
                      </Alerta>
                    )}
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
                            <Icone nome="add" className="text-base" /> {p.itens.length ? 'outro tipo' : 'diária'}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {p.itens.length === 0 && <p className="font-body-md text-body-md text-on-surface-variant">Só passagem aérea neste período.</p>}
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
                                {(p.itens.length > 1 || p.passagem) && (
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

                    <div className="mt-4">
                      {!p.passagem ? (
                        <button type="button" className="font-label-md text-label-md text-primary font-semibold hover:underline inline-flex items-center gap-1"
                          onClick={() => alterarPeriodo(p.chave, 'passagem', novaPassagem(p))}>
                          <Icone nome="flight" className="text-base" /> Adicionar passagem aérea
                        </button>
                      ) : (
                        <div className="rounded-lg border border-outline-variant p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="rotulo inline-flex items-center gap-1"><Icone nome="flight" className="text-base" /> Passagem aérea</span>
                            <button type="button" className="btn-icone !p-1 hover:!text-error" aria-label="Remover passagem aérea"
                              onClick={() => alterarPeriodo(p.chave, 'passagem', null)}><Icone nome="close" className="text-lg" /></button>
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Campo rotulo="Agência / companhia aérea *" className="col-span-2 lg:col-span-3">
                              <input className="campo" maxLength={200} value={p.passagem.agencia} placeholder="Ex.: GOL"
                                onChange={(e) => alterarPassagem(p.chave, 'agencia', e.target.value)} />
                            </Campo>
                            <Campo rotulo="Categoria" className="col-span-2 lg:col-span-1">
                              <select className="campo" value={p.passagem.categoria} onChange={(e) => alterarPassagem(p.chave, 'categoria', e.target.value)}>
                                <option value="">Não informada</option>
                                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </Campo>
                            <Campo rotulo="Data de ida">
                              <CampoData value={p.passagem.dataIda} onChange={(e) => alterarPassagem(p.chave, 'dataIda', e.target.value)} />
                            </Campo>
                            <Campo rotulo="Valor da ida">
                              <CampoMoeda value={p.passagem.valorIda} onChange={(v) => alterarPassagem(p.chave, 'valorIda', v)} aria-label="Valor da passagem de ida" />
                            </Campo>
                            <Campo rotulo="Data de volta">
                              <CampoData value={p.passagem.dataVolta} min={p.passagem.dataIda} onChange={(e) => alterarPassagem(p.chave, 'dataVolta', e.target.value)} />
                            </Campo>
                            <Campo rotulo="Valor da volta">
                              <CampoMoeda value={p.passagem.valorVolta} onChange={(v) => alterarPassagem(p.chave, 'valorVolta', v)} aria-label="Valor da passagem de volta" />
                            </Campo>
                          </div>
                          <p className="mt-2 text-right font-body-md text-body-md tabular">Total da passagem aérea <strong>{fmtMoeda(totalPassagem(p.passagem))}</strong></p>
                        </div>
                      )}
                    </div>

                    {calc && (
                      <div className="mt-3 pt-3 border-t border-outline-variant/60 flex justify-end gap-4 font-body-md text-body-md tabular">
                        <span>Diárias {fmtMoeda(calc.valorTotal)}</span>
                        {calc.passagem && <span>Passagem {fmtMoeda(calc.passagem.valorTotal)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 self-start w-full">
          <TotalCartao rotulo="Total do lançamento de diárias" valor={simulacao?.valorDiarias}>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {periodos.length} período{periodos.length > 1 ? 's' : ''} · aprovada no lançamento
            </p>
          </TotalCartao>
          <TotalCartao rotulo="Total do lançamento de passagens aéreas" valor={simulacao?.valorPassagens}>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {qtdPassagens ? `${qtdPassagens} passage${qtdPassagens > 1 ? 'ns' : 'm'}` : 'Nenhuma passagem'}
            </p>
          </TotalCartao>
          <TotalCartao destaque rotulo="Total de diárias e passagens aéreas" valor={simulacao?.valorTotal} />

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
