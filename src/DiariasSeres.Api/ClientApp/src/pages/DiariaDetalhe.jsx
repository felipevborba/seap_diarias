import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, useAviso } from '../components/ui';
import { fmtCpf, fmtData, fmtDataHora, fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

const NOMES_CAMPO = {
  ServidorId: 'Servidor', Objetivo: 'Objetivo', ProcessoSei: 'Processo SEI', Observacao: 'Observação',
  Situacao: 'Situação', MotivoCancelamento: 'Motivo do cancelamento', ValorTotal: 'Valor total',
  DataInicio: 'Início', DataFim: 'Fim', TipoDiariaId: 'Tipo', DestinoMunicipioId: 'Destino',
  Quantidade: 'Quantidade', ValorUnitario: 'Valor unitário', Ativo: 'Ativo',
};
const OCULTOS = new Set(['Id', 'DiariaId', 'AtualizadoEm', 'CriadoEm', 'CriadoPorId', 'CriadoPorNome', 'ServidorId']);
const MOEDA = new Set(['ValorTotal', 'ValorUnitario']);
const DATA = new Set(['DataInicio', 'DataFim']);
const valorCampo = (campo, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (MOEDA.has(campo)) return fmtMoeda(v);
  if (DATA.has(campo)) return fmtData(v);
  if (typeof v === 'number') return fmtNumero(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
};
const ACOES = { INCLUSAO: ['Inclusão', 'verde'], ALTERACAO: ['Alteração', 'azul'], EXCLUSAO: ['Exclusão', 'vermelho'] };

function Info({ rotulo, children }) {
  return (
    <div>
      <dt className="rotulo !px-0">{rotulo}</dt>
      <dd className="font-body-md text-body-md mt-0.5">{children || '—'}</dd>
    </div>
  );
}

export default function DiariaDetalhe() {
  const { id } = useParams();
  const avisar = useAviso();
  const { dados: d, carregando, erro, recarregar } = useDados(`/api/diarias/${id}`);
  const historico = useDados(`/api/diarias/${id}/historico`);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroCancelar, setErroCancelar] = useState('');

  const cancelar = async () => {
    setErroCancelar('');
    const r = await api.post(`/api/diarias/${id}/cancelar`, { motivo });
    if (!r.success) { setErroCancelar(r.message); return; }
    setCancelando(false);
    avisar(r.message);
    recarregar();
    historico.recarregar();
  };

  if (carregando && !d) return <Carregando />;
  if (!d) return <Alerta>{erro}</Alerta>;
  const ativa = d.situacao === 'ATIVA';

  return (
    <>
      <CabecalhoPagina
        titulo={`Diária nº ${d.id}`}
        subtitulo={`Lançada por ${d.criadoPorNome || '—'} em ${fmtDataHora(d.criadoEm)}`}
        acoes={
          <>
            <Link to="/diarias" className="btn-secundario"><Icone nome="arrow_back" /> Voltar</Link>
            {ativa && (
              <Permitido perfis={['ADMIN', 'OPERADOR']}>
                <button type="button" className="btn-secundario !text-error" onClick={() => setCancelando(true)}><Icone nome="block" /> Cancelar</button>
                <Link to={`/diarias/${d.id}/editar`} className="btn-primario"><Icone nome="edit" /> Editar</Link>
              </Permitido>
            )}
          </>
        }
      />

      {!ativa && <Alerta className="mb-4">Cancelada. Motivo: {d.motivoCancelamento}</Alerta>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <div className="xl:col-span-2 flex flex-col gap-gutter-grid">
          <section className="cartao p-padding-card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="font-headline-sm text-headline-sm text-primary">{d.servidor}</h3>
              {ativa ? <Selo cor="verde">Ativa</Selo> : <Selo cor="vermelho">Cancelada</Selo>}
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Info rotulo="CPF">{fmtCpf(d.cpf)}</Info>
              <Info rotulo="Matrícula">{d.matricula}</Info>
              <Info rotulo="Vínculo">{d.vinculo}</Info>
              <Info rotulo="Cargo">{d.cargo}</Info>
              <Info rotulo="Lotação">{d.unidade}</Info>
              <Info rotulo="Processo SEI">{d.processoSei}</Info>
              <div className="col-span-2 md:col-span-3"><Info rotulo="Objetivo">{d.objetivo}</Info></div>
              {d.observacao && <div className="col-span-2 md:col-span-3"><Info rotulo="Observação">{d.observacao}</Info></div>}
            </dl>
            <p className="font-label-md text-label-md text-on-surface-variant mt-4">
              Vínculo, cargo e lotação registrados no momento do lançamento.
            </p>
          </section>

          <section className="cartao overflow-hidden">
            <h3 className="font-headline-sm text-headline-sm text-primary p-padding-card pb-3">Períodos</h3>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr><th>Período</th><th>Destino</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Unitário</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {d.periodos.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap tabular">{fmtData(p.dataInicio)} a {fmtData(p.dataFim)}</td>
                      <td>{p.destino}</td>
                      <td>{p.tipoDiaria}</td>
                      <td className="text-right tabular">{String(p.quantidade).replace('.', ',')}</td>
                      <td className="text-right tabular">{fmtMoeda(p.valorUnitario)}</td>
                      <td className="text-right tabular font-semibold">{fmtMoeda(p.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-semibold">Total</td>
                    <td className="px-4 py-3 text-right tabular font-bold text-primary">{fmtMoeda(d.valorTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <section className="cartao p-padding-card self-start">
          <h3 className="font-headline-sm text-headline-sm text-primary mb-4">Histórico de alterações</h3>
          {!historico.dados ? <Carregando /> : (
            <ol className="relative border-l border-outline-variant ml-2 flex flex-col gap-5">
              {historico.dados.map((h) => {
                const [rotulo, cor] = ACOES[h.acao] || [h.acao, 'neutro'];
                const campos = Object.entries(h.alteracoes).filter(([k]) => !OCULTOS.has(k));
                return (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-primary-container border-2 border-surface" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo cor={cor}>{rotulo}</Selo>
                      <span className="font-label-md text-label-md text-on-surface-variant">{h.entidade === 'diaria_periodo' ? 'Período' : 'Diária'}</span>
                    </div>
                    <p className="font-label-md text-label-md text-on-surface-variant mt-1">{h.usuarioNome || 'Sistema'} · {fmtDataHora(h.dataHora)}</p>
                    {h.acao === 'ALTERACAO' && campos.length > 0 && (
                      <ul className="mt-2 font-body-md text-body-md flex flex-col gap-1">
                        {campos.map(([k, v]) => (
                          <li key={k}>
                            <span className="text-on-surface-variant">{NOMES_CAMPO[k] || k}:</span>{' '}
                            <span className="line-through text-on-surface-variant">{valorCampo(k, v.de)}</span>{' → '}
                            <span className="font-semibold">{valorCampo(k, v.para)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <Modal
        aberto={cancelando}
        titulo="Cancelar diária"
        onFechar={() => setCancelando(false)}
        rodape={<>
          <button type="button" className="btn-secundario" onClick={() => setCancelando(false)}>Voltar</button>
          <button type="button" className="btn-perigo" onClick={cancelar} disabled={!motivo.trim()}>Confirmar cancelamento</button>
        </>}
      >
        <Alerta className="mb-4">{erroCancelar}</Alerta>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">
          As datas ficam liberadas para novo lançamento. O registro é mantido no histórico e nos relatórios de canceladas.
        </p>
        <Campo rotulo="Motivo *">
          <textarea className="campo min-h-[90px]" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      </Modal>
    </>
  );
}
