/**
 * SQLite lives only in this directory: open words.db (read-only lexicon) and
 * user.db (writable progress, migrated, never overwritten on upgrade).
 * Do not store the LLM API key here.
 */
export const sqliteLayer = 'src/db' as const;
