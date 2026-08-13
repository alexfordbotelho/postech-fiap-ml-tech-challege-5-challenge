-- Creates the Langfuse database and grants access to the datathon user.
-- For EXISTING postgres volumes (where init scripts already ran), run manually:
--   docker exec -it <postgres-container> psql -U datathon -d datathon_db -c "CREATE DATABASE langfuse_db;"

SELECT 'CREATE DATABASE langfuse_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse_db') \gexec

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'datathon') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON DATABASE langfuse_db TO datathon';
  END IF;
END $$;
