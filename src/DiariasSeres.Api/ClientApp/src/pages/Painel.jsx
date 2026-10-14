import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Permitido } from '../components/layout/Layout';
import { Alerta, CabecalhoPagina, Carregando, Icone } from '../components/ui';
import { BarrasHorizontais, ColunasMensais, Indicador } from '../components/ui/Graficos';
import { fmtMoeda, fmtNumero } from '../lib/formato';
import { useDados } from '../lib/useDados';

export default function Painel() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const { dados: d, carregando, erro } = useDados('/api/relatorios/dashboard', { ano });

  return (
    <>
      <CabecalhoPagina
        titulo="Painel de diárias"
        subtitulo="Custos e volume por mês, região, tipo, destino e lotação. Diárias canceladas não entram."
        acoes={
          <>
            <select className="campo !w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
              {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Permitido perfis={['ADMIN', 'OPERADOR']}>
              <Link to="/diarias/nova" className="btn-primario"><Icone nome="add" /> Lançar diária</Link>
            </Permitido>
          </>
        }
      />
      <Alerta className="mb-4">{erro}</Alerta>
      {carregando && !d ? <Carregando /> : d && (
        <div className="flex flex-col gap-gutter-grid">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-grid">
            <Indicador destaque rotulo={`Gasto com diárias em ${d.ano}`} valor={fmtMoeda(d.totais.valorTotal)} />
            <Indicador rotulo="Diárias lançadas" valor={fmtNumero(d.totais.diarias)} />
            <Indicador rotulo="Servidores atendidos" valor={fmtNumero(d.totais.servidores)} />
            <Indicador rotulo="Quantidade de diárias" valor={fmtNumero(d.totais.quantidade)}
              detalhe={d.totais.quantidade > 0 ? `Média de ${fmtMoeda(d.totais.valorTotal / d.totais.quantidade)} por diária` : undefined} />
          </div>
          <ColunasMensais titulo="Gasto por mês" subtitulo="Pelo mês de início de cada período" dados={d.porMes} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter-grid">
            <BarrasHorizontais titulo="Gasto por região" subtitulo="Região do município de destino" dados={d.porRegiao} />
            <BarrasHorizontais titulo="Gasto por tipo de diária" dados={d.porTipo} />
            <BarrasHorizontais titulo="10 destinos com maior gasto" dados={d.porDestino} />
            <BarrasHorizontais titulo="10 lotações com maior gasto" dados={d.porUnidade} />
          </div>
        </div>
      )}
    </>
  );
}
