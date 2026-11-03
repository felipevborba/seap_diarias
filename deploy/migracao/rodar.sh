#!/usr/bin/env bash
# Roda NO SERVIDOR (chamado por enviar.sh): migração do legado em segundo plano, com log.
#   rodar.sh ensaio | confirmar | status
# A connection string vem do appsettings do CarteiraPenal (mesmo banco/usuário) e não é exibida.
set -euo pipefail
cd "$(dirname "$0")"
MODO="${1:-status}"
CARTEIRA_CFG=/var/www/carteira/appsettings.Production.json
ultimo() { ls -1t execucao_*.log 2>/dev/null | head -1; }

if [ "$MODO" = status ]; then
  LOG=$(ultimo); [ -n "$LOG" ] || { echo "Nenhuma execução ainda."; exit 0; }
  if [ -f migracao.pid ] && kill -0 "$(cat migracao.pid)" 2>/dev/null; then echo ">> Em execução ($LOG):"; else echo ">> Terminada ($LOG):"; fi
  tail -40 "$LOG"; exit 0
fi

if [ -f migracao.pid ] && kill -0 "$(cat migracao.pid)" 2>/dev/null; then
  echo "!! Já há uma migração em execução (pid $(cat migracao.pid)). Acompanhe com: enviar.sh status"; exit 1
fi
[ -r "$CARTEIRA_CFG" ] || { echo "!! Não consigo ler $CARTEIRA_CFG"; exit 1; }

TS=$(date +%Y%m%d_%H%M%S)
LOG="execucao_${TS}_${MODO}.log"
EXTRA=(); [ "$MODO" = confirmar ] && EXTRA=(--confirmar)
: > "$LOG"
(
  ConnectionStrings__DefaultConnection=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ConnectionStrings"]["DefaultConnection"])' "$CARTEIRA_CFG")
  export ConnectionStrings__DefaultConnection
  exec nohup ./app/DiariasSeap.Migracao --dados app/dados --relatorios "relatorios_${TS}_${MODO}" "${EXTRA[@]}" >> "$LOG" 2>&1 < /dev/null
) &
echo $! > migracao.pid
echo ">> Migração ($MODO) iniciada no servidor, pid $!. Log: $(pwd)/$LOG"
echo "   Se a conexão cair, ela continua; acompanhe depois com: deploy/migracao/enviar.sh status"
echo
tail --pid="$(cat migracao.pid)" -n +1 -f "$LOG" || true
