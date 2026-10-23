import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Carregando, Icone, Modal, Selo, useAviso } from '../components/ui';
import { SeloSituacao } from '../components/ui/Situacao';
import { fmtCpf, fmtData, fmtDataHora, fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

const NOMES_CAMPO = {
  ServidorId: 'Servidor', Objetivo: 'Objetivo', ProcessoSei: 'Processo SEI', Observacao: 'Observação',
  Situacao: 'Situação', MotivoCancelamento: 'Motivo do cancelamento', MotivoRejeicao: 'Motivo da rejeição',
  ValorTotal: 'Valor total', DataInicio: 'Início', DataFim: 'Fim', TipoDiariaId: 'Tipo', DestinoMunicipioId: 'Destino',
  OrigemMunicipioId: 'Cidade de origem', Quantidade: 'Quantidade', ValorUnitario: 'Valor unitário', Ativo: 'Ativo',
  DecididoPorNome: 'Decidido por', ValorPassagens: 'Valor das passagens', Agencia: 'Agência/companhia aérea', Categoria: 'Categoria',
  DataIda: 'Data de ida', DataVolta: 'Data de volta', ValorIda: 'Valor da ida', ValorVolta: 'Valor da volta',
};
const OCULTOS = new Set(['Id', 'DiariaId', 'PeriodoId', 'AtualizadoEm', 'CriadoEm', 'CriadoPorId', 'CriadoPorNome', 'ServidorId',
  'DecididoPorId', 'DecididoEm']);
const MOEDA = new Set(['ValorTotal', 'ValorUnitario', 'ValorPassagens', 'ValorIda', 'ValorVolta']);
const DATA = new Set(['DataInicio', 'DataFim', 'DataIda', 'DataVolta']);
const valorCampo = (campo, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (MOEDA.has(campo)) return fmtMoeda(v);
  if (DATA.has(campo)) return fmtData(v);
  if (typeof v === 'number') return fmtNumero(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
};
const ACOES = { INCLUSAO: ['Inclusão', 'verde'], ALTERACAO: ['Alteração', 'azul'], EXCLUSAO: ['Exclusão', 'vermelho'] };
const ENTIDADES = { diaria: 'Diária', diaria_periodo: 'Período', diaria_item: 'Tipo de diária', diaria_passagem: 'Passagem aérea' };

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
  const navigate = useNavigate();
  const { dados: d, carregando, erro } = useDados(`/api/diarias/${id}`);
  const historico = useDados(`/api/diarias/${id}/historico`);
  const [excluindo, setExcluindo] = useState(false);
  const [erroAcao, setErroAcao] = useState('');
  const [enviando, setEnviando] = useState(false);

  const excluir = async () => {
    setErroAcao('');
    setEnviando(true);
    const r = await api.del(`/api/diarias/${id}`);
    setEnviando(false);
    if (!r.success) { setErroAcao(r.message); return; }
    avisar(r.message);
    navigate('/diarias');
  };

  if (carregando && !d) return <Carregando />;
  if (!d) return <Alerta>{erro}</Alerta>;
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
              <button type="button" className="btn-secundario !text-error" onClick={() => { setErroAcao(''); setExcluindo(true); }}><Icone nome="delete" /> Excluir</button>
              {editavel && <Link to={`/diarias/${d.id}/editar`} className="btn-primario"><Icone nome="edit" /> Editar</Link>}
            </Permitido>
          </>
        }
      />

      {d.situacao === 'CANCELADA' && <Alerta className="mb-4">Cancelada (versão anterior do sistema). Motivo: {d.motivoCancelamento}</Alerta>}
      {d.situacao === 'REJEITADA' && (
        <Alerta className="mb-4">Rejeitada por {d.decididoPorNome} em {fmtDataHora(d.decididoEm)}. Motivo: {d.motivoRejeicao}. Ao salvar uma edição ela volta a valer.</Alerta>
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
              <Info rotulo="Órgão">SEAP - Secretaria de Administração Penitenciária</Info>
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
                  <tr><th>Período</th><th>Origem → Destino</th><th>Item</th><th className="text-right">Qtd. × unitário</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {d.periodos.flatMap((p) => {
                    const linhas = [
                      ...p.itens.map((it) => ({ chave: `i${it.id}`, item: it.tipoDiaria, unit: `${fmtNumero(it.quantidade)} × ${fmtMoeda(it.valorUnitario)}`, total: it.valorTotal })),
                      ...(p.passagem ? [{
                        chave: 'pas',
                        item: (
                          <>
                            <div className="flex items-center gap-1.5"><Icone nome="flight" className="text-base text-primary" /> Passagem aérea</div>
                            <div className="font-label-md text-label-md text-on-surface-variant">
                              {p.passagem.agencia}{p.passagem.categoria ? ` · ${p.passagem.categoria}` : ''}
                              {p.passagem.dataIda ? ` · ida ${fmtData(p.passagem.dataIda)}` : ''}{p.passagem.dataVolta ? ` · volta ${fmtData(p.passagem.dataVolta)}` : ''}
                            </div>
                          </>
                        ),
                        unit: <span className="font-label-md text-label-md">ida {fmtMoeda(p.passagem.valorIda)}<br />volta {fmtMoeda(p.passagem.valorVolta)}</span>,
                        total: p.passagem.valorTotal,
                      }] : []),
                    ];
                    if (!linhas.length) linhas.push({ chave: 'vazio', item: <span className="text-on-surface-variant">Sem diárias informadas no sistema antigo</span>, unit: '', total: null });
                    return linhas.map((l, k) => (
                      <tr key={`${p.id}-${l.chave}`}>
                        {k === 0 && (
                          <>
                            <td rowSpan={linhas.length} className="whitespace-nowrap tabular align-top">
                              {fmtData(p.dataInicio)}<br /><span className="text-on-surface-variant">a</span> {fmtData(p.dataFim)}
                              {p.isentoSobreposicao && <div className="mt-1"><Selo cor="amarelo">Sobreposição herdada do legado</Selo></div>}
                            </td>
                            <td rowSpan={linhas.length} className="align-top">
                              <div className="font-label-md text-label-md text-on-surface-variant">de {p.origem}{!p.origemMunicipioId && p.origemTexto ? ' (texto do sistema antigo)' : ''}</div>
                              <div>{p.destino}</div>
                              {!p.destinoMunicipioId && <div className="font-label-md text-label-md text-on-surface-variant">sem município identificado</div>}
                            </td>
                          </>
                        )}
                        <td className="min-w-[10rem]">{l.item}</td>
                        <td className="text-right tabular whitespace-nowrap">{l.unit}</td>
                        <td className="text-right tabular font-semibold whitespace-nowrap">{l.total == null ? '' : fmtMoeda(l.total)}</td>
                      </tr>
                    ));
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="px-4 pt-3 text-right">Diárias</td>
                    <td className="px-4 pt-3 text-right tabular">{fmtMoeda(d.valorDiarias)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 text-right">Passagens aéreas</td>
                    <td className="px-4 text-right tabular">{fmtMoeda(d.valorPassagens)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 pb-3 text-right font-semibold">Total de diárias e passagens</td>
                    <td className="px-4 pb-3 text-right tabular font-bold text-primary">{fmtMoeda(d.valorTotal)}</td>
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
        aberto={excluindo}
        titulo="Excluir diária"
        onFechar={() => setExcluindo(false)}
        rodape={<>
          <button type="button" className="btn-secundario" onClick={() => setExcluindo(false)}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={enviando} onClick={excluir}><Icone nome="delete" /> Excluir definitivamente</button>
        </>}
      >
        <Alerta className="mb-4">{erroAcao}</Alerta>
        <p className="font-body-md text-body-md">
          A diária nº {d.id} de <strong>{d.servidor}</strong> ({fmtMoeda(d.valorTotal)}) será excluída e as datas ficam liberadas para novo lançamento.
          {d.origem === 'LEGADO' ? ' Ela também não volta numa nova migração do sistema antigo.' : ''}
        </p>
        <p className="font-label-md text-label-md text-on-surface-variant mt-3">Todos os dados excluídos ficam registrados na Auditoria.</p>
      </Modal>
    </>
  );
}
