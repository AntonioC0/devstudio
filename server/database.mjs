import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';

const migrationDirectory=new URL('../drizzle/',import.meta.url);
const migrations=await Promise.all((await readdir(migrationDirectory)).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL(name,migrationDirectory),'utf8')));

export class MemoryDatabase{
  constructor(){
    this.native=new DatabaseSync(':memory:');
    this.native.exec('PRAGMA foreign_keys=ON');
    for(const migration of migrations)this.native.exec(migration);
    this.closed=false;
  }
  prepare(sql){
    const statement=this.native.prepare(sql);let values=[];
    const run=()=>{const result=statement.run(...values);return{meta:{changes:Number(result.changes)}};};
    return{bind(...args){values=args;return this;},async first(){return statement.get(...values)||null;},async all(){return{results:statement.all(...values)};},async run(){return run();},runSync:run};
  }
  async batch(statements){
    // Execute without yielding between BEGIN and COMMIT, including concurrent HTTP requests.
    this.native.exec('BEGIN');
    try{const result=statements.map(statement=>statement.runSync());this.native.exec('COMMIT');return result;}
    catch(error){this.native.exec('ROLLBACK');throw error;}
  }
  close(){if(!this.closed){this.native.close();this.closed=true;}}
}

export class SessionDatabases{
  constructor({clock=Date.now,idleMs=30*60*1000,maxAgeMs=2*60*60*1000,maxSessions=16}={}){this.clock=clock;this.idleMs=idleMs;this.maxAgeMs=maxAgeMs;this.maxSessions=maxSessions;this.sessions=new Map();}
  sweep(){for(const [id,session]of this.sessions)if(this.clock()-session.lastSeen>this.idleMs||this.clock()-session.createdAt>this.maxAgeMs)this.end(id);}
  acquire(id){
    this.sweep();let session=this.sessions.get(id);
    if(!session){
      if(this.sessions.size>=this.maxSessions)throw new Error('SESSION_CAPACITY');
      session={db:new MemoryDatabase(),createdAt:this.clock(),lastSeen:this.clock(),active:0,ended:false,abort:new AbortController()};this.sessions.set(id,session);
    }
    session.active++;session.lastSeen=this.clock();
    return{session,release:()=>{session.active--;if(session.ended&&session.active===0)session.db.close();}};
  }
  end(id){const session=this.sessions.get(id);if(!session)return;this.sessions.delete(id);session.ended=true;session.abort.abort();session.closeRuntime?.();if(session.active===0)session.db.close();}
  close(){for(const id of this.sessions.keys())this.end(id);}
}
