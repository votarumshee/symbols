#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username postgres --dbname symbols -v owner_password="$OWNER_PASSWORD" -v app_password="$APP_PASSWORD" <<'SQL'
CREATE ROLE symbols_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'owner_password';
CREATE ROLE symbols_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE symbols OWNER TO symbols_owner;
REVOKE ALL ON DATABASE symbols FROM PUBLIC;
GRANT CONNECT ON DATABASE symbols TO symbols_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO symbols_owner;
GRANT USAGE ON SCHEMA public TO symbols_app;
SQL
