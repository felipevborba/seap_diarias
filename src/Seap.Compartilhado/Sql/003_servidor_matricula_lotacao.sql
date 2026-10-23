-- =====================================================================
-- 003: matrícula nova (formato SAD "1234567/01") e lotação editável dos servidores.
-- =====================================================================

-- A matrícula exibida e exportada passa a ser a nova (a do sistema legado de diárias). A da Carteira
-- (antiga, só dígitos) fica guardada para busca e não sobrescreve mais a nova na sincronização.
ALTER TABLE comum.servidor ADD COLUMN matricula_antiga VARCHAR(50) NULL;
CREATE INDEX ix_servidor_matricula_antiga ON comum.servidor (matricula_antiga);

-- Lotação alterada nas Diárias: a sincronização com a Carteira deixa de mexer nela.
ALTER TABLE comum.servidor ADD COLUMN lotacao_manual BOOLEAN NOT NULL DEFAULT FALSE;
