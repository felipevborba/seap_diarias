-- =====================================================================
-- 004: tipos de diária com valor livre (ex.: passagem aérea). O valor é digitado no lançamento,
--      não vem da Tabela de Valores, e o item não conta como "dia" de diária (quantidade = 1).
-- =====================================================================
ALTER TABLE diarias.tipo_diaria ADD COLUMN valor_livre BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE diarias.tipo_diaria SET valor_livre = TRUE WHERE nome ILIKE 'passage%';
