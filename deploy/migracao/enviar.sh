#!/usr/bin/env bash
# Envia o migrador + a extração do legado ao servidor da SEAP e roda a migração LÁ (ao lado do banco),
# sem depender da VPN durante a gravação. Requer VPN só para o envio e para iniciar.
#
#   deploy/migracao/enviar.sh              # envia e roda o ENSAIO (desfaz no final)
#   deploy/migracao/enviar.sh confirmar    # roda de verdade (grava) — pacote já enviado é reaproveitado
#   deploy/migracao/enviar.sh status       # mostra o log da última execução
#
# O pacote vai em partes de 2 MB: se a VPN cair, rode de novo e ele continua de onde parou.
# A migração roda em segundo plano no servidor (nohup): se o SSH cair, ela segue; rode "status" para ver.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PACOTE="${PACOTE:-$RAIZ/../publish/migracao-pacote/pacote.tgz}"
HOST="${HOST:-10.238.118.252}"
PORT="${PORT:-7654}"
SSH_USER="${SSH_USER:-interagi}"
STAGING="${STAGING:-/var/diarias-migracao}"
MODO="${1:-ensaio}"
case "$MODO" in ensaio|confirmar|status) ;; *) echo "Uso: $0 [ensaio|confirmar|status]"; exit 2;; esac

CTL="/tmp/diarias-mig-ssh-%r@%h:%p"
SSH_OPTS=(-p "$PORT" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=600
          -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o ConnectTimeout=20)
trap 'ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$HOST" 2>/dev/null || true' EXIT
remoto() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "$@"; }

if [ "$MODO" = status ]; then
  remoto "bash '$STAGING/rodar.sh' status"
  exit 0
fi

[ -f "$PACOTE" ] || { echo "Pacote não encontrado: $PACOTE"; exit 1; }
SHA=$(shasum -a 256 "$PACOTE" | cut -d' ' -f1)

echo ">> Conectando em $SSH_USER@$HOST:$PORT (pode pedir a senha do sudo para preparar $STAGING)"
ssh -t "${SSH_OPTS[@]}" "$SSH_USER@$HOST" \
  "[ -w '$STAGING' ] || { sudo mkdir -p '$STAGING' && sudo chown $SSH_USER: '$STAGING'; }; mkdir -p '$STAGING/partes'; df -h '$STAGING' | tail -1"

if remoto "[ -f '$STAGING/pacote.sha' ] && [ \"\$(cat '$STAGING/pacote.sha')\" = '$SHA' ] && [ -x '$STAGING/app/DiariasSeap.Migracao' ]"; then
  echo ">> Pacote já está no servidor (mesmo conteúdo), não reenviado."
else
  PARTES="$(mktemp -d -t diarias-mig)"
  trap 'rm -rf "$PARTES"; ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$HOST" 2>/dev/null || true' EXIT
  split -b 2m -a 3 "$PACOTE" "$PARTES/p."
  TOTAL=$(ls "$PARTES" | wc -l | tr -d ' ')
  echo ">> Enviando $(du -h "$PACOTE" | cut -f1) em $TOTAL partes"
  # Partes de um envio anterior com outro conteúdo não servem.
  remoto "cd '$STAGING'; [ \"\$(cat partes/.sha 2>/dev/null)\" = '$SHA' ] || { rm -rf partes; mkdir partes; echo '$SHA' > partes/.sha; }"
  JA=$(remoto "cd '$STAGING/partes' && for f in p.*; do [ -f \"\$f\" ] && echo \"\$f \$(stat -c %s \"\$f\")\"; done" || true)
  N=0
  for f in "$PARTES"/p.*; do
    N=$((N+1)); nome=$(basename "$f"); tam=$(stat -f %z "$f")
    if grep -qx "$nome $tam" <<< "$JA"; then continue; fi
    for tentativa in $(seq 1 20); do
      if remoto "cat > '$STAGING/partes/$nome.tmp' && mv '$STAGING/partes/$nome.tmp' '$STAGING/partes/$nome'" < "$f"; then break; fi
      [ "$tentativa" = 20 ] && { echo "!! Parte $nome falhou 20 vezes. Rode de novo quando a rede estabilizar (continua daqui)."; exit 1; }
      echo "   parte $nome falhou (tentativa $tentativa), tentando de novo em $((tentativa*3))s..."; sleep $((tentativa*3))
    done
    printf "\r   %d/%d" "$N" "$TOTAL"
  done
  echo
  remoto "set -e; cd '$STAGING'; cat partes/p.* > pacote.tgz
    [ \"\$(sha256sum pacote.tgz | cut -d' ' -f1)\" = '$SHA' ] || { echo '!! pacote corrompido no envio — rode de novo'; rm -rf partes pacote.tgz; exit 1; }
    rm -rf app; mkdir app; tar -xzf pacote.tgz -C app; mv app/rodar.sh .; rm -rf partes pacote.tgz; echo '$SHA' > pacote.sha
    echo '>> Pacote conferido e extraído em $STAGING/app'"
fi

remoto "bash '$STAGING/rodar.sh' $MODO"
