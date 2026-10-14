#!/usr/bin/env bash
# Envia o pacote ao servidor do CarteiraPenal e roda o instalador com sudo (requer VPN).
# Pede a senha de SSH (e a de sudo, se exigida). Rode publicar-linux.sh antes.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SAIDA="${SAIDA:-$RAIZ/../publish/diarias-linux}"
HOST="${HOST:-10.238.118.252}"
PORT="${PORT:-7654}"
SSH_USER="${SSH_USER:-interagi}"
STAGING="${STAGING:-diarias-deploy}"

[ -x "$SAIDA/DiariasSeres.Api" ] || { echo "Pacote não encontrado em $SAIDA. Rode deploy/linux/publicar-linux.sh"; exit 1; }

# Uma conexão SSH compartilhada: a senha é pedida uma única vez para envio + instalação.
CTL="/tmp/diarias-ssh-%r@%h:%p"
SSH_OPTS=(-p "$PORT" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=120)
trap 'ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$HOST" 2>/dev/null || true' EXIT

echo ">> Conectando em $SSH_USER@$HOST:$PORT"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "rm -rf ~/$STAGING && mkdir -p ~/$STAGING/pacote"

# tar via SSH em vez de rsync: o /usr/bin/rsync do macOS é o openrsync (protocolo 29), que falha
# com "unexpected end of file" contra o rsync do Ubuntu.
echo ">> Enviando pacote ($(du -sh "$SAIDA" | cut -f1))"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$SAIDA" . | ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "tar -xzf - -C ~/$STAGING/pacote"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$RAIZ/deploy/linux" diarias.service instalar-servidor.sh \
  | ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "tar -xzf - -C ~/$STAGING"

echo ">> Instalando (cada passo privilegiado pede sudo; a senha costuma ser pedida só uma vez)"
ssh -t "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "bash \$HOME/$STAGING/instalar-servidor.sh"
