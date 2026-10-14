// Cliente HTTP central (mesmo contrato do CarteiraPenal: corpo { success, message, data }).
// - Anexa o token JWT; em 401 encerra a sessão e volta ao login.
// - Chaves de armazenamento próprias: a sessão das Diárias é independente da Carteira.

const TOKEN_KEY = '@DiariasSeres:token';
const USER_KEY = '@DiariasSeres:user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function salvarSessao(sessao) {
  localStorage.setItem(TOKEN_KEY, sessao.token);
  localStorage.setItem(USER_KEY, JSON.stringify(sessao));
}

export function sessaoValida() {
  const u = getUsuario();
  return !!(getToken() && u && new Date(u.expira) > new Date());
}

export function logout(redirect = true) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (redirect) window.location.href = '/';
}

function montarUrl(path, params) {
  if (!params) return path;
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function request(path, { method = 'GET', body, params, publico = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token && !publico) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(montarUrl(path, params), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { success: false, message: 'Não foi possível conectar ao servidor.', data: null };
  }

  if (res.status === 401 && !publico) {
    logout();
    return { success: false, message: 'Sessão expirada. Faça login novamente.', data: null };
  }
  if (res.status === 403) {
    return { success: false, message: 'Seu perfil não permite esta operação.', data: null };
  }
  if (res.status === 429) {
    return { success: false, message: 'Muitas tentativas. Aguarde um minuto e tente novamente.', data: null };
  }

  try {
    return await res.json();
  } catch {
    return { success: res.ok, message: res.ok ? '' : 'Resposta inválida do servidor.', data: null };
  }
}

// Baixa um arquivo (com Bearer) e dispara o download no navegador.
async function download(path, params, fallbackName = 'download') {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(montarUrl(path, params), { headers });
  } catch {
    return { success: false, message: 'Não foi possível conectar ao servidor.' };
  }
  if (res.status === 401) { logout(); return { success: false, message: 'Sessão expirada.' }; }
  if (!res.ok) return { success: false, message: 'Falha ao gerar o arquivo.' };

  let nome = fallbackName;
  const m = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '');
  if (m) nome = m[1];

  const url = window.URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return { success: true };
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body, params) => request(path, { method: 'POST', body, params }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  login: (body) => request('/api/auth/login', { method: 'POST', body, publico: true }),
  download,
};

export default api;
