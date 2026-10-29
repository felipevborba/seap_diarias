#!/usr/bin/env bash
# Gera o pacote self-contained do PJES (não exige .NET no servidor).
# Saída FORA da pasta do projeto (o CarteiraPenal versionou publish-linux/ recursivamente por isso).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SAIDA="${SAIDA:-$RAIZ/../publish/pjes-linux}"
rm -rf "$SAIDA"
dotnet publish "$RAIZ/src/PjesSeap.Api/PjesSeap.Api.csproj" \
  -c Release -r linux-x64 --self-contained true -o "$SAIDA"
# Configuração local de desenvolvimento não vai para o servidor.
rm -f "$SAIDA/appsettings.Development.json"
echo "Pacote gerado em $SAIDA"
