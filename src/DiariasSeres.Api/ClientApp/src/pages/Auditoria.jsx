import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, CabecalhoPagina, Carregando, Icone, Paginacao, Selo, Vazio } from '../components/ui';
import { fmtDataHora } from '../lib/formato';
import { useDados } from '../lib/useDados';

const ENTIDADES = {
  diaria: 'Diária', diaria_periodo: 'Período de diária', servidor: 'Servidor', valor_diaria: 'Tabela de valores',
  tipo_diaria: 'Tipo de diária', cargo: 'Cargo', regiao: 'Região', usuario_perfil: 'Acesso de usuário',
};
const ACOES = { INCLUSAO: ['Inclusão', 'verde'], ALTERACAO: ['Alteração', 'azul'], EXCLUSAO: ['Exclusão', 'vermelho'] };

function resumo(alteracoes, acao) {
  const campos = Object.entries(alteracoes).filter(([k]) => !['Id', 'AtualizadoEm', 'CriadoEm'].includes(k));
  if (acao !== 'ALTERACAO') return `${campos.length} campos`;
  return campos.map(([k, v]) => `${k}: ${v.de ?? '—'} → ${v.para ?? '—'}`).join(' · ');
}

export default function Auditoria() {
  const [filtro, setFiltro] = useState({ entidade: '', usuario: '', dataInicio: '', dataFim: '' });
  const [aplicado, setAplicado] = useState(filtro);
  const [pagina, setPagina] = useState(1);
  const { dados, carregando, erro } = useDados('/api/relatorios/auditoria', { ...aplicado, page: pagina, pageSize: 50 });
  const set = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.value });

  return (
    <>
      <CabecalhoPagina titulo="Auditoria" subtitulo="Quem alterou o quê e quando, em todos os cadastros e lançamentos do módulo." />
      <form className="cartao p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); }}>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Registro</span>
          <select className="campo" value={filtro.entidade} onChange={set('entidade')}>
            <option value="">Todos</option>{Object.entries(ENTIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Usuário</span>
          <input className="campo" value={filtro.usuario} onChange={set('usuario')} /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">De</span>
          <input type="date" className="campo" value={filtro.dataInicio} onChange={set('dataInicio')} /></label>
        <label className="flex flex-col gap-1.5"><span className="rotulo">Até</span>
          <input type="date" className="campo" value={filtro.dataFim} onChange={set('dataFim')} /></label>
        <button className="btn-primario" type="submit"><Icone nome="search" /> Filtrar</button>
      </form>

      <Alerta className="mb-4">{erro}</Alerta>
      <div className="cartao overflow-hidden">
        {carregando && !dados ? <Carregando /> : !dados?.items.length ? <Vazio icone="history" texto="Nenhum registro de auditoria." /> : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Alterações</th></tr></thead>
                <tbody>
                  {dados.items.map((a) => {
                    const [rotulo, cor] = ACOES[a.acao] || [a.acao, 'neutro'];
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap tabular">{fmtDataHora(a.dataHora)}</td>
                        <td>{a.usuarioNome || 'Sistema'}</td>
                        <td><Selo cor={cor}>{rotulo}</Selo></td>
                        <td className="whitespace-nowrap">
                          {ENTIDADES[a.entidade] || a.entidade} #{a.entidadeId}
                          {a.raizEntidade === 'diaria' && (
                            <div><Link className="font-label-md text-label-md text-primary hover:underline" to={`/diarias/${a.raizId}`}>Diária nº {a.raizId}</Link></div>
                          )}
                        </td>
                        <td className="font-label-md text-label-md text-on-surface-variant max-w-md break-words">{resumo(a.alteracoes, a.acao)}</td>
                      </tr>
                    );
                  })}
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
