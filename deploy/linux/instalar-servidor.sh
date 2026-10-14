#!/usr/bin/env bash
# Instala/atualiza o Diárias SERES no servidor do CarteiraPenal. Roda como o usuário de deploy
# (interagi), chamado pelo enviar.sh:  bash ~/diarias-deploy/instalar-servidor.sh
#
# O sudo desse servidor só libera comandos específicos (mkdir, rsync, chown, chmod, cp, systemctl,
# journalctl — os mesmos do deploy do CarteiraPenal); por isso cada passo privilegiado é um sudo
# isolado, e nada roda "bash como root".
#
# - Na PRIMEIRA execução gera /etc/diarias/diarias.env com a MESMA connection string do CarteiraPenal
#   (lida de /var/www/carteira/appsettings.Production.json) e um segredo JWT novo gerado aqui.
#   Os segredos nunca saem do servidor.
set -euo pipefail

STAGING="$HOME/diarias-deploy"
DESTINO=/var/www/diarias
ENV_FILE=/etc/diarias/diarias.env
CARTEIRA_CFG=/var/www/carteira/appsettings.Production.json
PORTA=4444

[ -x "$STAGING/pacote/DiariasSeres.Api" ] || { echo "Pacote não encontrado em $STAGING/pacote"; exit 1; }

echo "== 1/5 Configuração ($ENV_FILE)  — pode pedir a senha do sudo"
sudo mkdir -p /etc/diarias "$DESTINO"
sudo chmod 755 /etc/diarias
if [ -f "$ENV_FILE" ]; then
  echo "   já existe, mantido."
else
  [ -r "$CARTEIRA_CFG" ] || { echo "   Não consigo ler $CARTEIRA_CFG para copiar a connection string."; exit 1; }
  TMP_ENV="$STAGING/diarias.env"
  (
    umask 077
    CONN=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ConnectionStrings"]["DefaultConnection"])' "$CARTEIRA_CFG")
    {
      echo "# Gerado por instalar-servidor.sh em $(date -Iseconds). Mesmo banco/usuário do CarteiraPenal."
      echo "ConnectionStrings__DefaultConnection=$CONN"
      echo "JwtSettings__Secret=$(openssl rand -base64 48 | tr -d '\n')"
      echo "# IP do gateway que publica a 4444 (IP real nos logs e limite de login):"
      echo "# Proxy__IpsConfiaveis__0="
    } > "$TMP_ENV"
  )
  sudo cp "$TMP_ENV" "$ENV_FILE"
  sudo chown root:root "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
  rm -f "$TMP_ENV"
  echo "   criado (connection string da Carteira + segredo JWT novo)."
fi

echo "== 2/5 Porta $PORTA"
if ss -ltn 2>/dev/null | grep -q ":$PORTA " && ! systemctl is-active --quiet diarias; then
  echo "   Porta $PORTA já ocupada por outro processo:"; ss -ltn | grep ":$PORTA "; exit 1
fi
echo "   livre"

echo "== 3/5 Arquivos em $DESTINO"
sudo rsync -a --delete "$STAGING/pacote/" "$DESTINO/"
sudo chown -R www-data:www-data "$DESTINO"
sudo chmod +x "$DESTINO/DiariasSeres.Api"
echo "   ok"

echo "== 4/5 Serviço systemd"
sudo cp "$STAGING/diarias.service" /etc/systemd/system/diarias.service
sudo systemctl daemon-reload
sudo systemctl enable diarias
sudo systemctl restart diarias

echo "== 5/5 Saúde"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORTA/api/saude" >/dev/null 2>&1; then
    echo "   Diárias no ar em http://localhost:$PORTA"
    sudo journalctl -u diarias --since "-3min" --no-pager | grep -E "Schema|listening" | sed 's/^/   /' || true
    echo "   Carteira (4443): $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4443/ || echo 'sem resposta')"
    exit 0
  fi
  sleep 2
done
echo "   Não respondeu em 60s. Últimas linhas do log:"
sudo journalctl -u diarias -n 40 --no-pager
exit 1
