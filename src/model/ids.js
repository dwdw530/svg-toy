export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  const ts = Date.now().toString(16);
  const rnd = Math.random().toString(16).slice(2);
  return `${prefix}-${ts}-${rnd}`;
}

