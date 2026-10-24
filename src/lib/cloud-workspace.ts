import { z } from 'zod';
import { stateSchema } from './model';

export const revisionSchema = z.number().int().min(0).max(2147483647);
export const saveWorkspaceSchema = z.object({
  data: stateSchema,
  expectedRevision: revisionSchema.max(2147483646),
}).strict();
export const cloudWorkspaceSchema = z.object({
  data: stateSchema.nullable(),
  revision: revisionSchema,
  updatedAt: z.string().nullable(),
}).refine(value => (value.data === null) === (value.revision === 0));
export const savedWorkspaceSchema = z.object({
  revision: revisionSchema.positive(),
  updatedAt: z.string(),
});
export type CloudAction = 'save' | 'load' | 'replace';

export class CloudConflictError extends Error {
  constructor() {
    super('The cloud copy has changed or has not been loaded in this session. Your local work is safe. Export a backup, then load the cloud copy or explicitly replace it with this browser’s work.');
  }
}

// A baseline belongs to one account and is intentionally not persisted. A fresh
// session must load or explicitly review an existing cloud copy before replacing it.
export class CloudWorkspaceSession {
  private baseline: { userId: string; revision: number } | null = null;

  reset() { this.baseline = null; }

  revisionFor(userId: string) {
    return this.baseline?.userId === userId ? this.baseline.revision : 0;
  }

  accept(userId: string, revision: number) {
    this.baseline = { userId, revision };
  }
}

export async function readCloudWorkspace(token: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/workspace', {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load cloud workspace.');
  return cloudWorkspaceSchema.parse(result);
}

export async function writeCloudWorkspace(
  token: string, data: unknown, expectedRevision: number, fetcher: typeof fetch = fetch,
) {
  const body = saveWorkspaceSchema.parse({ data, expectedRevision });
  const response = await fetcher('/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 409) throw new CloudConflictError();
  if (!response.ok) throw new Error(result.error || 'Unable to save cloud workspace.');
  return savedWorkspaceSchema.parse(result);
}
