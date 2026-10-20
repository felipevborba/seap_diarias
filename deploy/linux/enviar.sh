#!/usr/bin/env bash
# Envia o pacote ao servidor do CarteiraPenal e roda o instalador com sudo (requer VPN).
# Pede a senha de SSH (e a de sudo, se exigida). Rode publicar-linux.sh antes.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SAIDA="${SAIDA:-$RAIZ/../publish/diarias-linux}"
HOST="${HOST:-10.238.118.252}"
PORT="${PORT:-7654}"
SSH_USER="${SSH_USER:-interagi}"
# Staging em /var: o /home do servidor tem menos de 1 GB livre (o pacote tem ~124 MB) e /var tem ~5 GB.
# /var/tmp não é gravável pelo usuário de deploy; a pasta é criada com sudo e entregue a ele
# (mesmo esquema do /var/gdf-migracao do CarteiraPenal).
STAGING="${STAGING:-/var/diarias-deploy}"

[ -x "$SAIDA/DiariasSeap.Api" ] || { echo "Pacote não encontrado em $SAIDA. Rode deploy/linux/publicar-linux.sh"; exit 1; }

# Uma conexão SSH compartilhada: a senha é pedida uma única vez para envio + instalação.
CTL="/tmp/diarias-ssh-%r@%h:%p"
SSH_OPTS=(-p "$PORT" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=120)
trap 'ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$HOST" 2>/dev/null || true' EXIT

echo ">> Conectando em $SSH_USER@$HOST:$PORT"
echo "   (pode pedir a senha do sudo para preparar $STAGING)"
ssh -t "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "rm -rf ~/diarias-deploy; sudo mkdir -p '$STAGING' && sudo chown -R $SSH_USER: '$STAGING' && rm -rf '$STAGING'/* && mkdir -p '$STAGING/pacote' && df -h '$STAGING' | tail -1"

# tar via SSH em vez de rsync: o /usr/bin/rsync do macOS é o openrsync (protocolo 29), que falha
# com "unexpected end of file" contra o rsync do Ubuntu.
# O .tgz é montado localmente, enviado como arquivo e só então extraído: se algo falhar no servidor,
# o erro dele aparece (no pipe direto só se via o "tar: Write error" local).
TGZ="$(mktemp -t diarias-pacote).tgz"
trap 'rm -f "$TGZ"; ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$HOST" 2>/dev/null || true' EXIT
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$TGZ" -C "$SAIDA" . -C "$RAIZ/deploy/linux" diarias.service instalar-servidor.sh
echo ">> Enviando pacote ($(du -h "$TGZ" | cut -f1) compactado)"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "cat > '$STAGING/pacote.tgz'" < "$TGZ" || {
  echo "!! Falha no envio. Diagnóstico do servidor:"
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "id; ls -ld '$STAGING'; df -h '$STAGING' /tmp ~; df -i '$STAGING'; ls -la '$STAGING'"
  exit 1
}
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "set -e; cd '$STAGING'; tar -xzf pacote.tgz -C pacote; mv pacote/diarias.service pacote/instalar-servidor.sh .; rm -f pacote.tgz" || {
  echo "!! Falha ao extrair no servidor. Diagnóstico:"
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "id; ls -ld '$STAGING' '$STAGING/pacote'; df -h '$STAGING'; df -i '$STAGING'"
  exit 1
}

echo ">> Instalando (cada passo privilegiado pede sudo; a senha costuma ser pedida só uma vez)"
ssh -t "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "STAGING='$STAGING' bash '$STAGING/instalar-servidor.sh' && rm -rf '$STAGING'/*"
