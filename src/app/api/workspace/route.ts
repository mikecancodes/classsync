import { authenticate, readBody } from '@/lib/server';
import { stateSchema } from '@/lib/model';
export async function GET(request:Request) {
 const auth=await authenticate(request); if(!auth) return Response.json({error:'Sign in required.'},{status:401});
 const {data,error}=await auth.db.from('workspaces').select('data').eq('user_id',auth.user.id).maybeSingle();
 if(error) return Response.json({error:'Unable to load workspace. Check database setup.'},{status:500});
 return Response.json({data:data?.data??null});
}
export async function PUT(request:Request) {
 const auth=await authenticate(request); if(!auth) return Response.json({error:'Sign in required.'},{status:401});
 try { const data=stateSchema.parse(await readBody(request,2000000)); const {error}=await auth.db.from('workspaces').upsert({user_id:auth.user.id,data,updated_at:new Date().toISOString()}); if(error) return Response.json({error:'Unable to save workspace.'},{status:500}); return Response.json({ok:true}); } catch { return Response.json({error:'Invalid academic data.'},{status:400}); }
}
