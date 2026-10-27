-- =====================================================================
-- 006: Tabela de Diárias Nacionais (Decreto Estadual nº 25.845/2003, redação do Decreto nº 55.723/2023).
--      O valor passa a considerar também a classe do beneficiário (1, 2, 3) e a faixa do destino:
--        CAPITAIS           Grupo I  - capitais brasileiras (exceto Recife)
--        BRASILIA_MANAUS    Grupo I  - Brasília e Manaus
--        CAPITAIS_ESPECIAIS Grupo I  - São Paulo, Rio de Janeiro, Belo Horizonte, Porto Alegre, Belém e Fortaleza
--        DEMAIS_FORA        Grupo II - demais cidades fora do estado (exceto PE, SE, AL, PB, RN e Juazeiro-BA)
--        ESTADO             Grupo III - Recife e interior de PE, SE, AL, PB, RN e Juazeiro-BA
--      Nulos continuam significando "qualquer"; vale a linha mais específica. Só acrescenta (nada é apagado).
-- =====================================================================
ALTER TABLE diarias.valor_diaria
    ADD COLUMN classe_beneficiario SMALLINT    NULL,
    ADD COLUMN faixa_destino       VARCHAR(20) NULL,
    ADD CONSTRAINT valor_diaria_classe_ck CHECK (classe_beneficiario BETWEEN 1 AND 3),
    ADD CONSTRAINT valor_diaria_faixa_ck CHECK (faixa_destino IN ('CAPITAIS', 'BRASILIA_MANAUS', 'CAPITAIS_ESPECIAIS', 'DEMAIS_FORA', 'ESTADO'));

-- A regra "sem vigências sobrepostas para a mesma combinação" passa a incluir classe e faixa.
ALTER TABLE diarias.valor_diaria DROP CONSTRAINT valor_diaria_vigencia_excl;
ALTER TABLE diarias.valor_diaria ADD CONSTRAINT valor_diaria_vigencia_excl EXCLUDE USING gist (
    tipo_diaria_id WITH =,
    (COALESCE(vinculo, 0::smallint)) WITH =,
    (COALESCE(cargo_id, 0)) WITH =,
    (COALESCE(classe_beneficiario, 0::smallint)) WITH =,
    (COALESCE(faixa_destino, '')) WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
);

-- Valores oficiais (mesma vigência inicial da tabela já cadastrada: 01/08/2024).
INSERT INTO diarias.valor_diaria (tipo_diaria_id, classe_beneficiario, faixa_destino, valor, vigencia_inicio)
SELECT t.id, v.classe, v.faixa, v.valor, DATE '2024-08-01'
FROM (VALUES
    ('Integral', 1, 'CAPITAIS', 424.22), ('Integral', 1, 'BRASILIA_MANAUS', 475.13), ('Integral', 1, 'CAPITAIS_ESPECIAIS', 449.67),
    ('Integral', 1, 'DEMAIS_FORA', 339.36), ('Integral', 1, 'ESTADO', 241.86),
    ('Parcial', 1, 'CAPITAIS', 127.26), ('Parcial', 1, 'BRASILIA_MANAUS', 142.53), ('Parcial', 1, 'CAPITAIS_ESPECIAIS', 134.90),
    ('Parcial', 1, 'DEMAIS_FORA', 101.80), ('Parcial', 1, 'ESTADO', 72.54),
    ('Integral', 2, 'CAPITAIS', 313.28), ('Integral', 2, 'BRASILIA_MANAUS', 350.87), ('Integral', 2, 'CAPITAIS_ESPECIAIS', 332.08),
    ('Integral', 2, 'DEMAIS_FORA', 250.62), ('Integral', 2, 'ESTADO', 170.12),
    ('Parcial', 2, 'CAPITAIS', 94.00), ('Parcial', 2, 'BRASILIA_MANAUS', 105.28), ('Parcial', 2, 'CAPITAIS_ESPECIAIS', 99.64),
    ('Parcial', 2, 'DEMAIS_FORA', 75.20), ('Parcial', 2, 'ESTADO', 57.00),
    ('Integral', 3, 'CAPITAIS', 215.40), ('Integral', 3, 'BRASILIA_MANAUS', 241.25), ('Integral', 3, 'CAPITAIS_ESPECIAIS', 228.32),
    ('Integral', 3, 'DEMAIS_FORA', 172.32), ('Integral', 3, 'ESTADO', 120.00),
    ('Parcial', 3, 'CAPITAIS', 64.62), ('Parcial', 3, 'BRASILIA_MANAUS', 72.37), ('Parcial', 3, 'CAPITAIS_ESPECIAIS', 68.50),
    ('Parcial', 3, 'DEMAIS_FORA', 57.00), ('Parcial', 3, 'ESTADO', 55.00)
) AS v (tipo, classe, faixa, valor)
JOIN diarias.tipo_diaria t ON t.nome = v.tipo;
