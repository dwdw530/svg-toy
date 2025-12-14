export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    el.setAttribute(key, String(value));
  }
  return el;
}

export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

