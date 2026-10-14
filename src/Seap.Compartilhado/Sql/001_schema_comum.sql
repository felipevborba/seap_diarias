-- =====================================================================
-- Schema "comum": tabelas novas compartilhadas entre os módulos
-- (Diárias, PJES...). Depende das tabelas do CarteiraPenal em "public"
-- (usuario, unidade, policia_penal, tabnaturalidade), que NÃO são alteradas.
--
-- Regras de FK em direção ao legado, para não quebrar o CarteiraPenal:
--   * policia_penal  -> ON DELETE SET NULL (excluir o policial lá só desfaz o vínculo aqui)
--   * unidade        -> RESTRICT (unidade com histórico não pode sumir)
--   * usuario        -> usuario_perfil é apagado junto (CASCADE); a auditoria guarda id+nome sem FK
-- =====================================================================

-- unaccent ("trusted" desde o PG 13): busca de nomes/municípios ignorando acentos.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE comum.cargo (
    id    SERIAL       NOT NULL,
    nome  VARCHAR(150) NOT NULL,
    ativo BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT cargo_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_cargo_nome ON comum.cargo (lower(nome));

CREATE TABLE comum.servidor (
    id               SERIAL       NOT NULL,
    nome             VARCHAR(255) NOT NULL,
    cpf              VARCHAR(11)  NOT NULL,
    matricula        VARCHAR(50)  NULL,
    vinculo          SMALLINT     NOT NULL,
    cargo_id         INTEGER      NULL,
    unidade_id       INTEGER      NULL,
    policia_penal_id INTEGER      NULL,
    email            VARCHAR(255) NULL,
    celular          VARCHAR(20)  NULL,
    banco            VARCHAR(100) NULL,
    agencia          VARCHAR(20)  NULL,
    conta            VARCHAR(30)  NULL,
    ativo            BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT servidor_pkey PRIMARY KEY (id),
    CONSTRAINT servidor_cpf_key UNIQUE (cpf),
    CONSTRAINT servidor_cpf_ck CHECK (cpf ~ '^[0-9]{11}$'),
    CONSTRAINT servidor_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES comum.cargo (id),
    CONSTRAINT servidor_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade (id),
    CONSTRAINT servidor_policia_penal_id_fkey FOREIGN KEY (policia_penal_id)
        REFERENCES public.policia_penal (id) ON DELETE SET NULL
);
CREATE INDEX ix_servidor_matricula ON comum.servidor (matricula);
CREATE INDEX ix_servidor_nome ON comum.servidor (lower(nome));
CREATE UNIQUE INDEX ix_servidor_policia_penal ON comum.servidor (policia_penal_id) WHERE policia_penal_id IS NOT NULL;

CREATE TABLE comum.regiao (
    id   SERIAL       NOT NULL,
    nome VARCHAR(100) NOT NULL,
    CONSTRAINT regiao_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_regiao_nome ON comum.regiao (lower(nome));

-- Cada município pertence a no máximo uma região (a PK no município garante isso).
CREATE TABLE comum.regiao_municipio (
    regiao_id    INTEGER NOT NULL,
    municipio_id INTEGER NOT NULL,
    CONSTRAINT regiao_municipio_pkey PRIMARY KEY (regiao_id, municipio_id),
    CONSTRAINT regiao_municipio_municipio_key UNIQUE (municipio_id),
    CONSTRAINT regiao_municipio_regiao_id_fkey FOREIGN KEY (regiao_id) REFERENCES comum.regiao (id) ON DELETE CASCADE,
    CONSTRAINT regiao_municipio_municipio_id_fkey FOREIGN KEY (municipio_id) REFERENCES public.tabnaturalidade (id)
);

CREATE TABLE comum.usuario_perfil (
    id         SERIAL      NOT NULL,
    usuario_id INTEGER     NOT NULL,
    modulo     VARCHAR(30) NOT NULL,
    perfil     VARCHAR(30) NOT NULL,
    CONSTRAINT usuario_perfil_pkey PRIMARY KEY (id),
    CONSTRAINT usuario_perfil_usuario_modulo_key UNIQUE (usuario_id, modulo),
    CONSTRAINT usuario_perfil_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario (id) ON DELETE CASCADE
);

CREATE TABLE comum.auditoria (
    id            BIGSERIAL    NOT NULL,
    modulo        VARCHAR(30)  NOT NULL,
    entidade      VARCHAR(100) NOT NULL,
    entidade_id   VARCHAR(100) NOT NULL,
    raiz_entidade VARCHAR(100) NOT NULL,
    raiz_id       VARCHAR(100) NOT NULL,
    acao          VARCHAR(10)  NOT NULL,
    usuario_id    INTEGER      NULL,
    usuario_nome  VARCHAR(255) NULL,
    data_hora     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    alteracoes    JSONB        NOT NULL,
    CONSTRAINT auditoria_pkey PRIMARY KEY (id)
);
CREATE INDEX ix_auditoria_raiz ON comum.auditoria (raiz_entidade, raiz_id);
CREATE INDEX ix_auditoria_data ON comum.auditoria (data_hora DESC);
CREATE INDEX ix_auditoria_usuario ON comum.auditoria (usuario_id);
