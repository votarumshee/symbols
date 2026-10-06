import pg from 'pg';
export const createPool=cfg=>new pg.Pool({connectionString:cfg.databaseUrl,max:cfg.poolMax??10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:10000,application_name:'symbols-v3'});
export async function transaction(pool,fn,{readOnly=false}={}){
 const c=await pool.connect();
 try{await c.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await c.query("SET LOCAL lock_timeout='5s'");const value=await fn(c);await c.query('COMMIT');return value;}
 catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export const one=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]??null;
export async function lockVaults(c,ids){
 const rows=(await c.query('SELECT * FROM vaults WHERE profile_id=ANY($1::text[]) ORDER BY profile_id FOR UPDATE',[Array.from(new Set(ids))])).rows;
 if(rows.length!==new Set(ids).size)throw Error('Аккаунт недоступен');
 return rows.map(r=>({...r,d:r.data,before:structuredClone(r.data)}));
}
