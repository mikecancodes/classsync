import { z } from 'zod';
import { stateSchema } from '@/lib/model';
import { authenticate, readBody } from '@/lib/server';
const schema=z.object({version:z.literal(1),source:z.enum(['canvas','d2l','manual']),data:stateSchema});
export async function POST(request:Request) {
 const auth=await authenticate(request); if(!auth) return Response.json({error:'Sign in required.'},{status:401});
 try { const payload=schema.parse(await readBody(request,2000000)); return Response.json({preview:payload,requiresApproval:true,summary:{courses:payload.data.courses.length,assignments:payload.data.assignments.length,materials:payload.data.materials.length}}); } catch { return Response.json({error:'Invalid version 1 import payload.'},{status:400}); }
}
