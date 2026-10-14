-- =====================================================================
-- Verificação PRÉ-DEPLOY do banco de produção (somente leitura).
-- Roda numa transação READ ONLY: não altera nada.
--
--   psql -h 10.238.118.253 -U <usuario> -d carteira -f database/verificacao_producao.sql
--
-- Responde: o usuário consegue criar os schemas/extensões e as FKs para o legado?
-- Os dados da Carteira estão em condição de serem importados como servidores?
-- =====================================================================
BEGIN TRANSACTION READ ONLY;

\echo '== 1. Servidor e usuário'
SELECT version() AS versao,
       current_setting('server_version_num')::int >= 130000 AS pg13_ou_maior,
       current_user AS usuario,
       current_database() AS banco,
       current_setting('TimeZone') AS fuso;

\echo '== 2. Permissões para criar schemas (comum, diarias)'
SELECT has_database_privilege(current_database(), 'CREATE') AS pode_criar_schema,
       (SELECT d.datdba::regrole::text FROM pg_database d WHERE d.datname = current_database()) AS dono_do_banco,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario;

\echo '== 3. Extensões necessárias (precisam estar disponíveis; trusted=true permite criar sem superusuário)'
SELECT e.name, e.default_version AS disponivel, e.installed_version AS instalada,
       (SELECT bool_or(v.trusted) FROM pg_available_extension_versions v WHERE v.name = e.name) AS trusted
FROM pg_available_extensions e
WHERE e.name IN ('btree_gist', 'unaccent')
ORDER BY e.name;

\echo '== 4. Schemas já existentes (comum/diarias devem estar AUSENTES no primeiro deploy)'
SELECT nspname AS schema, nspowner::regrole AS dono
FROM pg_namespace WHERE nspname IN ('comum', 'diarias');

\echo '== 5. Privilégios nas tabelas compartilhadas (REFERENCES é necessário para as FKs)'
SELECT t AS tabela,
       has_table_privilege(current_user, 'public.' || t, 'SELECT')     AS select_,
       has_table_privilege(current_user, 'public.' || t, 'REFERENCES') AS references_,
       has_table_privilege(current_user, 'public.' || t, 'INSERT')     AS insert_,
       has_table_privilege(current_user, 'public.' || t, 'UPDATE')     AS update_
FROM unnest(ARRAY['usuario', 'unidade', 'policia_penal', 'tabuf', 'tabnaturalidade']) AS t;

\echo '== 6. Volume das tabelas compartilhadas'
SELECT (SELECT count(*) FROM public.usuario)                               AS usuarios,
       (SELECT count(*) FROM public.usuario WHERE principal = 'S')         AS administradores_gerais,
       (SELECT count(*) FROM public.unidade)                               AS unidades,
       (SELECT count(*) FROM public.policia_penal)                         AS policiais,
       (SELECT count(*) FROM public.tabuf)                                 AS ufs,
       (SELECT count(*) FROM public.tabnaturalidade)                       AS municipios,
       (SELECT count(*) FROM public.tabnaturalidade n JOIN public.tabuf u ON u.id = n.uf_id
         WHERE u.sigla = 'PE')                                             AS municipios_pe;

\echo '== 7. Qualidade dos policiais para a sincronização (CPF é a chave do servidor)'
SELECT count(*) FILTER (WHERE length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) <> 11) AS sem_cpf_valido,
       count(*) FILTER (WHERE status_trabalho = 2)                                          AS ativos,
       count(*) FILTER (WHERE unidade_id IS NULL)                                           AS sem_lotacao,
       count(*) FILTER (WHERE matricula IS NULL OR matricula = '')                          AS sem_matricula
FROM public.policia_penal;

\echo '== 8. CPFs duplicados em policia_penal (cada CPF vira um único servidor; duplicados são ignorados)'
SELECT regexp_replace(cpf, '\D', '', 'g') AS cpf, count(*) AS qtd, string_agg(id::text, ',') AS ids
FROM public.policia_penal
WHERE length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) = 11
GROUP BY 1 HAVING count(*) > 1
ORDER BY qtd DESC
LIMIT 20;

\echo '== 9. Administradores gerais (entram como ADMIN nas Diárias no primeiro acesso)'
SELECT id, nome, matricula FROM public.usuario WHERE principal = 'S' ORDER BY nome;

ROLLBACK;
