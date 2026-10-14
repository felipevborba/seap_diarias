-- =====================================================================
-- 002: suporte a servidores vindos de sistemas legados.
-- O legado de Diárias tem ~250 servidores identificados só por matrícula (sem CPF em
-- nenhuma tabela). Eles entram com cpf nulo e origem 'LEGADO'; cadastros feitos pelo
-- sistema continuam exigindo CPF válido (regra da aplicação). A unicidade do CPF continua
-- valendo para quem tem CPF (UNIQUE ignora nulos) e o CHECK de formato também.
-- =====================================================================

ALTER TABLE comum.servidor ALTER COLUMN cpf DROP NOT NULL;

ALTER TABLE comum.servidor
    ADD COLUMN origem VARCHAR(10) NOT NULL DEFAULT 'SISTEMA',
    ADD CONSTRAINT servidor_origem_ck CHECK (origem IN ('SISTEMA', 'LEGADO'));

-- Servidor legado sem CPF é identificado pela matrícula (um registro por matrícula).
CREATE UNIQUE INDEX ix_servidor_matricula_sem_cpf ON comum.servidor (matricula)
    WHERE cpf IS NULL AND matricula IS NOT NULL;
