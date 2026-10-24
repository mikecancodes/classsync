'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { Unplug } from 'lucide-react';
import type { AcademicState } from '@/lib/model';
import { removeImported } from '@/lib/d2l-import';
import { materialFile } from '@/lib/material-files';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Clears D2L-imported data so the next Sync starts fresh (handy for testing sync)
export function UnsyncButton({ data, setData, notify }: { data: AcademicState; setData: Dispatch<SetStateAction<AcademicState>>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const preview = removeImported(data);
  const { counts } = preview;

  async function unsync() {
    const parts = [plural(counts.courses, 'class'), plural(counts.assignments, 'assignment'), plural(counts.announcements, 'announcement'), counts.materials ? plural(counts.materials, 'saved material') : ''].filter(Boolean).join(', ');
    if (!window.confirm(`Remove everything synced from D2L? This deletes ${parts}, including scores and notes you added to those classes. Classes you created yourself are kept.`)) return;
    setBusy(true);
    try {
      // Attached files live outside the workspace, so remove them too
      await Promise.all(preview.materialIds.map(id => materialFile(id, 'delete').catch(() => undefined)));
      setData(current => removeImported(current).state);
      notify(`Unsynced: removed ${parts}. Press Sync classes to import again.`);
    } finally { setBusy(false); }
  }

  return <button type="button" className="secondary-button" disabled={busy || counts.courses === 0} onClick={() => void unsync()} title={counts.courses ? undefined : 'Nothing has been synced from D2L yet'}>
    <Unplug size={15} />{busy ? 'Unsyncing…' : 'Unsync D2L data'}
  </button>;
}
