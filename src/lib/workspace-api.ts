import { z } from 'zod';
import { authenticate, readBody } from './server';
import { saveWorkspaceSchema } from './cloud-workspace';

const headers = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

// Authentication remains the production dependency; injection lets route tests
// exercise validation and error responses without real tokens or a live account.
export function createWorkspaceHandlers(authenticateRequest = authenticate) {
  return {
    async GET(request: Request) {
      try {
        const auth = await authenticateRequest(request);
        if (!auth) return reply({ error: 'Sign in required.' }, 401);
        const { data, error } = await auth.db.from('workspaces')
          .select('data,revision,updated_at').eq('user_id', auth.user.id).maybeSingle();
        if (error) return reply({ error: 'Unable to load workspace. Apply the cloud-save database migrations.' }, 503);
        return reply({ data: data?.data ?? null, revision: data?.revision ?? 0, updatedAt: data?.updated_at ?? null });
      } catch {
        return reply({ error: 'Cloud storage is unavailable. Try again later.' }, 503);
      }
    },
    async PUT(request: Request) {
      try {
        const auth = await authenticateRequest(request);
        if (!auth) return reply({ error: 'Sign in required.' }, 401);
        const { data, expectedRevision } = saveWorkspaceSchema.parse(await readBody(request, 2000000));
        const result = await auth.db.rpc('save_workspace', {
          workspace_data: data, expected_revision: expectedRevision,
        });
        if (result.error?.code === 'PT409') return reply({ error: 'Cloud copy changed. Your local work was preserved.' }, 409);
        if (result.error) return reply({ error: 'Unable to save workspace. Check the database migrations and try again.' }, 503);
        const saved = result.data?.[0];
        if (!saved) return reply({ error: 'The database did not confirm the save. Reload the cloud copy before retrying.' }, 503);
        return reply({ revision: saved.revision, updatedAt: saved.updated_at });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError ||
          (error instanceof Error && ['Request too large', 'Missing body'].includes(error.message))) {
          return reply({ error: 'Invalid workspace save. Reload the app; a workspace and expected revision are required.' }, 400);
        }
        return reply({ error: 'Cloud storage is unavailable. Try again later.' }, 503);
      }
    },
  };
}
