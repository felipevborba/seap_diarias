-- =====================================================================
-- 005: ajustes pedidos pela SEAP após os primeiros testes (reunião de 20/10/2026).
--      Só acrescenta estrutura; nada é apagado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cidade de origem por período (cada trecho tem origem e destino, como no legado).
--    As colunas antigas em diarias.diaria ficam sem uso pela aplicação.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria_periodo
    ADD COLUMN origem_municipio_id INTEGER      NULL,
    ADD COLUMN origem_texto        VARCHAR(300) NULL,
    ADD CONSTRAINT diaria_periodo_origem_municipio_id_fkey FOREIGN KEY (origem_municipio_id) REFERENCES public.tabnaturalidade (id);
UPDATE diarias.diaria_periodo p SET origem_municipio_id = d.origem_municipio_id, origem_texto = d.origem_texto
FROM diarias.diaria d WHERE d.id = p.diaria_id AND (d.origem_municipio_id IS NOT NULL OR d.origem_texto IS NOT NULL);
CREATE INDEX ix_diaria_periodo_origem ON diarias.diaria_periodo (origem_municipio_id);

-- ---------------------------------------------------------------------
-- 2. Passagens aéreas (ANEXO 2 do legado): no máximo uma por período.
--    diaria.valor_total passa a ser o total geral (diárias + passagens); diaria_periodo.valor_total
--    continua sendo só o das diárias do período.
-- ---------------------------------------------------------------------
CREATE TABLE diarias.diaria_passagem (
    id          SERIAL        NOT NULL,
    periodo_id  INTEGER       NOT NULL,
    agencia     VARCHAR(200)  NULL,
    categoria   VARCHAR(100)  NULL,
    data_ida    DATE          NULL,
    data_volta  DATE          NULL,
    valor_ida   NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_volta NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(12,2) NOT NULL,
    CONSTRAINT diaria_passagem_pkey PRIMARY KEY (id),
    CONSTRAINT diaria_passagem_periodo_key UNIQUE (periodo_id),
    CONSTRAINT diaria_passagem_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES diarias.diaria_periodo (id) ON DELETE CASCADE,
    CONSTRAINT diaria_passagem_valor_ck CHECK (valor_ida >= 0 AND valor_volta >= 0 AND valor_total = valor_ida + valor_volta),
    CONSTRAINT diaria_passagem_datas_ck CHECK (data_ida IS NULL OR data_volta IS NULL OR data_volta >= data_ida)
);
ALTER TABLE diarias.diaria ADD COLUMN valor_passagens NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 3. Coluna do Mapa de Diárias e Passagens (ANEXO VII, Portaria SCGE 27/2022): todo tipo
--    conta como INTEGRAL ou PARCIAL na planilha enviada à Controladoria.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.tipo_diaria
    ADD COLUMN coluna_mapa VARCHAR(10) NOT NULL DEFAULT 'INTEGRAL',
    ADD CONSTRAINT tipo_diaria_coluna_mapa_ck CHECK (coluna_mapa IN ('INTEGRAL', 'PARCIAL'));
UPDATE diarias.tipo_diaria SET coluna_mapa = 'PARCIAL' WHERE nome ILIKE 'parcia%';

-- ---------------------------------------------------------------------
-- 4. Sem etapa de aprovação: lançamentos novos já nascem aprovados.
-- ---------------------------------------------------------------------
ALTER TABLE diarias.diaria ALTER COLUMN situacao SET DEFAULT 'APROVADA';
