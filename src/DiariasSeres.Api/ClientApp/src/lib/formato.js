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

export function fmtDataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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

export const PERFIS = [
  { valor: 'ADMIN', rotulo: 'Administrador', descricao: 'Tudo, inclusive usuários, valores e cadastros de apoio' },
  { valor: 'OPERADOR', rotulo: 'Operador', descricao: 'Lança, edita e cancela diárias; mantém servidores' },
  { valor: 'CONSULTA', rotulo: 'Consulta', descricao: 'Apenas consulta, relatórios e exportação' },
];

export const rotuloPerfil = (p) => PERFIS.find((x) => x.valor === p)?.rotulo || p;
