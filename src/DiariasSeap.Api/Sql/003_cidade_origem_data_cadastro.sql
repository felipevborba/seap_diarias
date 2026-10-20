-- =====================================================================
-- 003: cidade de origem da viagem e filtros por data de cadastro.
-- =====================================================================

-- Cidade de origem (de onde o servidor parte). Obrigatória em lançamentos novos (regra da aplicação);
-- nos migrados vem do legado (cidade_origem/uf_origem), com o texto original preservado.
ALTER TABLE diarias.diaria
    ADD COLUMN origem_municipio_id INTEGER      NULL,
    ADD COLUMN origem_texto        VARCHAR(300) NULL,
    ADD CONSTRAINT diaria_origem_municipio_id_fkey FOREIGN KEY (origem_municipio_id) REFERENCES public.tabnaturalidade (id);
CREATE INDEX ix_diaria_origem_municipio ON diarias.diaria (origem_municipio_id);

-- Relatórios e painéis filtram por data de cadastro (além da data da diária).
CREATE INDEX ix_diaria_criado_em ON diarias.diaria (criado_em);
