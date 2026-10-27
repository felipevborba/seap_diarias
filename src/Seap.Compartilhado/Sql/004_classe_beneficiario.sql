-- =====================================================================
-- 004: classe de beneficiário de diárias (Decreto Estadual nº 25.845/2003, Tabela de Diárias Nacionais):
--   1 = Secretários de Estado, Secretários Executivos, presidentes de entidades da administração indireta;
--   2 = dirigentes, cargos em comissão, funções de chefia/assessoramento e cargos de nível superior;
--   3 = demais servidores.
-- Vale a do servidor; sem ela, a do cargo; sem as duas, 3 para contratados e 2 para os demais vínculos
-- (o que o sistema legado praticava: policiais penais na classe 2, contratados na 3).
-- =====================================================================
ALTER TABLE comum.cargo
    ADD COLUMN classe_beneficiario SMALLINT NULL,
    ADD CONSTRAINT cargo_classe_beneficiario_ck CHECK (classe_beneficiario BETWEEN 1 AND 3);
ALTER TABLE comum.servidor
    ADD COLUMN classe_beneficiario SMALLINT NULL,
    ADD CONSTRAINT servidor_classe_beneficiario_ck CHECK (classe_beneficiario BETWEEN 1 AND 3);
