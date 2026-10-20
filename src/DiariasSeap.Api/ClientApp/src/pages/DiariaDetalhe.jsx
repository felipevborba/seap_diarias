import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Campo, Carregando, Icone, Modal, Selo, useAviso } from '../components/ui';
import { SeloSituacao } from '../components/ui/Situacao';
import { fmtCpf, fmtData, fmtDataHora, fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

const NOMES_CAMPO = {
  ServidorId: 'Servidor', Objetivo: 'Objetivo', ProcessoSei: 'Processo SEI', Observacao: 'Observação',
  Situacao: 'Situação', MotivoCancelamento: 'Motivo do cancelamento', MotivoRejeicao: 'Motivo da rejeição',
  ValorTotal: 'Valor total', DataInicio: 'Início', DataFim: 'Fim', TipoDiariaId: 'Tipo', DestinoMunicipioId: 'Destino',
  Quantidade: 'Quantidade', ValorUnitario: 'Valor unitário', Ativo: 'Ativo', DecididoPorNome: 'Decidido por',
};
const OCULTOS = new Set(['Id', 'DiariaId', 'PeriodoId', 'AtualizadoEm', 'CriadoEm', 'CriadoPorId', 'CriadoPorNome', 'ServidorId',
  'DecididoPorId', 'DecididoEm']);
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
const ENTIDADES = { diaria: 'Diária', diaria_periodo: 'Período', diaria_item: 'Tipo de diária' };

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
  const [acao, setAcao] = useState(null); // 'cancelar' | 'rejeitar'
  const [motivo, setMotivo] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [enviando, setEnviando] = useState(false);

  const executar = async (rota, corpo) => {
    setErroAcao('');
    setEnviando(true);
    const r = await api.post(`/api/diarias/${id}/${rota}`, corpo);
    setEnviando(false);
    if (!r.success) { setErroAcao(r.message); avisar(r.message, 'erro'); return; }
    setAcao(null);
    setMotivo('');
    avisar(r.message);
    recarregar();
    historico.recarregar();
  };

  if (carregando && !d) return <Carregando />;
  if (!d) return <Alerta>{erro}</Alerta>;
  const vigente = d.situacao === 'PENDENTE' || d.situacao === 'APROVADA';
  const editavel = d.situacao !== 'CANCELADA';

  return (
    <>
      <CabecalhoPagina
        titulo={`Diária nº ${d.id}`}
        subtitulo={`Lançada por ${d.criadoPorNome || '—'} em ${fmtDataHora(d.criadoEm)}${d.origem === 'LEGADO' ? ` · migrada do sistema antigo (código ${d.legadoCodigo})` : ''}`}
        acoes={
          <>
            <Link to="/diarias" className="btn-secundario"><Icone nome="arrow_back" /> Voltar</Link>
            <Permitido perfis={['ADMIN', 'OPERADOR']}>
              {vigente && <button type="button" className="btn-secundario !text-error" onClick={() => setAcao('cancelar')}><Icone nome="block" /> Cancelar</button>}
              {editavel && <Link to={`/diarias/${d.id}/editar`} className="btn-secundario"><Icone nome="edit" /> Editar</Link>}
            </Permitido>
            {d.situacao === 'PENDENTE' && (
              <Permitido perfis={['ADMIN']}>
                <button type="button" className="btn-secundario !text-error" onClick={() => setAcao('rejeitar')}><Icone nome="thumb_down" /> Rejeitar</button>
                <button type="button" className="btn-primario" disabled={enviando} onClick={() => executar('aprovar')}><Icone nome="check_circle" /> Aprovar</button>
              </Permitido>
            )}
          </>
        }
      />

      {d.situacao === 'CANCELADA' && <Alerta className="mb-4">Cancelada. Motivo: {d.motivoCancelamento}</Alerta>}
      {d.situacao === 'REJEITADA' && (
        <Alerta className="mb-4">Rejeitada por {d.decididoPorNome} em {fmtDataHora(d.decididoEm)}. Motivo: {d.motivoRejeicao}. Edite para reenviar à aprovação.</Alerta>
      )}
      {d.situacao === 'APROVADA' && d.decididoPorNome && (
        <Alerta tipo="sucesso" className="mb-4">Aprovada por {d.decididoPorNome}{d.decididoEm ? ` em ${fmtDataHora(d.decididoEm)}` : ''}.</Alerta>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-grid">
        <div className="xl:col-span-2 flex flex-col gap-gutter-grid">
          <section className="cartao p-padding-card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="font-headline-sm text-headline-sm text-primary">{d.servidor}</h3>
              <SeloSituacao situacao={d.situacao} />
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Info rotulo="CPF">{d.cpf ? fmtCpf(d.cpf) : 'Não informado (legado)'}</Info>
              <Info rotulo="Matrícula">{d.matricula}</Info>
              <Info rotulo="Vínculo">{d.vinculo}</Info>
              <Info rotulo="Cargo">{d.cargo}</Info>
              <Info rotulo="Lotação">{d.unidade}</Info>
              <Info rotulo="Cidade de origem">{d.cidadeOrigem}{!d.cidadeOrigemId && d.cidadeOrigemTexto ? ' (texto do sistema antigo)' : ''}</Info>
              <Info rotulo="Data do cadastro">{fmtDataHora(d.criadoEm)}</Info>
              <Info rotulo="Processo SEI">{d.processoSei}</Info>
              <div className="col-span-2 md:col-span-3"><Info rotulo="Objetivo">{d.objetivo}</Info></div>
              {d.observacao && <div className="col-span-2 md:col-span-3"><Info rotulo="Observação">{d.observacao}</Info></div>}
            </dl>
            <p className="font-label-md text-label-md text-on-surface-variant mt-4">Vínculo, cargo e lotação registrados no momento do lançamento.</p>
          </section>

          <section className="cartao overflow-hidden">
            <h3 className="font-headline-sm text-headline-sm text-primary p-padding-card pb-3">Períodos</h3>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr><th>Período</th><th>Destino</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Unitário</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {d.periodos.flatMap((p) => p.itens.length ? p.itens.map((it, k) => (
                    <tr key={`${p.id}-${it.id}`}>
                      {k === 0 && (
                        <>
                          <td rowSpan={p.itens.length} className="whitespace-nowrap tabular">
                            {fmtData(p.dataInicio)} a {fmtData(p.dataFim)}
                            {p.isentoSobreposicao && <div className="mt-1"><Selo cor="amarelo">Sobreposição herdada do legado</Selo></div>}
                          </td>
                          <td rowSpan={p.itens.length}>
                            {p.destino}
                            {!p.destinoMunicipioId && <div className="font-label-md text-label-md text-on-surface-variant">sem município identificado</div>}
                          </td>
                        </>
                      )}
                      <td>{it.tipoDiaria}</td>
                      <td className="text-right tabular">{fmtNumero(it.quantidade)}</td>
                      <td className="text-right tabular">{fmtMoeda(it.valorUnitario)}</td>
                      <td className="text-right tabular font-semibold">{fmtMoeda(it.valorTotal)}</td>
                    </tr>
                  )) : [(
                    <tr key={p.id}>
                      <td className="whitespace-nowrap tabular">{fmtData(p.dataInicio)} a {fmtData(p.dataFim)}</td>
                      <td>{p.destino}</td>
                      <td colSpan={4} className="text-on-surface-variant">Sem diárias informadas no sistema antigo</td>
                    </tr>
                  )])}
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
          {!historico.dados ? <Carregando /> : historico.dados.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {d.origem === 'LEGADO' ? 'Sem alterações desde a migração do sistema antigo.' : 'Sem registros.'}
            </p>
          ) : (
            <ol className="relative border-l border-outline-variant ml-2 flex flex-col gap-5">
              {historico.dados.map((h) => {
                const [rotulo, cor] = ACOES[h.acao] || [h.acao, 'neutro'];
                const campos = Object.entries(h.alteracoes).filter(([k]) => !OCULTOS.has(k));
                return (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-primary-container border-2 border-surface" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo cor={cor}>{rotulo}</Selo>
                      <span className="font-label-md text-label-md text-on-surface-variant">{ENTIDADES[h.entidade] || h.entidade}</span>
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
        aberto={!!acao}
        titulo={acao === 'rejeitar' ? 'Rejeitar diária' : 'Cancelar diária'}
        onFechar={() => setAcao(null)}
        rodape={<>
          <button type="button" className="btn-secundario" onClick={() => setAcao(null)}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={!motivo.trim() || enviando}
            onClick={() => executar(acao === 'rejeitar' ? 'rejeitar' : 'cancelar', { motivo })}>
            {acao === 'rejeitar' ? 'Confirmar rejeição' : 'Confirmar cancelamento'}
          </button>
        </>}
      >
        <Alerta className="mb-4">{erroAcao}</Alerta>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">
          {acao === 'rejeitar'
            ? 'As datas ficam liberadas. Quem lançou pode corrigir e reenviar a diária para aprovação.'
            : 'As datas ficam liberadas para novo lançamento. O registro é mantido no histórico e nos relatórios de canceladas.'}
        </p>
        <Campo rotulo="Motivo *">
          <textarea className="campo min-h-[90px]" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </Modal>
    </>
  );
}
