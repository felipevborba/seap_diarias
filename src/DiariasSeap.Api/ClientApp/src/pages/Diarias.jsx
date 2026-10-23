import React, { useState } from 'react';
import CampoData from '../components/ui/CampoData';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Carregando, Icone, Modal, Paginacao, Vazio, useAviso } from '../components/ui';
import { SITUACOES, SeloSituacao } from '../components/ui/Situacao';
import { fmtCpf, fmtData, fmtMoeda } from '../lib/formato';
import { useDados, useUnidades } from '../lib/useDados';

export default function Diarias() {
  const unidades = useUnidades();
  const navigate = useNavigate();
  const avisar = useAviso();
  const [filtro, setFiltro] = useState({ busca: '', unidadeId: '', dataInicio: '', dataFim: '', situacao: 'VIGENTES', origem: '' });
  const [aplicado, setAplicado] = useState(filtro);
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro, recarregar } = useDados('/api/diarias', { ...aplicado, page: pagina, pageSize: 20 });
  const [excluir, setExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  const confirmarExclusao = async () => {
    setExcluindo(true);
    const r = await api.del(`/api/diarias/${excluir.id}`);
    setExcluindo(false);
    avisar(r.message, r.success ? 'sucesso' : 'erro');
    if (r.success) { setExcluir(null); recarregar(); }
  };

  const set = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.value });
  const aplicar = (e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); };

  return (
    <>
      <CabecalhoPagina
        titulo="Diárias"
        subtitulo="Lançamentos por servidor, com um ou mais períodos."
        acoes={
          <Permitido perfis={['ADMIN', 'OPERADOR']}>
            <Link to="/diarias/nova" className="btn-primario"><Icone nome="add" /> Lançar diária</Link>
          </Permitido>
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
                    <th className="text-right">Valor</th><th>Situação</th><Permitido perfis={['ADMIN', 'OPERADOR']}><th /></Permitido>
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
                      <Permitido perfis={['ADMIN', 'OPERADOR']}>
                        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Link to={`/diarias/${d.id}/editar`} className="btn-icone" aria-label={`Editar diária ${d.id}`} title="Editar"><Icone nome="edit" /></Link>
                          <button type="button" className="btn-icone hover:!text-error" aria-label={`Excluir diária ${d.id}`} title="Excluir" onClick={() => setExcluir(d)}>
                            <Icone nome="delete" />
                          </button>
                        </td>
                      </Permitido>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={dados.page} totalPaginas={dados.totalPages} totalItens={dados.totalItems} onMudar={setPagina} />
          </>
        )}
      </div>

      <Modal aberto={!!excluir} titulo="Excluir diária" onFechar={() => setExcluir(null)}
        rodape={<><button type="button" className="btn-secundario" onClick={() => setExcluir(null)}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={excluindo} onClick={confirmarExclusao}><Icone nome="delete" /> Excluir definitivamente</button></>}>
        {excluir && (
          <>
            <p className="font-body-md text-body-md">
              A diária nº {excluir.id} de <strong>{excluir.servidor}</strong> ({fmtData(excluir.inicio)} a {fmtData(excluir.fim)}, {fmtMoeda(excluir.valorTotal)})
              será excluída e as datas ficam liberadas para novo lançamento.
            </p>
            <p className="font-label-md text-label-md text-on-surface-variant mt-3">Todos os dados excluídos ficam registrados na Auditoria.</p>
          </>
        )}
      </Modal>
    </>
  );
}
