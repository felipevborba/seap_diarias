-- =====================================================================
-- install.sql — Criação completa do banco de dados
-- Sistema de Carteira Funcional da Polícia Penal (SEAP/PE)
-- Backend ASP.NET Core .NET 10 + PostgreSQL (driver Npgsql/EF Core 10)
-- =====================================================================
--
-- OBJETIVO
--   Provisionar do zero o schema da aplicação no servidor definitivo:
--   todas as tabelas, chaves, índices, função/gatilho de auditoria de
--   data e os dados de domínio mínimos (Unidades da Federação).
--
-- COMO EXECUTAR
--   (O PostgreSQL fica em OUTRA máquina — rode apontando -h para o IP do
--    servidor de banco, a partir de uma máquina com acesso de rede a ele.)
--
--   1) (uma vez, como superusuário — FORA deste script, pois CREATE DATABASE
--      não roda dentro de transação). Nomes conforme appsettings.Production.json:
--
--        CREATE ROLE seap_user LOGIN PASSWORD 'TROCAR_SENHA_FORTE';
--        CREATE DATABASE seap_carteira OWNER seap_user ENCODING 'UTF8';
--
--   2) Rodar este script já conectado ao banco "seap_carteira":
--
--        psql -h IP_DO_BANCO -p 5432 -U seap_user -d seap_carteira -f scripts/install.sql
--
--   O script é IDEMPOTENTE (CREATE TABLE/INDEX IF NOT EXISTS, seed com
--   anti-join): pode ser reexecutado sem duplicar dados ou dar erro.
--
-- OBSERVAÇÕES IMPORTANTES
--   * A connection string da aplicação aponta para o banco "seap".
--     Ajuste appsettings.Production.json (Host/Database/Username/Password).
--   * O usuário do banco precisa de permissão de escrita e, no primeiro
--     start, de DDL — a aplicação garante de forma idempotente a tabela
--     de auditoria "impressao_carteira" (aqui ela já é criada).
--   * O PRIMEIRO USUÁRIO ADMINISTRADOR e as UNIDADES iniciais são criados
--     automaticamente pela aplicação no primeiro start (DbSeeder), porque
--     a senha é cifrada em runtime. NÃO precisam ser inseridos aqui.
--   * As NATURALIDADES (municípios, tabela "tabnaturalidade") são populadas
--     pela sincronização com o IBGE no start (SyncOnStartup). Se o servidor
--     não tiver saída para servicodados.ibge.gov.br, importe-as por outra
--     via — as 27 UFs abaixo já ficam disponíveis para os cadastros.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Função utilitária: atualiza automaticamente a coluna updated_at
-- (usada pela tabela policia_penal via gatilho BEFORE UPDATE).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TABELAS DE DOMÍNIO / LOOKUP
-- =====================================================================

-- Unidades da Federação (base das naturalidades e da lotação).
CREATE TABLE IF NOT EXISTS tabuf (
    id    SERIAL       NOT NULL,
    sigla VARCHAR(2)   NOT NULL,
    nome  VARCHAR(100) NOT NULL,
    CONSTRAINT tabuf_pkey PRIMARY KEY (id)
);

-- Naturalidades (municípios) — vinculadas a uma UF. Populadas via IBGE.
CREATE TABLE IF NOT EXISTS tabnaturalidade (
    id    SERIAL       NOT NULL,
    uf_id INTEGER      NOT NULL,
    nome  VARCHAR(255) NOT NULL,
    CONSTRAINT tabnaturalidade_pkey PRIMARY KEY (id),
    CONSTRAINT tabnaturalidade_uf_id_fkey FOREIGN KEY (uf_id)
        REFERENCES tabuf (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_tabnaturalidade_uf ON tabnaturalidade (uf_id);

-- Unidades prisionais / de lotação.
CREATE TABLE IF NOT EXISTS unidade (
    id    SERIAL       NOT NULL,
    sigla VARCHAR(50)  NULL,
    nome  VARCHAR(255) NOT NULL,
    CONSTRAINT unidade_pkey PRIMARY KEY (id)
);

-- =====================================================================
-- TABELAS OPERACIONAIS
-- =====================================================================

-- Usuários do sistema (autenticação). Principal = 'S' => Administrador.
CREATE TABLE IF NOT EXISTS usuario (
    id                 SERIAL       NOT NULL,
    principal          CHAR(1)      NULL DEFAULT 'N',
    nome               VARCHAR(255) NOT NULL,
    matricula          VARCHAR(50)  NULL,
    documento          VARCHAR(20)  NULL,
    chave_criptografia TEXT         NULL,
    senha              VARCHAR(255) NULL,
    data_chave         TIMESTAMP WITHOUT TIME ZONE NULL,
    CONSTRAINT usuario_pkey PRIMARY KEY (id)
);

-- Assinaturas das autoridades impressas na carteira. Primaria = 'S' => padrão.
CREATE TABLE IF NOT EXISTS controleassinatura (
    id              SERIAL       NOT NULL,
    nome_orgao      VARCHAR(255) NULL,
    nome_cargo      VARCHAR(255) NULL,
    nome_secretario VARCHAR(255) NULL,
    assinatura      TEXT         NULL,
    primaria        CHAR(1)      NULL DEFAULT 'N',
    CONSTRAINT controleassinatura_pkey PRIMARY KEY (id)
);

-- Controle de versões de schema do sistema legado (histórico).
CREATE TABLE IF NOT EXISTS migrations (
    id             SERIAL       NOT NULL,
    migration_name VARCHAR(200) NOT NULL,
    CONSTRAINT migrations_pkey PRIMARY KEY (id)
);

-- Cadastro central do policial penal (dados, foto, assinatura e digitais).
CREATE TABLE IF NOT EXISTS policia_penal (
    id             SERIAL       NOT NULL,
    nome           VARCHAR(255) NOT NULL,
    nome_social    VARCHAR(150) NULL,
    data_nascimento DATE        NULL,
    nome_pai       VARCHAR(255) NULL,
    nome_mae       VARCHAR(255) NULL,
    sexo           VARCHAR(20)  NULL,
    tipo_sangue    VARCHAR(5)   NULL,
    uf_id          INTEGER      NULL,
    cidade_id      INTEGER      NULL,
    cpf            VARCHAR(20)  NULL,
    rg             VARCHAR(15)  NULL,
    rg_orgao       VARCHAR(50)  NULL,
    pis            VARCHAR(50)  NULL,
    cnh            VARCHAR(50)  NULL,
    cnh_categoria  VARCHAR(5)   NULL,
    titulo_eleitor VARCHAR(20)  NULL,
    zona           VARCHAR(20)  NULL,
    matricula      VARCHAR(50)  NULL,
    status_trabalho INTEGER     NULL,
    unidade_id     INTEGER      NULL,
    num_registro   VARCHAR(20)  NULL,
    num_via        INTEGER      NULL,
    proibir_arma   CHAR(1)      NULL DEFAULT 'N',
    email          VARCHAR(255) NULL,
    celular        VARCHAR(20)  NULL,
    assinatura     BYTEA        NULL,
    foto           BYTEA        NULL,
    dig_ind_esq    BYTEA        NULL,
    dig_pol_esq    BYTEA        NULL,
    dig_ind_dir    BYTEA        NULL,
    dig_pol_dir    BYTEA        NULL,
    created_at     TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT policia_penal_pkey PRIMARY KEY (id),
    CONSTRAINT policia_penal_uf_id_fkey FOREIGN KEY (uf_id)
        REFERENCES tabuf (id),
    CONSTRAINT policia_penal_cidade_id_fkey FOREIGN KEY (cidade_id)
        REFERENCES tabnaturalidade (id),
    CONSTRAINT policia_penal_unidade_id_fkey FOREIGN KEY (unidade_id)
        REFERENCES unidade (id)
);

CREATE INDEX IF NOT EXISTS ix_policia_penal_unidade ON policia_penal (unidade_id);
CREATE INDEX IF NOT EXISTS ix_policia_penal_matricula ON policia_penal (matricula);

-- Gatilho que mantém updated_at sempre atualizado.
DROP TRIGGER IF EXISTS trg_policia_penal_updated_at ON policia_penal;
CREATE TRIGGER trg_policia_penal_updated_at
    BEFORE UPDATE ON policia_penal
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria de impressão/emissão de carteiras (app-owned).
-- (A aplicação também garante esta tabela no start, de forma idempotente.)
CREATE TABLE IF NOT EXISTS impressao_carteira (
    id                 SERIAL NOT NULL,
    policia_penal_id   INTEGER      NULL,
    policial_nome      TEXT         NULL,
    policial_matricula VARCHAR(50)  NULL,
    usuario_id         INTEGER      NULL,
    usuario_nome       TEXT         NULL,
    data_hora          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo               VARCHAR(20)  NULL,   -- 'fisica' | 'digital'
    via                INTEGER      NULL,
    CONSTRAINT impressao_carteira_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_impressao_carteira_policial ON impressao_carteira (policia_penal_id);
CREATE INDEX IF NOT EXISTS ix_impressao_carteira_data ON impressao_carteira (data_hora);

-- =====================================================================
-- DADOS DE DOMÍNIO — Unidades da Federação (27)
-- Idempotente: só insere a sigla que ainda não existir. Os ids são
-- gerados pela sequência (serial); os cadastros referenciam por id.
-- =====================================================================
INSERT INTO tabuf (sigla, nome)
SELECT v.sigla, v.nome
FROM (VALUES
    ('AC', 'Acre'),
    ('AL', 'Alagoas'),
    ('AP', 'Amapá'),
    ('AM', 'Amazonas'),
    ('BA', 'Bahia'),
    ('CE', 'Ceará'),
    ('DF', 'Distrito Federal'),
    ('ES', 'Espírito Santo'),
    ('GO', 'Goiás'),
    ('MA', 'Maranhão'),
    ('MT', 'Mato Grosso'),
    ('MS', 'Mato Grosso do Sul'),
    ('MG', 'Minas Gerais'),
    ('PA', 'Pará'),
    ('PB', 'Paraíba'),
    ('PR', 'Paraná'),
    ('PE', 'Pernambuco'),
    ('PI', 'Piauí'),
    ('RJ', 'Rio de Janeiro'),
    ('RN', 'Rio Grande do Norte'),
    ('RS', 'Rio Grande do Sul'),
    ('RO', 'Rondônia'),
    ('RR', 'Roraima'),
    ('SC', 'Santa Catarina'),
    ('SP', 'São Paulo'),
    ('SE', 'Sergipe'),
    ('TO', 'Tocantins')
) AS v(sigla, nome)
WHERE NOT EXISTS (SELECT 1 FROM tabuf t WHERE t.sigla = v.sigla);

COMMIT;

-- =====================================================================
-- FIM. Próximo passo: iniciar a aplicação (systemd carteira.service).
-- No primeiro start ela cria o usuário administrador inicial e as
-- unidades-base, e (se houver acesso) sincroniza os municípios do IBGE.
-- =====================================================================
