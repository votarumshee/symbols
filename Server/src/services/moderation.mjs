export async function moderation(pool,id){return {blocked:(await pool.query('SELECT p.id,p.nick FROM blocks b JOIN profiles p ON p.id=b.target WHERE b.owner=$1 ORDER BY p.nick,p.id',[id])).rows};}
