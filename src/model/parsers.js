export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseViewBoxString(viewBox) {
  const parts = String(viewBox ?? "")
    .trim()
    .split(/[\s,]+/g)
    .filter(Boolean)
    .slice(0, 4);

  if (parts.length !== 4) return null;
  const [x, y, w, h] = parts.map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

export function formatViewBox({ x, y, w, h }) {
  return `${x} ${y} ${w} ${h}`;
}

