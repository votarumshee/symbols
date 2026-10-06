import {createPool} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
const p=createPool(config());try{await p.query(`GRANT USAGE ON SCHEMA public TO symbols_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON profiles,vaults,account_sessions,recovery,recovery_limits,arenas,arena_members,listings,commands,events,blocks,reports,legacy_rows,avatar_deletions TO symbols_app;
GRANT SELECT ON game_content,game_content_links,content_versions TO symbols_app;`);}finally{await p.end();}
