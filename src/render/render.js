import { clearChildren, svgEl } from "./svg.js";

function applyStyleAttrs(el, style) {
  if (!style) return;
  if (style.fill !== undefined) el.setAttribute("fill", String(style.fill));
  if (style.stroke !== undefined) el.setAttribute("stroke", String(style.stroke));
  if (style.strokeWidth !== undefined) el.setAttribute("stroke-width", String(style.strokeWidth));
  if (style.opacity !== undefined) el.setAttribute("opacity", String(style.opacity));
}

export function renderAssetsToDefs(assetsById, defsEl) {
  clearChildren(defsEl);
  for (const asset of Object.values(assetsById ?? {})) {
    const symbol = svgEl("symbol", {
      id: asset.id,
      viewBox: asset.viewBox,
      "data-name": asset.name,
      "data-source": asset.meta?.sourceFileName
    });
    symbol.innerHTML = asset.innerMarkup;
    defsEl.appendChild(symbol);
  }
}

function renderRectNode(node, { forExport }) {
  const el = svgEl("rect", {
    x: node.transform.x,
    y: node.transform.y,
    width: node.data.width,
    height: node.data.height,
    rx: node.data.rx
  });
  applyStyleAttrs(el, node.style);
  if (!forExport) {
    el.classList.add("shape");
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
  }
  return el;
}

function renderCircleNode(node, { forExport }) {
  const el = svgEl("circle", {
    cx: node.transform.x,
    cy: node.transform.y,
    r: node.data.r
  });
  applyStyleAttrs(el, node.style);
  if (!forExport) {
    el.classList.add("shape");
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
  }
  return el;
}

function renderTextNode(node, { forExport }) {
  const el = svgEl("text", {
    x: node.transform.x,
    y: node.transform.y,
    "font-size": node.data.fontSize,
    "font-family": node.data.fontFamily,
    "dominant-baseline": node.data.dominantBaseline ?? "middle",
    "text-anchor": node.data.textAnchor ?? "middle"
  });
  applyStyleAttrs(el, node.style);
  el.textContent = node.data.content ?? "";
  if (!forExport) {
    el.classList.add("shape");
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
  }
  return el;
}

function renderUseNode(node, { forExport }) {
  const el = svgEl("use", {
    href: `#${node.data.assetId}`,
    x: node.transform.x,
    y: node.transform.y,
    width: node.data.width,
    height: node.data.height
  });
  applyStyleAttrs(el, node.style);
  const color = node.style?.fill && node.style.fill !== "none" ? node.style.fill : node.style?.stroke;
  if (color && color !== "none") el.setAttribute("color", String(color));
  if (!forExport) {
    el.classList.add("shape");
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    el.dataset.assetId = node.data.assetId;
  }
  return el;
}

export function renderSceneNodes(nodes, selectionNodeIds, sceneEl, { forExport = false } = {}) {
  clearChildren(sceneEl);
  const sel = new Set(selectionNodeIds ?? []);
  for (const node of nodes ?? []) {
    let el;
    if (node.type === "rect") el = renderRectNode(node, { forExport });
    else if (node.type === "circle") el = renderCircleNode(node, { forExport });
    else if (node.type === "text") el = renderTextNode(node, { forExport });
    else if (node.type === "use") el = renderUseNode(node, { forExport });
    else continue;

    if (!forExport && sel.has(node.id)) el.classList.add("selected");
    sceneEl.appendChild(el);
  }
}
