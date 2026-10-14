# Diárias SERES

Sistema de gestão de diárias da SERES/SEAP-PE. Roda no **mesmo servidor** e no **mesmo PostgreSQL** do
CarteiraPenal (`csharp/ControleCarteiraPenal`), compartilhando usuários, unidades, policiais e municípios.

| | CarteiraPenal | Diárias SERES |
|---|---|---|
| Porta | 4443 | **4444** (`diarias.seap.pe.gov.br`) |
| Serviço | `carteira.service` | `diarias.service` |
| Pasta no servidor | `/var/www/carteira` | `/var/www/diarias` |
| Banco | `carteira` (10.238.118.253) | o mesmo |
| JWT Issuer/Audience | CarteiraPenalAPI/Client | DiariasSeresAPI/Client (tokens não se misturam) |

## Arquitetura

```
src/
  Seap.Compartilhado/   núcleo reutilizável por todos os módulos (Carteira, Diárias, PJES...)
    Modelos/            mapeamento das tabelas public.* (legado Carteira) e comum.* (novas, compartilhadas)
    Dados/              mapeamento EF compartilhado + versionador de schema (scripts SQL)
    Seguranca/          cifra Delphi (mesma senha da Carteira), JWT, CPF
    Auditoria/          interceptor EF: grava quem/o quê/quando em comum.auditoria
    Respostas/          ApiResponse / PagedResult (mesmo contrato do front da Carteira)
    Sql/                scripts do schema comum
  DiariasSeres.Api/     ASP.NET Core .NET 10 + SPA React (ClientApp, Vite + Tailwind)
    Sql/                scripts do schema diarias
```

### Banco: três schemas, um banco

| Schema | Dono | Conteúdo |
|---|---|---|
| `public` | CarteiraPenal | `usuario`, `unidade`, `policia_penal`, `tabuf`, `tabnaturalidade` — **só mapeadas, nunca alteradas** |
| `comum` | Seap.Compartilhado | `servidor`, `cargo`, `regiao`, `regiao_municipio`, `usuario_perfil`, `auditoria`, `schema_versao` |
| `diarias` | este módulo | `tipo_diaria`, `valor_diaria`, `diaria`, `diaria_periodo` |

- Os scripts em `Sql/` são aplicados no start (idempotente, com advisory lock) e registrados em
  `comum.schema_versao`. **Script aplicado nunca é editado** — crie `002_...sql`.
- FKs para o legado foram escolhidas para não quebrar a Carteira: `policia_penal` → `ON DELETE SET NULL`;
  `unidade` → `RESTRICT`; `usuario` → perfil apagado em cascata; auditoria guarda id+nome sem FK.
- `comum.servidor` cobre qualquer vínculo (efetivo, contratado, comissionado, cedido). Policiais penais são
  importados de `public.policia_penal` (botão *Sincronizar policiais penais*), que continua sendo a fonte de
  nome/CPF/matrícula/lotação deles.
- Requer as extensões `btree_gist` e `unaccent` (ambas *trusted* desde o PG 13).

### Regras implementadas (especificação Módulo 1 — Diárias)

- **Login público** com o mesmo CPF/senha da Carteira; acesso exige perfil no módulo (ADMIN, OPERADOR, CONSULTA).
  O administrador geral da Carteira (`principal='S'`) entra como ADMIN para viabilizar o primeiro acesso.
- **Tabela de valores** por tipo × vínculo × cargo com vigência; o valor é preenchido automaticamente
  (linha vigente mais específica). Reajuste = encerrar vigência e criar nova linha.
- **Lançamento com vários períodos** intercalados, cada um com destino e tipo; quantidade padrão = dias do
  período (pode ser reduzida em múltiplos de 0,5).
- **Mesma data, mesmo servidor: bloqueado** no serviço (com lock por servidor) e no banco
  (constraint de exclusão `diaria_periodo_sem_sobreposicao`).
- **Edição** permitida com **trilha de auditoria** (de/para por campo); exclusão = cancelamento com motivo.
- **Relatórios** por período, servidor, lotação, destino, região, tipo e vínculo; **planilha da Controladoria**
  (.xlsx com números/datas nativos em pt-BR — sem troca de ponto por vírgula). Colunas em
  `RelatoriosService.ColunasControladoria`.
- **Painel** com totais por mês, região, tipo, destino e lotação.

## Desenvolvimento local

```bash
docker compose up -d                       # Postgres 16 com as tabelas da Carteira + dados fictícios
cd src/DiariasSeres.Api && dotnet run      # API em http://localhost:5244 (aplica os schemas)
cd src/DiariasSeres.Api/ClientApp && npm install && npm run dev   # SPA em http://localhost:5173
```

Usuários fictícios (senha `123456`): admin `104.332.181-00`; sem perfil `960.013.389-14`.
Para recomeçar do zero: `docker compose down -v`.

## Deploy (servidor do CarteiraPenal)

0. **Com a VPN**, rodar a verificação somente leitura (não altera nada):
   `psql -h 10.238.118.253 -U <usuario> -d carteira -f database/verificacao_producao.sql` — confirma PG ≥ 13,
   permissão de criar schema, extensões `btree_gist`/`unaccent` disponíveis, privilégio `REFERENCES` nas tabelas
   da Carteira e a qualidade dos CPFs dos policiais.
1. **Uma vez**, no servidor: criar `/etc/diarias/diarias.env` a partir de `deploy/linux/diarias.env.exemplo`
   (connection string e `JwtSettings__Secret` próprio), `chmod 600`.
2. `deploy/linux/publicar-linux.sh` — gera o pacote self-contained (SPA incluída) em `../publish/diarias-linux`.
3. `deploy/linux/enviar.sh` — envia, instala o `diarias.service` e reinicia (requer VPN para 10.238.118.252).
4. Gateway: publicar `diarias.seap.pe.gov.br` → servidor:4444 (ou usar `nginx-diarias.conf` para TLS local).
5. No primeiro acesso: entrar com um administrador da Carteira, *Sincronizar policiais penais*, cadastrar a
   *Tabela de Valores* e conceder perfis em *Usuários e Acessos*.

## Pendências conhecidas

- Migração do legado MySQL `diarias_seres` (5.1.48): o dump pelo DBeaver saiu vazio; precisa de um
  `mysqldump` compatível com 5.1 para a engenharia reversa.
- Layout oficial da planilha da Controladoria (colunas atuais são uma proposta).
- Integração ERGON/SGP para cadastro automático de servidores.
- Criação de usuários pelas Diárias fica desligada em produção (`Usuarios:PermitirCriacao=false`) até a Carteira
  verificar perfil por módulo — hoje qualquer `usuario` entra na Carteira.
