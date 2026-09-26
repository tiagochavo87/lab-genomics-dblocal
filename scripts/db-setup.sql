-- Cria/atualiza o usuário do banco usado pela API (sem superusuário) e
-- transfere para ele a posse das tabelas. Idempotente.
-- Variáveis psql: app_user, app_pass, db
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_user', :'app_pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER PASSWORD %L', :'app_user', :'app_pass') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'app_user') \gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'app_user') \gexec
SELECT format('ALTER TABLE public.%I OWNER TO %I', tablename, :'app_user')
FROM pg_tables WHERE schemaname = 'public' AND tableowner <> :'app_user' \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO %I', sequencename, :'app_user')
FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> :'app_user' \gexec
