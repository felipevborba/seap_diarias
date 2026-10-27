// Formatação pt-BR compartilhada pelas telas.

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const fmtMoeda = (v) => moeda.format(Number(v || 0));
export const fmtNumero = (v) => numero.format(Number(v || 0));

// Datas "yyyy-MM-dd" vindas da API (DateOnly) — sem passar por Date para não sofrer fuso.
export function fmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// Data (dd/mm/aaaa) de um instante UTC vindo da API, no fuso de Pernambuco.
export function fmtDataUtcLocal(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Recife' });
}

export function fmtDataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Recife' });
}

export function fmtCpf(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
}

export function mascaraCpf(valor) {
  return valor
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export const diasEntre = (ini, fim) => {
  if (!ini || !fim) return 0;
  const n = (Date.parse(fim) - Date.parse(ini)) / 86400000 + 1;
  return n > 0 ? n : 0;
};

export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const VINCULOS = [
  { valor: 'Efetivo', rotulo: 'Efetivo' },
  { valor: 'Contratado', rotulo: 'Contratado' },
  { valor: 'Comissionado', rotulo: 'Comissionado' },
  { valor: 'Cedido', rotulo: 'Cedido' },
  { valor: 'Outro', rotulo: 'Outro' },
];

// Tabela de Diárias Nacionais (Decreto Estadual nº 25.845/2003): classe do beneficiário e faixa de destino.
export const CLASSES_BENEFICIARIO = [
  { valor: 1, rotulo: 'Classe 1', descricao: 'Secretários de Estado, Secretários Executivos, presidentes de entidades' },
  { valor: 2, rotulo: 'Classe 2', descricao: 'Dirigentes, cargos em comissão, chefia/assessoramento e nível superior' },
  { valor: 3, rotulo: 'Classe 3', descricao: 'Demais servidores' },
];
export const FAIXAS_DESTINO = [
  { valor: 'CAPITAIS', grupo: 'Grupo I', rotulo: 'Capitais brasileiras (exceto Recife)' },
  { valor: 'BRASILIA_MANAUS', grupo: 'Grupo I', rotulo: 'Brasília e Manaus' },
  { valor: 'CAPITAIS_ESPECIAIS', grupo: 'Grupo I', rotulo: 'SP, RJ, BH, Porto Alegre, Belém e Fortaleza' },
  { valor: 'DEMAIS_FORA', grupo: 'Grupo II', rotulo: 'Demais cidades fora do estado' },
  { valor: 'ESTADO', grupo: 'Grupo III', rotulo: 'Recife e interior de PE, SE, AL, PB, RN e Juazeiro-BA' },
];
export const rotuloFaixa = (v) => {
  const f = FAIXAS_DESTINO.find((x) => x.valor === v);
  return f ? `${f.grupo} – ${f.rotulo}` : null;
};

export const PERFIS = [
  { valor: 'ADMIN', rotulo: 'Administrador', descricao: 'Tudo, inclusive usuários, valores e cadastros de apoio' },
  { valor: 'OPERADOR', rotulo: 'Operador', descricao: 'Lança, edita e exclui diárias; mantém servidores' },
  { valor: 'CONSULTA', rotulo: 'Consulta', descricao: 'Apenas consulta, relatórios e exportação' },
];

export const rotuloPerfil = (p) => PERFIS.find((x) => x.valor === p)?.rotulo || p;
