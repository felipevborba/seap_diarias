-- =====================================================================
-- 002: fluxo de aprovação, itens por período e suporte à migração do legado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fluxo de aprovação: lançar (PENDENTE) -> aprovar (APROVADA) ou rejeitar (REJEITADA).
--    CANCELADA continua existindo. Diárias já lançadas (ATIVA) passam a APROVADA.
--    Períodos ficam "ativos" (ocupam as datas) em PENDENTE e APROVADA.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria DROP CONSTRAINT diaria_situacao_ck;
UPDATE diarias.diaria SET situacao = 'APROVADA' WHERE situacao = 'ATIVA';
ALTER TABLE diarias.diaria ALTER COLUMN situacao SET DEFAULT 'PENDENTE';
ALTER TABLE diarias.diaria
    ADD CONSTRAINT diaria_situacao_ck CHECK (situacao IN ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA')),
    ADD COLUMN decidido_por_id   INTEGER      NULL,
    ADD COLUMN decidido_por_nome VARCHAR(255) NULL,
    ADD COLUMN decidido_em       TIMESTAMPTZ  NULL,
    ADD COLUMN motivo_rejeicao   VARCHAR(500) NULL;
CREATE INDEX ix_diaria_situacao ON diarias.diaria (situacao);

-- ---------------------------------------------------------------------
-- 2. Origem: registros migrados do legado (SISDIARIA, MySQL "diarias?seres") guardam o
--    código original para rastreabilidade e para a migração ser reexecutável.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria
    ADD COLUMN origem        VARCHAR(10) NOT NULL DEFAULT 'SISTEMA',
    ADD COLUMN legado_codigo INTEGER     NULL,
    ADD CONSTRAINT diaria_origem_ck CHECK (origem IN ('SISTEMA', 'LEGADO')),
    ADD CONSTRAINT diaria_legado_codigo_key UNIQUE (legado_codigo);

-- ---------------------------------------------------------------------
-- 3. Itens por período: uma viagem pode ter, por exemplo, 2 diárias integrais + 1 parcial.
--    Tipo, quantidade e valores saem do período e vão para diaria_item.
-- ---------------------------------------------------------------------
CREATE TABLE diarias.diaria_item (
    id             SERIAL        NOT NULL,
    periodo_id     INTEGER       NOT NULL,
    tipo_diaria_id INTEGER       NOT NULL,
    quantidade     NUMERIC(6,1)  NOT NULL,
    valor_unitario NUMERIC(12,2) NOT NULL,
    valor_total    NUMERIC(12,2) NOT NULL,
    CONSTRAINT diaria_item_pkey PRIMARY KEY (id),
    CONSTRAINT diaria_item_quantidade_ck CHECK (quantidade > 0),
    CONSTRAINT diaria_item_valor_ck CHECK (valor_unitario >= 0 AND valor_total >= 0),
    CONSTRAINT diaria_item_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES diarias.diaria_periodo (id) ON DELETE CASCADE,
    CONSTRAINT diaria_item_tipo_diaria_id_fkey FOREIGN KEY (tipo_diaria_id) REFERENCES diarias.tipo_diaria (id),
    CONSTRAINT diaria_item_periodo_tipo_key UNIQUE (periodo_id, tipo_diaria_id)
);
CREATE INDEX ix_diaria_item_tipo ON diarias.diaria_item (tipo_diaria_id);

INSERT INTO diarias.diaria_item (periodo_id, tipo_diaria_id, quantidade, valor_unitario, valor_total)
SELECT id, tipo_diaria_id, quantidade, valor_unitario, valor_total FROM diarias.diaria_periodo;

ALTER TABLE diarias.diaria_periodo
    DROP COLUMN tipo_diaria_id,
    DROP COLUMN quantidade,
    DROP COLUMN valor_unitario;

-- ---------------------------------------------------------------------
-- 4. Destino: o legado tem destinos em texto livre que nem sempre correspondem a um município
--    (siglas de unidade, "INTERIOR DO ESTADO"...). O texto original é preservado e o município
--    pode ficar vazio nesses casos; lançamentos pelo sistema continuam exigindo município.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria_periodo
    ALTER COLUMN destino_municipio_id DROP NOT NULL,
    ADD COLUMN destino_texto VARCHAR(300) NULL,
    ADD CONSTRAINT diaria_periodo_destino_ck CHECK (destino_municipio_id IS NOT NULL OR destino_texto IS NOT NULL);

-- ---------------------------------------------------------------------
-- 5. Sobreposição: o legado tem ~400 diárias com datas sobrepostas para o mesmo servidor que
--    não são duplicatas exatas. Elas entram marcadas como isentas da regra (e listadas em
--    relatório); qualquer edição de datas remove a isenção.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria_periodo ADD COLUMN isento_sobreposicao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE diarias.diaria_periodo DROP CONSTRAINT diaria_periodo_sem_sobreposicao;
ALTER TABLE diarias.diaria_periodo ADD CONSTRAINT diaria_periodo_sem_sobreposicao EXCLUDE USING gist (
    servidor_id WITH =,
    daterange(data_inicio, data_fim, '[]') WITH &&
) WHERE (ativo AND NOT isento_sobreposicao) DEFERRABLE INITIALLY DEFERRED;
