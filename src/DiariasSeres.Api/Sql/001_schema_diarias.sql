-- =====================================================================
-- Schema "diarias": tabelas exclusivas do módulo de Diárias SERES.
-- Depende de comum.* (Seap.Compartilhado/Sql) e de public.* (CarteiraPenal).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS diarias;

-- btree_gist é "trusted" desde o PostgreSQL 13: o dono do banco pode criá-la sem superusuário.
-- Necessária para a constraint de exclusão que impede duas diárias do mesmo servidor na mesma data.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE diarias.tipo_diaria (
    id        SERIAL       NOT NULL,
    nome      VARCHAR(100) NOT NULL,
    descricao VARCHAR(500) NULL,
    ativo     BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT tipo_diaria_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_tipo_diaria_nome ON diarias.tipo_diaria (lower(nome));

INSERT INTO diarias.tipo_diaria (nome, descricao) VALUES
    ('Integral', 'Deslocamento com pernoite'),
    ('Parcial', 'Deslocamento sem pernoite'),
    ('Operação', 'Diária de operação');

-- vinculo/cargo_id nulos = vale para qualquer vínculo/cargo.
CREATE TABLE diarias.valor_diaria (
    id              SERIAL        NOT NULL,
    tipo_diaria_id  INTEGER       NOT NULL,
    vinculo         SMALLINT      NULL,
    cargo_id        INTEGER       NULL,
    valor           NUMERIC(12,2) NOT NULL,
    vigencia_inicio DATE          NOT NULL,
    vigencia_fim    DATE          NULL,
    CONSTRAINT valor_diaria_pkey PRIMARY KEY (id),
    CONSTRAINT valor_diaria_valor_ck CHECK (valor > 0),
    CONSTRAINT valor_diaria_vigencia_ck CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
    CONSTRAINT valor_diaria_tipo_diaria_id_fkey FOREIGN KEY (tipo_diaria_id) REFERENCES diarias.tipo_diaria (id),
    CONSTRAINT valor_diaria_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES comum.cargo (id),
    -- Duas linhas para a mesma combinação não podem ter vigências sobrepostas.
    CONSTRAINT valor_diaria_vigencia_excl EXCLUDE USING gist (
        tipo_diaria_id WITH =,
        (COALESCE(vinculo, 0::smallint)) WITH =,
        (COALESCE(cargo_id, 0)) WITH =,
        daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
    )
);

CREATE TABLE diarias.diaria (
    id                  SERIAL        NOT NULL,
    servidor_id         INTEGER       NOT NULL,
    vinculo             SMALLINT      NOT NULL,
    cargo_id            INTEGER       NULL,
    unidade_id          INTEGER       NULL,
    objetivo            VARCHAR(1000) NOT NULL,
    processo_sei        VARCHAR(50)   NULL,
    observacao          VARCHAR(2000) NULL,
    situacao            VARCHAR(20)   NOT NULL DEFAULT 'ATIVA',
    motivo_cancelamento VARCHAR(500)  NULL,
    valor_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    criado_por_id       INTEGER       NULL,
    criado_por_nome     VARCHAR(255)  NULL,
    criado_em           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT diaria_pkey PRIMARY KEY (id),
    CONSTRAINT diaria_situacao_ck CHECK (situacao IN ('ATIVA', 'CANCELADA')),
    CONSTRAINT diaria_servidor_id_fkey FOREIGN KEY (servidor_id) REFERENCES comum.servidor (id),
    CONSTRAINT diaria_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES comum.cargo (id),
    CONSTRAINT diaria_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade (id)
);
CREATE INDEX ix_diaria_servidor ON diarias.diaria (servidor_id);
CREATE INDEX ix_diaria_unidade ON diarias.diaria (unidade_id);

CREATE TABLE diarias.diaria_periodo (
    id                   SERIAL        NOT NULL,
    diaria_id            INTEGER       NOT NULL,
    servidor_id          INTEGER       NOT NULL,
    data_inicio          DATE          NOT NULL,
    data_fim             DATE          NOT NULL,
    tipo_diaria_id       INTEGER       NOT NULL,
    destino_municipio_id INTEGER       NOT NULL,
    quantidade           NUMERIC(6,1)  NOT NULL,
    valor_unitario       NUMERIC(12,2) NOT NULL,
    valor_total          NUMERIC(12,2) NOT NULL,
    ativo                BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT diaria_periodo_pkey PRIMARY KEY (id),
    CONSTRAINT diaria_periodo_datas_ck CHECK (data_fim >= data_inicio),
    CONSTRAINT diaria_periodo_quantidade_ck CHECK (quantidade > 0),
    CONSTRAINT diaria_periodo_diaria_id_fkey FOREIGN KEY (diaria_id) REFERENCES diarias.diaria (id) ON DELETE CASCADE,
    CONSTRAINT diaria_periodo_servidor_id_fkey FOREIGN KEY (servidor_id) REFERENCES comum.servidor (id),
    CONSTRAINT diaria_periodo_tipo_diaria_id_fkey FOREIGN KEY (tipo_diaria_id) REFERENCES diarias.tipo_diaria (id),
    CONSTRAINT diaria_periodo_destino_fkey FOREIGN KEY (destino_municipio_id) REFERENCES public.tabnaturalidade (id),
    -- Regra do legado, agora garantida pelo banco: um servidor não recebe duas diárias na mesma data.
    -- Diferida para o commit: na edição os períodos são atualizados um a um e podem se cruzar no meio.
    CONSTRAINT diaria_periodo_sem_sobreposicao EXCLUDE USING gist (
        servidor_id WITH =,
        daterange(data_inicio, data_fim, '[]') WITH &&
    ) WHERE (ativo) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_diaria_periodo_diaria ON diarias.diaria_periodo (diaria_id);
CREATE INDEX ix_diaria_periodo_datas ON diarias.diaria_periodo (data_inicio, data_fim);
CREATE INDEX ix_diaria_periodo_destino ON diarias.diaria_periodo (destino_municipio_id);
