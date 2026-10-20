import React, { useEffect, useState } from 'react';
import CampoData from '../components/ui/CampoData';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Carregando, Icone, Paginacao, Vazio } from '../components/ui';
import { SITUACOES, SeloSituacao } from '../components/ui/Situacao';
import { fmtCpf, fmtData, fmtMoeda } from '../lib/formato';
import { useDados, useUnidades } from '../lib/useDados';

export default function Diarias() {
  const unidades = useUnidades();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState({ busca: '', unidadeId: '', dataInicio: '', dataFim: '', situacao: params.get('situacao') || 'VIGENTES', origem: '' });
  const [aplicado, setAplicado] = useState(filtro);

  // O menu "Aprovar Diárias" abre esta mesma tela com ?situacao=PENDENTE.
  useEffect(() => {
    const situacao = params.get('situacao');
    if (!situacao) return;
    setFiltro((f) => ({ ...f, situacao }));
    setAplicado((f) => ({ ...f, situacao }));
    setPagina(1);
  }, [params]);
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro } = useDados('/api/diarias', { ...aplicado, page: pagina, pageSize: 20 });

  const set = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.value });
  const aplicar = (e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); };

  return (
    <>
      <CabecalhoPagina
        titulo="Diárias"
        subtitulo="Lançamentos por servidor, com um ou mais períodos."
        acoes={
          <>
            <Permitido perfis={['ADMIN']}>
              <button type="button" className="btn-secundario" onClick={() => { const f = { ...filtro, situacao: 'PENDENTE' }; setFiltro(f); setAplicado(f); setPagina(1); }}>
                <Icone nome="pending_actions" /> Aguardando aprovação
              </button>
            </Permitido>
            <Permitido perfis={['ADMIN', 'OPERADOR']}>
              <Link to="/diarias/nova" className="btn-primario"><Icone nome="add" /> Lançar diária</Link>
            </Permitido>
          </>
        }
      />

      <form onSubmit={aplicar} className="cartao p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <label className="lg:col-span-2 flex flex-col gap-1.5">
          <span className="rotulo">Busca</span>
          <input className="campo" value={filtro.busca} onChange={set('busca')} placeholder="Servidor, CPF, matrícula, nº (novo ou legado) ou SEI" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Lotação</span>
          <select className="campo" value={filtro.unidadeId} onChange={set('unidadeId')}>
            <option value="">Todas</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Data da diária: de</span>
          <CampoData value={filtro.dataInicio} onChange={set('dataInicio')} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Data da diária: até</span>
          <CampoData value={filtro.dataFim} onChange={set('dataFim')} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Situação</span>
          <select className="campo" value={filtro.situacao} onChange={set('situacao')}>
            {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <select className="campo" value={filtro.origem} onChange={set('origem')} aria-label="Origem">
            <option value="">Todas as origens</option>
            <option value="SISTEMA">Lançadas no sistema</option>
            <option value="LEGADO">Migradas do legado</option>
          </select>
          <button className="btn-primario !px-3" type="submit" aria-label="Filtrar"><Icone nome="search" /></button>
        </div>
      </form>

      <Alerta className="mb-4">{erro}</Alerta>

      <div className="cartao overflow-hidden">
        {carregando && !dados ? <Carregando /> : !dados?.items.length ? (
          <Vazio icone="flight" texto="Nenhuma diária encontrada para os filtros informados." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nº</th><th>Servidor</th><th>Lotação</th><th>Período</th><th>Destino(s)</th>
                    <th className="text-right">Valor</th><th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.items.map((d) => (
                    <tr key={d.id} className="cursor-pointer" onClick={() => navigate(`/diarias/${d.id}`)}>
                      <td className="tabular text-on-surface-variant">
                        {d.id}
                        {d.legadoCodigo && <div className="font-label-md text-label-md" title="Código no sistema antigo">leg. {d.legadoCodigo}</div>}
                      </td>
                      <td>
                        <div className="font-semibold">{d.servidor}</div>
                        <div className="font-label-md text-label-md text-on-surface-variant">{d.cpf ? fmtCpf(d.cpf) : 'sem CPF'}{d.matricula ? ` · Mat. ${d.matricula}` : ''}</div>
                      </td>
                      <td className="text-on-surface-variant">{d.unidade || '—'}</td>
                      <td className="whitespace-nowrap tabular">
                        {fmtData(d.inicio)} a {fmtData(d.fim)}
                        {d.qtdPeriodos > 1 && <div className="font-label-md text-label-md text-on-surface-variant">{d.qtdPeriodos} períodos</div>}
                      </td>
                      <td>{d.destinos}</td>
                      <td className="text-right tabular font-semibold whitespace-nowrap">{fmtMoeda(d.valorTotal)}</td>
                      <td><SeloSituacao situacao={d.situacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={dados.page} totalPaginas={dados.totalPages} totalItens={dados.totalItems} onMudar={setPagina} />
          </>
        )}
      </div>
    </>
  );
}
