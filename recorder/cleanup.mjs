// Cleanup after a recording. Importing record.mjs runs main, so this lives here where tests can import it.
import fsp from 'node:fs/promises';
import path from 'node:path';

// Both the ids the recorder creates and the ids the CLI reports are UUIDs (8-4-4-4-12 hex). Accept only that shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Remove what file checkpointing leaves in <configRoot>/file-history/<session id>, only for this recording's ids.
// Duplicates are dropped. Ids not shaped like a UUID (null, empty, `.`, `..`, containing `/`) are skipped. Missing dirs are a no-op.
export async function removeFileHistory(configRoot, ids) {
  const base = path.join(configRoot, 'file-history');
  for (const id of new Set(ids)) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) continue;
    await fsp.rm(path.join(base, id), { recursive: true, force: true });
  }
}
