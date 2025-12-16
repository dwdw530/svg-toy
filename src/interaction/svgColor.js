const EXCLUDED_ANCESTOR_TAGS = new Set([
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "filter",
  "metadata",
  "title",
  "desc"
]);

function isSolidColorLiteral(value) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
  return /^(rgb|rgba|hsl|hsla)\(/i.test(v);
}

function isConvertiblePaint(value) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  if (lower === "none") return false;
  if (lower === "transparent") return false;
  if (lower === "currentcolor") return false;
  if (lower === "inherit") return false;
  if (lower.startsWith("url(")) return false;
  if (lower.startsWith("var(")) return false;
  return isSolidColorLiteral(v);
}

function isInsideExcludedAncestor(el) {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const tag = String(cur.tagName ?? "").toLowerCase();
    if (EXCLUDED_ANCESTOR_TAGS.has(tag)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function normalizeInlineStyle(styleText) {
  const raw = String(styleText ?? "");
  const parts = raw.split(";");
  if (!parts.length) return { next: raw, replacedCount: 0 };

  let replacedCount = 0;
  const out = [];

  for (const part of parts) {
    const chunk = String(part ?? "").trim();
    if (!chunk) continue;
    const idx = chunk.indexOf(":");
    if (idx < 0) {
      out.push(chunk);
      continue;
    }

    const prop = chunk.slice(0, idx).trim().toLowerCase();
    let value = chunk.slice(idx + 1).trim();
    if (!value) continue;

    let important = "";
    if (/\!important\s*$/i.test(value)) {
      value = value.replace(/\!important\s*$/i, "").trim();
      important = " !important";
    }

    if ((prop === "fill" || prop === "stroke") && isConvertiblePaint(value)) {
      value = "currentColor";
      replacedCount += 1;
    }

    out.push(`${prop}:${value}${important}`);
  }

  return { next: out.join(";"), replacedCount };
}

export function normalizeSvgInnerMarkupToCurrentColor(innerMarkup) {
  const input = String(innerMarkup ?? "");
  if (!input.trim()) return { innerMarkup: input, replacedCount: 0 };

  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${input}</svg>`;
  const parsed = new DOMParser().parseFromString(wrapped, "image/svg+xml");
  const parseError = parsed.querySelector("parsererror");
  if (parseError) throw new Error("SVG 解析失败（内容不是合法 XML）");

  const svgRoot = parsed.documentElement;
  if (!svgRoot || String(svgRoot.tagName ?? "").toLowerCase() !== "svg") {
    throw new Error("SVG 解析失败（缺少 <svg> 根节点）");
  }

  const all = Array.from(svgRoot.querySelectorAll("*"));
  let replacedCount = 0;

  for (const el of all) {
    if (!(el instanceof Element)) continue;
    if (isInsideExcludedAncestor(el)) continue;

    const fill = el.getAttribute("fill");
    if (fill !== null && isConvertiblePaint(fill)) {
      el.setAttribute("fill", "currentColor");
      replacedCount += 1;
    }

    const stroke = el.getAttribute("stroke");
    if (stroke !== null && isConvertiblePaint(stroke)) {
      el.setAttribute("stroke", "currentColor");
      replacedCount += 1;
    }

    const style = el.getAttribute("style");
    if (style) {
      const { next, replacedCount: replacedInStyle } = normalizeInlineStyle(style);
      if (replacedInStyle > 0) {
        replacedCount += replacedInStyle;
        if (next.trim()) el.setAttribute("style", next);
        else el.removeAttribute("style");
      }
    }
  }

  if (replacedCount === 0) return { innerMarkup: input, replacedCount };
  return { innerMarkup: svgRoot.innerHTML, replacedCount };
}

