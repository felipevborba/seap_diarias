#!/usr/bin/env bash
# Gera o pacote self-contained (não exige .NET no servidor), com a SPA embutida em wwwroot.
# Saída FORA da pasta do projeto (o CarteiraPenal versionou publish-linux/ recursivamente por isso).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SAIDA="${SAIDA:-$RAIZ/../publish/diarias-linux}"
rm -rf "$SAIDA"
dotnet publish "$RAIZ/src/DiariasSeres.Api/DiariasSeres.Api.csproj" \
  -c Release -r linux-x64 --self-contained true -p:BuildSpa=true -o "$SAIDA"
# Configuração local de desenvolvimento não vai para o servidor.
rm -f "$SAIDA/appsettings.Development.json"
echo "Pacote gerado em $SAIDA"
