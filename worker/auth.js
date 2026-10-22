import {scryptAsync} from '@noble/hashes/scrypt.js';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils.js';
export const cookieName='__Host-devstudio_session';
const encoder=new TextEncoder();
export async function passwordHash(password,salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)))) {
  const hash=await scryptAsync(encoder.encode(password),hexToBytes(salt),{N:32768,r:8,p:3,dkLen:32,maxmem:64*1024*1024});
  return `scrypt:32768:8:3:${salt}:${bytesToHex(hash)}`;
}
export async function verifyPassword(password,stored){
  const parts=stored.split(':');
  if(parts.length!==6 || parts.slice(0,4).join(':')!=='scrypt:32768:8:3')return false;
  const actual=await passwordHash(password,parts[4]);
  const a=encoder.encode(actual),b=encoder.encode(stored);if(a.length!==b.length)return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
export async function digest(value){return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
export function cookie(token,maxAge=604800){return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export async function createSession(db,userId){
  const token=bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),userId,Date.now()+604800000).run();
  return cookie(token);
}
export function sessionToken(request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';}
export async function getUser(db,request){
  const token=sessionToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT u.id,u.email,u.name,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first();
}
