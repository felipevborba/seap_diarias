import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, useAviso } from '../components/ui';
import { SeletorMunicipio, SeletorServidor } from '../components/ui/Seletores';
import { diasEntre, fmtData, fmtMoeda } from '../lib/formato';
import { useTipos } from '../lib/useDados';

let chaveSeq = 0;
const novoPeriodo = (base) => ({
  chave: ++chaveSeq,
  id: null,
  dataInicio: '',
  dataFim: '',
  tipoDiariaId: base?.tipoDiariaId || '',
  destino: base?.destino || null,
  quantidade: '',
});

function separarDestino(texto, id) {
  const i = texto.lastIndexOf('/');
  return { id, nome: texto.slice(0, i), uf: texto.slice(i + 1) };
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
  const [simulacao, setSimulacao] = useState(null);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega a diária na edição.
  useEffect(() => {
    if (!editando) return;
    (async () => {
      const r = await api.get(`/api/diarias/${id}`);
      if (!r.success) { setErro(r.message); setCarregando(false); return; }
      const d = r.data;
      if (d.situacao === 'CANCELADA') setErro('Esta diária está cancelada e não pode ser editada.');
      setServidor({ id: d.servidorId, nome: d.servidor, cpf: d.cpf, matricula: d.matricula });
      setObjetivo(d.objetivo);
      setProcessoSei(d.processoSei || '');
      setObservacao(d.observacao || '');
      setPeriodos(d.periodos.map((p) => ({
        chave: ++chaveSeq,
        id: p.id,
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        tipoDiariaId: p.tipoDiariaId,
        destino: separarDestino(p.destino, p.destinoMunicipioId),
        quantidade: Number(p.quantidade) === p.dias ? '' : String(p.quantidade).replace('.', ','),
      })));
      setCarregando(false);
    })();
  }, [editando, id]);

  // Tipo padrão (Integral) para o primeiro período.
  useEffect(() => {
    if (tipos.length && !editando)
      setPeriodos((ps) => ps.map((p) => (p.tipoDiariaId ? p : { ...p, tipoDiariaId: tipos[0].id })));
  }, [tipos, editando]);

  const requisicao = useMemo(() => ({
    servidorId: servidor?.id || 0,
    objetivo,
    processoSei,
    observacao,
    periodos: periodos
      .filter((p) => p.dataInicio && p.dataFim && p.tipoDiariaId && p.destino)
      .map((p) => ({
        id: p.id,
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        tipoDiariaId: Number(p.tipoDiariaId),
        destinoMunicipioId: p.destino.id,
        quantidade: p.quantidade === '' ? null : Number(String(p.quantidade).replace(',', '.')),
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

  const alterar = (chave, campo, valor) =>
    setPeriodos((ps) => ps.map((p) => {
      if (p.chave !== chave) return p;
      const novo = { ...p, [campo]: valor };
      if (campo === 'dataInicio' && (!p.dataFim || p.dataFim < valor)) novo.dataFim = valor;
      return novo;
    }));

  const calculoDe = (p) =>
    simulacao?.periodos.find((c) => c.dataInicio === p.dataInicio && c.dataFim === p.dataFim && c.destinoMunicipioId === p.destino?.id);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!servidor) { setErro('Selecione o servidor.'); return; }
    if (requisicao.periodos.length !== periodos.length) { setErro('Preencha datas, tipo e destino de todos os períodos.'); return; }
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
        subtitulo="Adicione quantos períodos forem necessários. O valor vem da Tabela de Valores conforme tipo, vínculo e cargo."
        acoes={<Link to={editando ? `/diarias/${id}` : '/diarias'} className="btn-secundario"><Icone nome="arrow_back" /> Voltar</Link>}
      />

      <Alerta className="mb-4">{erro}</Alerta>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <div className="xl:col-span-2 flex flex-col gap-gutter-grid">
          <section className="cartao p-padding-card flex flex-col gap-form-element-gap">
            <h3 className="font-headline-sm text-headline-sm text-primary">Servidor e objetivo</h3>
            <Campo rotulo="Servidor *">
              <SeletorServidor id="servidor" valor={servidor} onSelecionar={setServidor} />
            </Campo>
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
              <button type="button" className="btn-secundario" onClick={() => setPeriodos([...periodos, novoPeriodo(periodos[periodos.length - 1])])}>
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
                      <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Período {i + 1}</span>
                      {periodos.length > 1 && (
                        <button type="button" className="btn-icone !p-1 hover:!text-error" onClick={() => setPeriodos(periodos.filter((x) => x.chave !== p.chave))} aria-label={`Remover período ${i + 1}`}>
                          <Icone nome="delete" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
                      <Campo rotulo="Início *" className="lg:col-span-3">
                        <input type="date" className="campo" required value={p.dataInicio} onChange={(e) => alterar(p.chave, 'dataInicio', e.target.value)} />
                      </Campo>
                      <Campo rotulo="Fim *" className="lg:col-span-3">
                        <input type="date" className="campo" required min={p.dataInicio} value={p.dataFim} onChange={(e) => alterar(p.chave, 'dataFim', e.target.value)} />
                      </Campo>
                      <Campo rotulo="Tipo *" className="lg:col-span-3">
                        <select className="campo" required value={p.tipoDiariaId} onChange={(e) => alterar(p.chave, 'tipoDiariaId', e.target.value)}>
                          <option value="">Selecione</option>
                          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                      </Campo>
                      <Campo rotulo="Qtd. diárias" className="lg:col-span-3" dica={dias ? `Padrão: ${dias} (dias do período)` : undefined}>
                        <input className="campo" inputMode="decimal" value={p.quantidade} placeholder={dias ? String(dias) : ''}
                          onChange={(e) => alterar(p.chave, 'quantidade', e.target.value.replace(/[^\d.,]/g, ''))} />
                      </Campo>
                      <Campo rotulo="Destino *" className="col-span-2 lg:col-span-12">
                        <SeletorMunicipio valor={p.destino} onSelecionar={(m) => alterar(p.chave, 'destino', m)} />
                      </Campo>
                    </div>
                    {calc && (
                      <div className="mt-3 flex flex-wrap justify-end gap-x-4 font-body-md text-body-md text-on-surface-variant tabular">
                        <span>{String(calc.quantidade).replace('.', ',')} × {fmtMoeda(calc.valorUnitario)}</span>
                        <span className="font-semibold text-on-surface">= {fmtMoeda(calc.valorTotal)}</span>
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
              {periodos.length} período{periodos.length > 1 ? 's' : ''}
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
