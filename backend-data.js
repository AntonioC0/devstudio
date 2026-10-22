// The guest receives only these bounded data/crypto operations, never a Node object.
export function createBackendContext(DatabaseSync,crypto){
  const database=new DatabaseSync(':memory:');
  database.exec('PRAGMA max_page_count=512; PRAGMA temp_store=MEMORY; CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(collection,id));');
  function name(value){if(typeof value!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(value))throw new Error('Coleção ou campo inválido.');return value;}
  function record(value){if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>8000||Object.keys(value).length>60)throw new Error('Registro inválido ou muito grande.');return value;}
  const db={
    list(collection,options={}){
      name(collection);const where=options.where||{};if(Object.keys(where).length>12)throw new Error('Filtro muito grande.');
      const clauses=[],values=[collection];
      for(const [key,value]of Object.entries(where)){name(key);if(value!==null&&!['string','number','boolean'].includes(typeof value))throw new Error('Valor de filtro inválido.');clauses.push('json_extract(data,?) IS ?');values.push('$.'+key,typeof value==='boolean'?Number(value):value);}
      const limit=Math.min(100,Math.max(1,Number.isInteger(options.limit)?options.limit:100)),offset=Math.min(5000,Math.max(0,Number.isInteger(options.offset)?options.offset:0));
      return database.prepare('SELECT data FROM records WHERE collection=?'+(clauses.length?' AND '+clauses.join(' AND '):'')+' ORDER BY rowid LIMIT ? OFFSET ?').all(...values,limit,offset).map(row=>JSON.parse(row.data));
    },
    get(collection,id){name(collection);if(typeof id!=='string'||id.length>100)throw new Error('Identificador inválido.');const row=database.prepare('SELECT data FROM records WHERE collection=? AND id=?').get(collection,id);return row?JSON.parse(row.data):null;},
    insert(collection,value){name(collection);record(value);if(database.prepare('SELECT COUNT(*) AS n FROM records').get().n>=5000)throw new Error('Limite de registros do teste atingido.');const data={...value,id:crypto.randomUUID()};database.prepare('INSERT INTO records(collection,id,data) VALUES(?,?,?)').run(collection,data.id,JSON.stringify(data));return data;},
    update(collection,id,patch){record(patch);const previous=db.get(collection,id);if(!previous)return null;const data={...previous,...patch,id};record(data);database.prepare('UPDATE records SET data=? WHERE collection=? AND id=?').run(JSON.stringify(data),collection,id);return data;},
    remove(collection,id){const previous=db.get(collection,id);if(!previous)return false;database.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,id);return true;}
  };
  const cryptography={
    randomToken(){return crypto.randomBytes(32).toString('hex');},
    hashPassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Senha deve ter entre 12 e 128 caracteres.');const salt=crypto.randomBytes(16).toString('hex');return 'scrypt:'+salt+':'+crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:32*1024*1024}).toString('hex');},
    verifyPassword(password,hash){if(typeof password!=='string'||password.length>128||typeof hash!=='string'||!/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash))return false;const [,salt,value]=hash.split(':');return crypto.timingSafeEqual(crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:32*1024*1024}),Buffer.from(value,'hex'));}
  };
  return{db,crypto:cryptography,close:()=>database.close()};
}
export const BACKEND_DATA_SOURCE="import {DatabaseSync} from 'node:sqlite';\nimport * as crypto from 'node:crypto';\nconst createContext="+createBackendContext.toString()+";\nexport const context=createContext(DatabaseSync,crypto);\n";
