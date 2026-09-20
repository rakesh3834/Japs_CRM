// A mutation refresh must run after any earlier poll, never reuse its stale read.
export function createRefreshQueue() {
  let pending = Promise.resolve();
  return (read) => { const next = pending.then(read, read); pending = next.catch(() => {}); return next; };
}
