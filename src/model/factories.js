import { createId } from "./ids.js";
import { clamp } from "./parsers.js";

function normalizeOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0, 1);
}

function normalizeStrokeWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function makeStyle(partial = {}) {
  return {
    fill: partial.fill ?? "#4f8cff",
    stroke: partial.stroke ?? "#e6e8ff",
    strokeWidth: normalizeStrokeWidth(partial.strokeWidth ?? 2),
    opacity: normalizeOpacity(partial.opacity ?? 1)
  };
}

export function makeTransform(partial = {}) {
  return {
    x: Number(partial.x ?? 0),
    y: Number(partial.y ?? 0),
    scaleX: Number(partial.scaleX ?? 1),
    scaleY: Number(partial.scaleY ?? 1),
    rotate: Number(partial.rotate ?? 0)
  };
}

export function createRectNode({ x, y, width = 160, height = 100, rx = 14, style } = {}) {
  return {
    id: createId("rect"),
    type: "rect",
    transform: makeTransform({ x: Number(x ?? 0), y: Number(y ?? 0) }),
    style: makeStyle(style),
    data: {
      width: Number(width),
      height: Number(height),
      rx: Number(rx)
    }
  };
}

export function createCircleNode({ x, y, r = 60, style } = {}) {
  return {
    id: createId("circle"),
    type: "circle",
    transform: makeTransform({ x: Number(x ?? 0), y: Number(y ?? 0) }),
    style: makeStyle(style),
    data: {
      r: Number(r)
    }
  };
}

export function createTextNode({
  x,
  y,
  content = "Hello SVG",
  fontSize = 42,
  fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, PingFang SC, Microsoft YaHei",
  style
} = {}) {
  return {
    id: createId("text"),
    type: "text",
    transform: makeTransform({ x: Number(x ?? 0), y: Number(y ?? 0) }),
    style: makeStyle({ ...style, stroke: "none" }),
    data: {
      content: String(content),
      fontSize: Number(fontSize),
      fontFamily: String(fontFamily),
      dominantBaseline: "middle",
      textAnchor: "middle"
    }
  };
}

export function createUseNode({ assetId, x, y, width, height, style } = {}) {
  return {
    id: createId("use"),
    type: "use",
    transform: makeTransform({ x: Number(x ?? 0), y: Number(y ?? 0) }),
    style: makeStyle(style),
    data: {
      assetId: String(assetId ?? ""),
      width: Number(width ?? 0),
      height: Number(height ?? 0)
    }
  };
}

export function createAsset({ id = createId("asset"), name, viewBox, innerMarkup, meta, archived = false } = {}) {
  return {
    id: String(id),
    name: String(name ?? id),
    viewBox: String(viewBox ?? "0 0 100 100"),
    innerMarkup: String(innerMarkup ?? ""),
    meta: meta ? { ...meta } : {},
    archived: Boolean(archived)
  };
}
