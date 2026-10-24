import { createClient } from '@supabase/supabase-js';
export async function authenticate(request: Request) {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const token = request.headers.get('authorization')?.replace(/^Bearer /,'');
 if (!url || !key || !token) return null;
 const db = createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error} = await db.auth.getUser(token);
 return error || !data.user ? null : {db,user:data.user};
}
export async function readBody(request: Request, limit=250000) {
 const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
 let size=0; const chunks: Uint8Array[]=[];
 while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>limit) {await reader.cancel(); throw new Error('Request too large');} chunks.push(value); }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const usage = new Map<string,{count:number;reset:number}>();
export function allowRequest(key:string) {
 const now=Date.now(); for(const [id,item] of usage) if(item.reset<now) usage.delete(id);
 const item=usage.get(key); if(item && item.count>=20) return false;
 usage.set(key,{count:(item?.count??0)+1,reset:item?.reset??now+3600000}); return true;
}
