#!/bin/bash
set -euo pipefail
umask 077
prodip=$(docker inspect symbols-db-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
docker exec -i symbols-staging-api-1 node --input-type=module - "$prodip" <<'JS'
import assert from 'node:assert/strict';
import net from 'node:net';
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
 const role=(await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
 assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false});
 await assert.rejects(pool.query('SELECT * FROM schema_migrations'),{code:'42501'});
 await assert.rejects(pool.query('CREATE TABLE privilege_probe(id int)'),{code:'42501'});
 const blocked=await new Promise(resolve=>{
  const socket=net.connect({host:process.argv[2],port:5432});
  socket.setTimeout(3000);
  socket.on('connect',()=>{socket.destroy();resolve(false)});
  socket.on('timeout',()=>{socket.destroy();resolve(true)});
  socket.on('error',()=>resolve(true));
 });
 assert(blocked,'Staging API reached production DB TCP port');
 console.log(JSON.stringify({runtimePrivileges:'PASS',productionDbTcpBlocked:true}));
} finally { await pool.end(); }
JS
docker inspect --format '{{.Name}} memory={{.HostConfig.Memory}} nanoCpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} ports={{json .HostConfig.PortBindings}} networks={{json .NetworkSettings.Networks}} mounts={{json .Mounts}}' symbols-staging-api-1 symbols-staging-db-1
docker exec symbols-caddy-1 nslookup server
docker exec symbols-caddy-1 nslookup symbols-staging-api
