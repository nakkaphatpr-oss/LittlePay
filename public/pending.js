import { validateCommand } from './core.js';

const KEY = 'littlepay-pending-command-v1';
// Only the unfinished command is kept in this tab. Never persist a Google token.
export function pendingStore(storage) {
  return {
    load() {
      const raw = storage.getItem(KEY);
      return raw ? validateCommand(JSON.parse(raw)) : null;
    },
    save(command) { storage.setItem(KEY, JSON.stringify(validateCommand(command))); },
    clear() { storage.removeItem(KEY); }
  };
}

export function commandWasRejected(error) {
  // A proxy timeout/503 may occur AFTER the row was committed. Keep its ID.
  return error.outcomeUnknown !== true && [400, 409, 413, 415].includes(error.status);
}
