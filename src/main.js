import { createEmptyDocument } from "./model/document.js";
import {
  addNode,
  clearSelection,
  deleteSelectedNodes,
  resetCanvas,
  setSelection,
  setSettings,
  setViewBox,
  scaleSelectedNodes,
  upsertAssets,
  updateNodeData,
  updateNodeStyle,
  updateNodeTransform
} from "./model/commands.js";
import { createCircleNode, createRectNode, createTextNode, createUseNode, makeStyle } from "./model/factories.js";
import { clamp, formatViewBox, parseViewBoxString } from "./model/parsers.js";
import { clientToSvgPoint, zoomViewBoxAtPoint } from "./interaction/viewport.js";
import { parseSvgTextToAsset } from "./interaction/svgImport.js";
import { renderAssetsToDefs, renderSceneNodes } from "./render/render.js";
import { serializeDocumentToSvgString } from "./render/serialize.js";

const svg = document.getElementById("svgCanvas");
const scene = document.getElementById("scene");
const assetDefs = document.getElementById("assetDefs");

const btnAddRect = document.getElementById("btnAddRect");
const btnAddCircle = document.getElementById("btnAddCircle");
const btnAddText = document.getElementById("btnAddText");
const btnExportSvg = document.getElementById("btnExportSvg");
const btnReset = document.getElementById("btnReset");

const btnImportSvg = document.getElementById("btnImportSvg");
const btnClearPlacement = document.getElementById("btnClearPlacement");
const fileImportSvg = document.getElementById("fileImportSvg");
const placementSizeInput = document.getElementById("placementSize");
const assetSelectedInfo = document.getElementById("assetSelectedInfo");
const assetList = document.getElementById("assetList");

const selectedInfo = document.getElementById("selectedInfo");
const posXInput = document.getElementById("posX");
const posYInput = document.getElementById("posY");
const fillInput = document.getElementById("fill");
const strokeInput = document.getElementById("stroke");
const strokeWidthInput = document.getElementById("strokeWidth");
const opacityInput = document.getElementById("opacity");
const textValueInput = document.getElementById("textValue");
const textFontSizeInput = document.getElementById("textFontSize");
const exportPreview = document.getElementById("exportPreview");

const app = {
  doc: createEmptyDocument(),
  dragging: null,
  panning: null,
  spaceDown: false,
  activeAssetId: null,
  history: {
    past: [],
    future: [],
    limit: 200
  },
  renderCache: {
    assetsRef: null,
    activeAssetId: null
  }
};

function pushHistorySnapshot(doc) {
  app.history.past.push(doc);
  if (app.history.past.length > app.history.limit) app.history.past.shift();
  app.history.future.length = 0;
}

function normalizeUiStateAfterDocChange() {
  if (app.activeAssetId && !app.doc.assets?.[app.activeAssetId]) app.activeAssetId = null;
}

function commit(nextDoc, { recordHistory = true } = {}) {
  if (nextDoc === app.doc) return;
  if (recordHistory) pushHistorySnapshot(app.doc);
  app.doc = nextDoc;
  normalizeUiStateAfterDocChange();
  render();
}

function currentStyleFromInspector() {
  return makeStyle({
    fill: fillInput.value,
    stroke: strokeInput.value,
    strokeWidth: Number(strokeWidthInput.value || 0),
    opacity: clamp(Number(opacityInput.value || 1), 0, 1)
  });
}

function centerPoint(viewBox) {
  return { x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 };
}

function addRect() {
  const { x, y } = centerPoint(app.doc.viewBox);
  const node = createRectNode({
    x: x - 80,
    y: y - 50,
    width: 160,
    height: 100,
    rx: 14,
    style: currentStyleFromInspector()
  });
  commit(addNode(app.doc, node));
}

function addCircle() {
  const { x, y } = centerPoint(app.doc.viewBox);
  const node = createCircleNode({
    x,
    y,
    r: 60,
    style: currentStyleFromInspector()
  });
  commit(addNode(app.doc, node));
}

function addText() {
  const { x, y } = centerPoint(app.doc.viewBox);
  const content = textValueInput.value?.trim() ? textValueInput.value.trim() : "Hello SVG";
  const fontSizeRaw = Number(textFontSizeInput?.value || 42);
  const fontSize = Number.isFinite(fontSizeRaw) && fontSizeRaw > 0 ? fontSizeRaw : 42;
  const node = createTextNode({
    x,
    y,
    content,
    fontSize,
    style: {
      fill: fillInput.value,
      opacity: clamp(Number(opacityInput.value || 1), 0, 1)
    }
  });
  commit(addNode(app.doc, node));
}

function resetAll() {
  const ok = window.confirm("确认重置？会清空画布元素并重置视图（资产库保留）。");
  if (!ok) return;
  commit(resetCanvas(app.doc, { keepAssets: true }));
}

function downloadSvg() {
  const data = serializeDocumentToSvgString(app.doc);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drawing-${new Date().toISOString().replace(/[:.]/g, "-")}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getSelectedNodeId(doc) {
  return doc.selection.nodeIds[0] ?? null;
}

function getSelectedNode(doc) {
  const id = getSelectedNodeId(doc);
  if (!id) return null;
  return doc.nodes.find((n) => n.id === id) ?? null;
}

function normalizeColor(value) {
  const v = String(value).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}

function setPositionEnabled(enabled) {
  posXInput.disabled = !enabled;
  posYInput.disabled = !enabled;
}

function syncInspectorFromSelection() {
  const node = getSelectedNode(app.doc);
  if (!node) {
    selectedInfo.textContent = "（无）";
    posXInput.value = "";
    posYInput.value = "";
    textValueInput.value = "";
    textValueInput.disabled = true;
    if (textFontSizeInput) {
      textFontSizeInput.value = "";
      textFontSizeInput.disabled = true;
    }
    setPositionEnabled(false);
    return;
  }

  selectedInfo.textContent = `${node.type} · ${node.id}`;
  posXInput.value = String(Math.round(node.transform.x));
  posYInput.value = String(Math.round(node.transform.y));

  fillInput.value = normalizeColor(node.style.fill ?? "#4f8cff");
  strokeInput.value = normalizeColor(node.style.stroke ?? "#e6e8ff");
  strokeWidthInput.value = String(Number(node.style.strokeWidth ?? 2));
  opacityInput.value = String(Number(node.style.opacity ?? 1));

  if (node.type === "text") {
    textValueInput.disabled = false;
    textValueInput.value = String(node.data.content ?? "");
    if (textFontSizeInput) {
      textFontSizeInput.disabled = false;
      textFontSizeInput.value = String(Number(node.data.fontSize ?? 42));
    }
  } else {
    textValueInput.disabled = true;
    textValueInput.value = "";
    if (textFontSizeInput) {
      textFontSizeInput.value = "";
      textFontSizeInput.disabled = true;
    }
  }

  setPositionEnabled(true);
}

function isTypingTarget(target) {
  return (
    (target instanceof HTMLInputElement && !target.readOnly && !target.disabled) ||
    (target instanceof HTMLTextAreaElement && !target.readOnly && !target.disabled) ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function syncPlacementInfo() {
  if (!assetSelectedInfo) return;
  const asset = app.activeAssetId ? app.doc.assets[app.activeAssetId] : null;
  assetSelectedInfo.textContent = asset ? `${asset.name}` : "（未选择）";
}

function mergeHistoryDoc(nextDoc, currentDoc) {
  return {
    ...nextDoc,
    viewBox: { ...currentDoc.viewBox },
    selection: { nodeIds: [] }
  };
}

function undo() {
  if (app.dragging || app.panning) return;
  const prev = app.history.past.pop();
  if (!prev) return;
  app.history.future.push(app.doc);
  commit(mergeHistoryDoc(prev, app.doc), { recordHistory: false });
}

function redo() {
  if (app.dragging || app.panning) return;
  const next = app.history.future.pop();
  if (!next) return;
  app.history.past.push(app.doc);
  if (app.history.past.length > app.history.limit) app.history.past.shift();
  commit(mergeHistoryDoc(next, app.doc), { recordHistory: false });
}

function renderAssetList() {
  if (!assetList) return;

  assetList.textContent = "";
  const assets = Object.values(app.doc.assets ?? {});

  if (!assets.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "（空）";
    assetList.appendChild(empty);
    return;
  }

  for (const asset of assets) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "asset-item";
    if (app.activeAssetId === asset.id) item.classList.add("active");
    item.dataset.assetId = asset.id;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "asset-thumb";
    const thumbSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    thumbSvg.setAttribute("viewBox", asset.viewBox);
    thumbSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    thumbSvg.innerHTML = asset.innerMarkup;
    thumbWrap.appendChild(thumbSvg);

    const meta = document.createElement("div");
    meta.className = "asset-meta";

    const nameEl = document.createElement("div");
    nameEl.className = "asset-name";
    nameEl.textContent = asset.name;

    const subEl = document.createElement("div");
    subEl.className = "asset-sub";
    subEl.textContent = asset.meta?.sourceFileName ? String(asset.meta.sourceFileName) : asset.viewBox;

    meta.appendChild(nameEl);
    meta.appendChild(subEl);

    item.appendChild(thumbWrap);
    item.appendChild(meta);

    assetList.appendChild(item);
  }
}

function render() {
  svg.setAttribute("viewBox", formatViewBox(app.doc.viewBox));
  renderSceneNodes(app.doc.nodes, app.doc.selection.nodeIds, scene);
  syncInspectorFromSelection();

  if (placementSizeInput && document.activeElement !== placementSizeInput) {
    placementSizeInput.value = String(Number(app.doc.settings?.placementSize ?? 128));
  }

  const assetsChanged = app.renderCache.assetsRef !== app.doc.assets;
  const activeAssetChanged = app.renderCache.activeAssetId !== app.activeAssetId;

  if (assetsChanged) {
    renderAssetsToDefs(app.doc.assets, assetDefs);
    renderAssetList();
    app.renderCache.assetsRef = app.doc.assets;
  } else if (activeAssetChanged) {
    renderAssetList();
  }

  syncPlacementInfo();
  app.renderCache.activeAssetId = app.activeAssetId;
  exportPreview.value = serializeDocumentToSvgString(app.doc);
}

function selectNode(nodeId) {
  const id = String(nodeId ?? "");
  if (!id) return;
  if (app.doc.selection.nodeIds[0] === id && app.doc.selection.nodeIds.length === 1) return;
  commit(setSelection(app.doc, [id]), { recordHistory: false });
}

function clearSelectionIfAny() {
  if (!app.doc.selection.nodeIds.length) return;
  commit(clearSelection(app.doc), { recordHistory: false });
}

function startPan(pointerId, clientX, clientY) {
  const startSvg = clientToSvgPoint(svg, clientX, clientY);
  app.panning = { pointerId, startSvg, startViewBox: { ...app.doc.viewBox } };
}

function updatePan(clientX, clientY) {
  if (!app.panning) return;
  const p = clientToSvgPoint(svg, clientX, clientY);
  const dx = p.x - app.panning.startSvg.x;
  const dy = p.y - app.panning.startSvg.y;
  const vb0 = app.panning.startViewBox;
  commit(setViewBox(app.doc, { x: vb0.x - dx, y: vb0.y - dy, w: vb0.w, h: vb0.h }), { recordHistory: false });
}

function stopPan(pointerId) {
  if (!app.panning) return;
  if (app.panning.pointerId !== pointerId) return;
  app.panning = null;
}

function startDrag(nodeId, pointerId, clientX, clientY) {
  const node = app.doc.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const p = clientToSvgPoint(svg, clientX, clientY);
  app.dragging = {
    pointerId,
    nodeId,
    offset: { x: p.x - node.transform.x, y: p.y - node.transform.y },
    historyRecorded: false
  };
}

function updateDrag(clientX, clientY) {
  if (!app.dragging) return;
  if (!app.dragging.historyRecorded) {
    pushHistorySnapshot(app.doc);
    app.dragging.historyRecorded = true;
  }
  const p = clientToSvgPoint(svg, clientX, clientY);
  const nextX = p.x - app.dragging.offset.x;
  const nextY = p.y - app.dragging.offset.y;
  commit(updateNodeTransform(app.doc, app.dragging.nodeId, { x: nextX, y: nextY }), { recordHistory: false });
}

function stopDrag(pointerId) {
  if (!app.dragging) return;
  if (app.dragging.pointerId !== pointerId) return;
  app.dragging = null;
}

function pickNodeIdFromEventTarget(target) {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-node-id]");
  return el?.getAttribute("data-node-id") ?? null;
}

function placeActiveAssetAt(clientX, clientY) {
  const assetId = app.activeAssetId;
  if (!assetId) return;

  const asset = app.doc.assets[assetId];
  if (!asset) {
    app.activeAssetId = null;
    render();
    return;
  }

  const p = clientToSvgPoint(svg, clientX, clientY);
  const vb = parseViewBoxString(asset.viewBox) ?? { x: 0, y: 0, w: 100, h: 100 };

  const placementSize = Number(app.doc.settings.placementSize) || 128;
  const longest = Math.max(vb.w, vb.h);
  const scale = longest > 0 ? placementSize / longest : 1;
  const width = vb.w * scale;
  const height = vb.h * scale;

  const node = createUseNode({
    assetId: asset.id,
    x: p.x - width / 2,
    y: p.y - height / 2,
    width,
    height,
    style: currentStyleFromInspector()
  });

  commit(addNode(app.doc, node));
}

btnAddRect.addEventListener("click", addRect);
btnAddCircle.addEventListener("click", addCircle);
btnAddText.addEventListener("click", addText);
btnExportSvg.addEventListener("click", downloadSvg);
btnReset.addEventListener("click", resetAll);

btnImportSvg?.addEventListener("click", () => fileImportSvg?.click());
btnClearPlacement?.addEventListener("click", () => {
  app.activeAssetId = null;
  render();
});

assetList?.addEventListener("click", (e) => {
  const btn = e.target instanceof Element ? e.target.closest("[data-asset-id]") : null;
  const id = btn?.getAttribute("data-asset-id");
  if (!id) return;
  app.activeAssetId = app.activeAssetId === id ? null : id;
  render();
});

fileImportSvg?.addEventListener("change", async () => {
  const files = Array.from(fileImportSvg.files ?? []);
  fileImportSvg.value = "";
  if (!files.length) return;

  const imported = [];
  const errors = [];

  for (const file of files) {
    try {
      const text = await file.text();
      imported.push(parseSvgTextToAsset(text, { fileName: file.name }));
    } catch (err) {
      errors.push(`${file.name}: ${String(err?.message ?? err)}`);
    }
  }

  if (imported.length) {
    if (!app.activeAssetId) app.activeAssetId = imported[0].id;
    commit(upsertAssets(app.doc, imported));
  }

  if (errors.length) {
    window.alert(["部分 SVG 导入失败：", ...errors].join("\n"));
  }
});

placementSizeInput?.addEventListener("input", () => {
  const nextSize = clamp(Number(placementSizeInput.value || 128), 8, 4096);
  commit(setSettings(app.doc, { placementSize: nextSize }));
});

posXInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeTransform(app.doc, nodeId, { x: Number(posXInput.value || 0) }));
});

posYInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeTransform(app.doc, nodeId, { y: Number(posYInput.value || 0) }));
});

fillInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeStyle(app.doc, nodeId, { fill: fillInput.value }));
});

strokeInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeStyle(app.doc, nodeId, { stroke: strokeInput.value }));
});

strokeWidthInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeStyle(app.doc, nodeId, { strokeWidth: Number(strokeWidthInput.value || 0) }));
});

opacityInput.addEventListener("input", () => {
  const nodeId = getSelectedNodeId(app.doc);
  if (!nodeId) return;
  commit(updateNodeStyle(app.doc, nodeId, { opacity: clamp(Number(opacityInput.value || 1), 0, 1) }));
});

textValueInput.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node || node.type !== "text") return;
  commit(updateNodeData(app.doc, node.id, { content: textValueInput.value }));
});

textFontSizeInput?.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node || node.type !== "text") return;
  if (textFontSizeInput.value === "") return;
  const nextSize = clamp(Number(textFontSizeInput.value || 42), 1, 4096);
  commit(updateNodeData(app.doc, node.id, { fontSize: nextSize }));
});

svg.addEventListener("contextmenu", (e) => e.preventDefault());

svg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const hasSelection = (app.doc.selection.nodeIds?.length ?? 0) > 0;
    if (hasSelection && e.shiftKey) {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      commit(scaleSelectedNodes(app.doc, factor));
      return;
    }

    const zoomFactor = e.deltaY > 0 ? 0.88 : 1.12;
    const p = clientToSvgPoint(svg, e.clientX, e.clientY);
    const next = zoomViewBoxAtPoint(app.doc.viewBox, p, zoomFactor);
    commit(setViewBox(app.doc, next), { recordHistory: false });
  },
  { passive: false }
);

svg.addEventListener("pointerdown", (e) => {
  const isPrimary = e.isPrimary !== false;
  if (!isPrimary) return;
  if (e.button !== 0) return;

  const nodeId = pickNodeIdFromEventTarget(e.target);

  if (!nodeId && !app.spaceDown && app.activeAssetId) {
    placeActiveAssetAt(e.clientX, e.clientY);
    return;
  }

  if (app.spaceDown || !nodeId) {
    clearSelectionIfAny();
    startPan(e.pointerId, e.clientX, e.clientY);
    svg.setPointerCapture(e.pointerId);
    return;
  }

  selectNode(nodeId);
  startDrag(nodeId, e.pointerId, e.clientX, e.clientY);
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener("pointermove", (e) => {
  if (app.panning) updatePan(e.clientX, e.clientY);
  if (app.dragging) updateDrag(e.clientX, e.clientY);
});

svg.addEventListener("pointerup", (e) => {
  stopPan(e.pointerId);
  stopDrag(e.pointerId);
});

svg.addEventListener("pointercancel", (e) => {
  stopPan(e.pointerId);
  stopDrag(e.pointerId);
});

window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;

  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    const key = String(e.key || "").toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
      return;
    }
  }

  if (e.code === "Space") {
    e.preventDefault();
    app.spaceDown = true;
    return;
  }
  if (e.code === "Escape") {
    clearSelectionIfAny();
    return;
  }
  if (e.code === "Delete" || e.code === "Backspace") {
    commit(deleteSelectedNodes(app.doc));
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") app.spaceDown = false;
});

render();
