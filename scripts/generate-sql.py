import sqlite3,json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
for p in sorted((root/'drizzle').glob('*.sql')):db.executescript(p.read_text())
content=json.loads((root/'database/content.json').read_text())
tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
quote=lambda s:"'"+str(s).replace("'","''")+"'"
for dialect in ['original','postgresql','mssql']:
 out=root/'database'/dialect
 q=(lambda s:'['+s+']') if dialect=='mssql' else (lambda s:'"'+s+'"')
 schema=['-- Prepared during export from the final original migrations; no production rows.']
 for table in tables:
  cols=[]
  for _,name,typ,notnull,default,pk in db.execute('PRAGMA table_info('+table+')'):
   if dialect=='original':t=typ
   elif name=='price':t='numeric(22,2)' # SQLite INTEGER affinity historically stores fractions.
   elif typ.lower()=='integer':t='bigint'
   elif dialect=='postgresql':t='text COLLATE "C"'
   elif name in ('state','data'):t='nvarchar(max) COLLATE Latin1_General_100_BIN2'
   else:t='nvarchar(256) COLLATE Latin1_General_100_BIN2'
   col=q(name)+' '+t+(' NOT NULL' if notnull else ' NULL')+(' DEFAULT '+default if default is not None else '')+(' PRIMARY KEY' if pk else '')
   cols.append(col)
  body='CREATE TABLE '+q(table)+' (\n  '+',\n  '.join(cols)+'\n);'
  if dialect=='mssql':body="IF OBJECT_ID(N'dbo."+table+"', N'U') IS NULL\n"+body
  else:body=body.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ',1)
  schema.append(body)
  for row in db.execute('PRAGMA index_list('+table+')'):
   _,name,unique,origin,*_=row
   if origin=='pk':continue
   fields=[r[2] for r in db.execute('PRAGMA index_info('+name+')')]
   idx='CREATE '+('UNIQUE ' if unique else '')+'INDEX '+('IF NOT EXISTS ' if dialect!='mssql' else '')+q(name)+' ON '+q(table)+' ('+','.join(q(f) for f in fields)+')'
   if dialect=='mssql':
    if unique:
     nullable={r[1] for r in db.execute('PRAGMA table_info('+table+')') if not r[3]}
     if any(f in nullable for f in fields):idx+=' WHERE '+' AND '.join(q(f)+' IS NOT NULL' for f in fields if f in nullable)
    idx="IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'"+name+"' AND object_id=OBJECT_ID(N'dbo."+table+"'))\n"+idx
   schema.append(idx+';')
 (out/'01-schema.sql').write_text('\n'.join(schema)+'\n')
 # New export-only reference catalog. Runtime constants are still in JS.
 text='nvarchar(120) COLLATE Latin1_General_100_BIN2' if dialect=='mssql' else ('text COLLATE "C"' if dialect=='postgresql' else 'TEXT')
 payload='nvarchar(max)' if dialect=='mssql' else 'TEXT'
 ident=lambda n:q(n)
 create1=f"CREATE TABLE {q('game_content')} ({q('category')} {text} NOT NULL, {q('item_key')} {text} NOT NULL, {q('payload')} {payload} NOT NULL, PRIMARY KEY ({q('category')},{q('item_key')}));"
 create2=f"CREATE TABLE {q('game_content_links')} ({q('category')} {text} NOT NULL, {q('item_key')} {text} NOT NULL, {q('relation')} {text} NOT NULL, {q('target_category')} {text} NOT NULL, {q('target_key')} {text} NOT NULL, PRIMARY KEY ({q('category')},{q('item_key')},{q('relation')}), FOREIGN KEY ({q('category')},{q('item_key')}) REFERENCES {q('game_content')}({q('category')},{q('item_key')}), FOREIGN KEY ({q('target_category')},{q('target_key')}) REFERENCES {q('game_content')}({q('category')},{q('item_key')}));"
 if dialect=='mssql':
  create1="IF OBJECT_ID(N'dbo.game_content',N'U') IS NULL\n"+create1;create2="IF OBJECT_ID(N'dbo.game_content_links',N'U') IS NULL\n"+create2
 else:create1=create1.replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS');create2=create2.replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS')
 seed=['-- Export-only catalog; does not contain player data.', 'SET XACT_ABORT ON;\nBEGIN TRANSACTION;' if dialect=='mssql' else 'BEGIN;',create1,create2,'DELETE FROM game_content_links;','DELETE FROM game_content;']
 lit=lambda s:('N' if dialect=='mssql' else '')+quote(s)
 for r in content['records']:seed.append('INSERT INTO game_content(category,item_key,payload) VALUES('+','.join(lit(v) for v in [r['category'],r['key'],json.dumps(r['payload'],ensure_ascii=False,separators=(',',':'))])+');')
 for r in content['relations']:seed.append('INSERT INTO game_content_links(category,item_key,relation,target_category,target_key) VALUES('+','.join(lit(r[k]) for k in ['category','key','relation','targetCategory','targetKey'])+');')
 seed+=['COMMIT;']
 (out/'02-content.sql').write_text('\n'.join(seed)+'\n')
 verify="""SELECT category,COUNT(*) AS record_count FROM game_content GROUP BY category ORDER BY category;
SELECT COUNT(*) AS total_records FROM game_content;
SELECT COUNT(*) AS total_links FROM game_content_links;
SELECT COUNT(*) AS orphan_links FROM game_content_links l LEFT JOIN game_content c ON c.category=l.target_category AND c.item_key=l.target_key WHERE c.item_key IS NULL;
SELECT payload FROM game_content WHERE category='symbol' AND item_key='inspect';
"""
 if dialect=='original':verify+='PRAGMA integrity_check;\nPRAGMA foreign_key_check;\n'
 (out/'03-verify.sql').write_text(verify)
(root/'database/expected-counts.json').write_text(json.dumps({'records':len(content['records']),'links':len(content['relations']),'categories':{cat:sum(r['category']==cat for r in content['records']) for cat in sorted(set(r['category'] for r in content['records']))}},ensure_ascii=False,indent=2)+'\n')
print('Generated three SQL sets from',len(tables),'original tables')
