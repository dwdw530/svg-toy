import { createAsset } from "../model/factories.js";
import { createId } from "../model/ids.js";

const DISALLOWED_TAGS = new Set(["script", "foreignObject", "iframe", "object", "embed", "image", "a"]);

const EXTERNAL_URL_RE = /url\(\s*(['"])?\s*(https?:|javascript:)[^)]+\)/i;
const EXTERNAL_URL_RE_GLOBAL = /url\(\s*(['"])?\s*(https?:|javascript:)[^)]+\)/gi;

function isExternalHref(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v.startsWith("http:") || v.startsWith("https:") || v.startsWith("javascript:");
}

function stripExternalUrls(text) {
  return String(text ?? "").replace(EXTERNAL_URL_RE_GLOBAL, "");
}

function applyInlineStyle(el, declText) {
  const prev = el.getAttribute("style") ?? "";
  const decl = String(declText ?? "").trim();
  if (!decl) return;
  if (!prev.trim()) {
    el.setAttribute("style", decl);
    return;
  }
  el.setAttribute("style", `${prev.replace(/;\s*$/, "")};${decl}`);
}

function inlineStyleElements(svgRoot) {
  const styleEls = Array.from(svgRoot.querySelectorAll("style"));
  if (!styleEls.length) return;

  for (const styleEl of styleEls) {
    let css = String(styleEl.textContent ?? "");
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    css = css.replace(/@import\s+[^;]+;/g, "");
    css = stripExternalUrls(css);

    const re = /([^{}]+)\{([^}]*)\}/g;
    for (const match of css.matchAll(re)) {
      const selectorsRaw = match[1] ?? "";
      const declRaw = match[2] ?? "";
      const decl = stripExternalUrls(declRaw).trim();
      if (!decl) continue;

      for (const sel of selectorsRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const ok = sel === "*" || /^(\.[_a-zA-Z][\w-]*|[a-zA-Z][\w-]*)$/.test(sel);
        if (!ok) continue;

        const targets = [];
        if (svgRoot.matches(sel)) targets.push(svgRoot);
        targets.push(...svgRoot.querySelectorAll(sel));

        for (const el of targets) applyInlineStyle(el, decl);
      }
    }

    styleEl.remove();
  }
}

function stripUnsafe(svgRoot) {
  const all = [svgRoot, ...svgRoot.querySelectorAll("*")];

  for (const el of all) {
    const tag = String(el.tagName ?? "").toLowerCase();
    if (DISALLOWED_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = String(attr.name ?? "");
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) {
        el.removeAttribute(name);
        continue;
      }

      if (lower === "href" || lower === "xlink:href") {
        if (isExternalHref(attr.value)) el.removeAttribute(name);
      }

      if (EXTERNAL_URL_RE.test(String(attr.value ?? ""))) {
        if (lower === "style") el.setAttribute(name, stripExternalUrls(attr.value));
        else el.removeAttribute(name);
      }
    }
  }
}

function namespaceIdsAndClasses(svgRoot, { assetId }) {
  const safeId = String(assetId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const idPrefix = `asset_${safeId}__`;
  const classPrefix = `asset_${safeId}__`;

  const idMap = new Map();

  const all = [svgRoot, ...svgRoot.querySelectorAll("*")];

  for (const el of all) {
    const id = el.getAttribute("id");
    if (id && !idMap.has(id)) idMap.set(id, `${idPrefix}${id}`);
  }

  for (const el of all) {
    const id = el.getAttribute("id");
    if (id && idMap.has(id)) el.setAttribute("id", idMap.get(id));

    const classAttr = el.getAttribute("class");
    if (classAttr) {
      const next = classAttr
        .split(/\s+/g)
        .filter(Boolean)
        .map((token) => `${classPrefix}${token}`)
        .join(" ");
      if (next) el.setAttribute("class", next);
      else el.removeAttribute("class");
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      let value = attr.value;

      if (name === "href" || name === "xlink:href") {
        const v = String(value ?? "");
        if (v.startsWith("#")) {
          const ref = v.slice(1);
          if (idMap.has(ref)) el.setAttribute(name, `#${idMap.get(ref)}`);
        }
      }

      if (typeof value === "string") {
        for (const [oldId, newId] of idMap.entries()) {
          value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        }
        if (value !== attr.value) el.setAttribute(name, value);
      }
    }
  }

  return { idMap };
}

function deriveViewBox(svgRoot) {
  const viewBox = svgRoot.getAttribute("viewBox");
  if (viewBox && viewBox.trim()) return viewBox.trim();

  const wRaw = svgRoot.getAttribute("width");
  const hRaw = svgRoot.getAttribute("height");
  const w = Number.parseFloat(String(wRaw ?? ""));
  const h = Number.parseFloat(String(hRaw ?? ""));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `0 0 ${w} ${h}`;
  return "0 0 100 100";
}

function nameFromFileName(fileName, fallback) {
  const raw = String(fileName ?? "").trim();
  if (!raw) return fallback;
  const base = raw.split(/[\\/]/g).pop() ?? raw;
  return base.replace(/\.svg$/i, "") || fallback;
}

export function parseSvgTextToAsset(svgText, { fileName } = {}) {
  const parsed = new DOMParser().parseFromString(String(svgText ?? ""), "image/svg+xml");
  const parseError = parsed.querySelector("parsererror");
  if (parseError) throw new Error("SVG 解析失败（文件内容不是合法 SVG）");

  const svgRoot = parsed.documentElement;
  if (!svgRoot || String(svgRoot.tagName).toLowerCase() !== "svg") {
    throw new Error("SVG 解析失败（缺少 <svg> 根节点）");
  }

  const assetId = createId("asset");
  stripUnsafe(svgRoot);
  inlineStyleElements(svgRoot);
  namespaceIdsAndClasses(svgRoot, { assetId });

  const viewBox = deriveViewBox(svgRoot);
  const innerMarkup = svgRoot.innerHTML;

  return createAsset({
    id: assetId,
    name: nameFromFileName(fileName, assetId),
    viewBox,
    innerMarkup,
    meta: { sourceFileName: String(fileName ?? "") }
  });
}
