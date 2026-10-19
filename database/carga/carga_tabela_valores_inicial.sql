-- =====================================================================
-- Tabela de valores inicial das diárias (valores genéricos: qualquer vínculo e cargo).
-- Base: prática do sistema legado — Integral R$ 170,12 (>90% dos lançamentos desde 08/2024) e
-- Parcial R$ 57,00 (>85% desde 02/2024). Vigência a partir de 01/08/2024 para cobrir lançamentos tardios.
-- Valores diferentes (ex.: R$ 180 em operações, contratados) devem ser cadastrados pela área na tela
-- Tabela de Valores, como linhas mais específicas (tipo/vínculo/cargo) — elas têm precedência.
--
-- Idempotente: não insere se já houver valor genérico vigente sobreposto para o tipo.
-- =====================================================================
BEGIN;

INSERT INTO diarias.valor_diaria (tipo_diaria_id, vinculo, cargo_id, valor, vigencia_inicio, vigencia_fim)
SELECT t.id, NULL, NULL, v.valor, DATE '2024-08-01', NULL
FROM (VALUES ('Integral', 170.12), ('Parcial', 57.00)) AS v(tipo, valor)
JOIN diarias.tipo_diaria t ON t.nome = v.tipo
WHERE NOT EXISTS (
    SELECT 1 FROM diarias.valor_diaria x
    WHERE x.tipo_diaria_id = t.id AND x.vinculo IS NULL AND x.cargo_id IS NULL
      AND daterange(x.vigencia_inicio, x.vigencia_fim, '[]') && daterange(DATE '2024-08-01', NULL, '[]'));

INSERT INTO comum.auditoria (modulo, entidade, entidade_id, raiz_entidade, raiz_id, acao, usuario_nome, alteracoes)
SELECT 'DIARIAS', 'valor_diaria', 'carga_inicial', 'valor_diaria', 'carga_inicial', 'INCLUSAO', 'Carga inicial (prática do legado)',
       '{"integral": 170.12, "parcial": 57.00, "vigencia_inicio": "2024-08-01", "base": "valores dominantes no SISDIARIA desde 08/2024"}'
WHERE NOT EXISTS (SELECT 1 FROM comum.auditoria WHERE entidade = 'valor_diaria' AND entidade_id = 'carga_inicial');

COMMIT;
