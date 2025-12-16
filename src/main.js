import { createEmptyDocument } from "./model/document.js";
import {
  addNode,
  clearSelection,
  archiveAssets,
  deleteAssets,
  deleteSelectedNodes,
  purgeUnusedArchivedAssets,
  renameAsset,
  resetCanvas,
  setSelection,
  setSettings,
  setViewBox,
  scaleSelectedNodes,
  scaleSelectedNodesAsGroup,
  upsertAssets,
  updateNodeData,
  updateNodeStyle,
  updateNodeTransform
} from "./model/commands.js";
import { createCircleNode, createRectNode, createTextNode, createUseNode, makeStyle } from "./model/factories.js";
import { clamp, formatViewBox, parseViewBoxString } from "./model/parsers.js";
import { clientToSvgPoint, zoomViewBoxAtPoint } from "./interaction/viewport.js";
import { parseSvgTextToAsset } from "./interaction/svgImport.js";
import { normalizeSvgInnerMarkupToCurrentColor } from "./interaction/svgColor.js";
import { renderAssetsToDefs, renderSceneNodes } from "./render/render.js";
import { serializeAssetsToSpriteString, serializeAssetsToManifest, serializeSingleAssetToSvgString, serializeDocumentToSvgString } from "./render/serialize.js";

const svg = document.getElementById("svgCanvas");
const scene = document.getElementById("scene");
const assetDefs = document.getElementById("assetDefs");

const btnAddRect = document.getElementById("btnAddRect");
const btnAddCircle = document.getElementById("btnAddCircle");
const btnAddText = document.getElementById("btnAddText");
const btnExportSvg = document.getElementById("btnExportSvg");
const btnExportSprite = document.getElementById("btnExportSprite");
const btnReset = document.getElementById("btnReset");

const btnImportSvg = document.getElementById("btnImportSvg");
const btnRenameAsset = document.getElementById("btnRenameAsset");
const btnAssetCurrentColor = document.getElementById("btnAssetCurrentColor");
const btnAllAssetsCurrentColor = document.getElementById("btnAllAssetsCurrentColor");
const btnDeleteAsset = document.getElementById("btnDeleteAsset");
const btnClearAssets = document.getElementById("btnClearAssets");
const btnClearPlacement = document.getElementById("btnClearPlacement");
const btnExportAssetPack = document.getElementById("btnExportAssetPack");
const btnExportSingleAsset = document.getElementById("btnExportSingleAsset");
const fileImportSvg = document.getElementById("fileImportSvg");
const placementSizeInput = document.getElementById("placementSize");
const assetSelectedInfo = document.getElementById("assetSelectedInfo");
const assetSearchInput = document.getElementById("assetSearch");
const assetList = document.getElementById("assetList");

// 面板收起/展开
const assetsPanel = document.getElementById("assetsPanel");
const inspectorPanel = document.getElementById("inspectorPanel");
const btnCollapseAssets = document.getElementById("btnCollapseAssets");
const btnCollapseInspector = document.getElementById("btnCollapseInspector");

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
  assetSearch: "",
  history: {
    past: [],
    future: [],
    limit: 200,
    merge: {
      // 输入框/滑杆等高频操作的“撤销合并”状态：避免一敲一个历史点
      key: null,
      baseDoc: null,
      timerId: null
    }
  },
  renderCache: {
    assetsRef: null,
    activeAssetId: null,
    assetSearch: ""
  }
};

function pushHistorySnapshot(doc) {
  app.history.past.push(doc);
  if (app.history.past.length > app.history.limit) app.history.past.shift();
  app.history.future.length = 0;
}

function clearMergedHistoryTimer() {
  const merge = app.history.merge;
  if (!merge?.timerId) return;
  window.clearTimeout(merge.timerId);
  merge.timerId = null;
}

function flushMergedHistory() {
  // 把“合并期”里记录的 baseDoc 入栈一次，形成单条撤销记录
  const merge = app.history.merge;
  if (!merge?.baseDoc) return;
  clearMergedHistoryTimer();

  const base = merge.baseDoc;
  merge.baseDoc = null;
  merge.key = null;

  if (base !== app.doc) pushHistorySnapshot(base);
}

function commitMerged(nextDoc, { key, delayMs = 450 } = {}) {
  // 合并输入：实时预览（recordHistory: false），但最终只生成 1 条撤销记录
  if (!key) throw new Error("commitMerged 需要 key");
  if (nextDoc === app.doc) return;

  const merge = app.history.merge;
  if (!merge) return commit(nextDoc);

  if (merge.baseDoc && merge.key !== key) flushMergedHistory();

  if (!merge.baseDoc) {
    merge.baseDoc = app.doc;
    app.history.future.length = 0;
  }

  merge.key = key;
  commit(nextDoc, { recordHistory: false });

  clearMergedHistoryTimer();
  merge.timerId = window.setTimeout(() => flushMergedHistory(), delayMs);
}

function normalizeUiStateAfterDocChange() {
  if (!app.activeAssetId) return;
  const asset = app.doc.assets?.[app.activeAssetId];
  if (!asset || asset.archived) app.activeAssetId = null;
}

function commit(nextDoc, { recordHistory = true } = {}) {
  if (recordHistory) flushMergedHistory();
  const docToCommit = recordHistory ? purgeUnusedArchivedAssets(nextDoc) : nextDoc;
  if (docToCommit === app.doc) return;
  if (recordHistory) pushHistorySnapshot(app.doc);
  app.doc = docToCommit;
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

function downloadSprite() {
  const assets = Object.fromEntries(
    Object.entries(app.doc.assets ?? {}).filter(([, asset]) => !asset?.archived)
  );
  const count = Object.keys(assets).length;
  if (!count) {
    window.alert("资产库是空的，没啥可导出 Sprite。");
    return;
  }

  const data = serializeAssetsToSpriteString(assets);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sprite-${new Date().toISOString().replace(/[:.]/g, "-")}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadAssetPack() {
  const assets = Object.fromEntries(
    Object.entries(app.doc.assets ?? {}).filter(([, asset]) => !asset?.archived)
  );
  const count = Object.keys(assets).length;
  if (!count) {
    window.alert("资产库是空的，没啥可导出资产包。");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // 下载 sprite.svg
  const spriteData = serializeAssetsToSpriteString(assets);
  const spriteBlob = new Blob([spriteData], { type: "image/svg+xml;charset=utf-8" });
  const spriteUrl = URL.createObjectURL(spriteBlob);
  const spriteLink = document.createElement("a");
  spriteLink.href = spriteUrl;
  spriteLink.download = `sprite-${timestamp}.svg`;
  document.body.appendChild(spriteLink);
  spriteLink.click();
  spriteLink.remove();
  URL.revokeObjectURL(spriteUrl);

  // 下载 manifest.json
  const manifest = serializeAssetsToManifest(assets);
  const manifestData = JSON.stringify(manifest, null, 2);
  const manifestBlob = new Blob([manifestData], { type: "application/json;charset=utf-8" });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  const manifestLink = document.createElement("a");
  manifestLink.href = manifestUrl;
  manifestLink.download = `manifest-${timestamp}.json`;
  document.body.appendChild(manifestLink);
  manifestLink.click();
  manifestLink.remove();
  URL.revokeObjectURL(manifestUrl);
}

function downloadSingleAsset() {
  const assetId = app.activeAssetId;
  if (!assetId) {
    window.alert("先选一个资产再导出。");
    return;
  }

  const asset = app.doc.assets?.[assetId];
  if (!asset || asset.archived) {
    app.activeAssetId = null;
    render();
    window.alert("资产不存在或已删除。");
    return;
  }

  const data = serializeSingleAssetToSvgString(asset);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = String(asset.name ?? assetId).replace(/[\/:*?"<>|]/g, "_");
  a.download = `${safeName}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function renameActiveAsset() {
  const assetId = app.activeAssetId;
  if (!assetId) {
    window.alert("先选一个资产再重命名。");
    return;
  }

  const asset = app.doc.assets?.[assetId];
  if (!asset || asset.archived) {
    app.activeAssetId = null;
    render();
    return;
  }

  const next = window.prompt("资产名称：", asset.name ?? assetId);
  if (next === null) return;
  commit(renameAsset(app.doc, assetId, next));
}

function normalizeActiveAssetToCurrentColor() {
  const assetId = app.activeAssetId;
  if (!assetId) {
    window.alert("先选一个资产再做 currentColor。");
    return;
  }

  const asset = app.doc.assets?.[assetId];
  if (!asset || asset.archived) {
    app.activeAssetId = null;
    render();
    return;
  }

  try {
    const { innerMarkup, replacedCount } = normalizeSvgInnerMarkupToCurrentColor(asset.innerMarkup);
    if (replacedCount === 0) {
      window.alert("这个资产没找到可替换的纯色 fill/stroke（渐变/多色会跳过）。");
      return;
    }
    commit(upsertAssets(app.doc, [{ ...asset, innerMarkup }]));
    window.alert(`已规范为 currentColor：替换 ${replacedCount} 处（可 Ctrl+Z 撤销）。`);
  } catch (err) {
    window.alert(`currentColor 处理失败：${String(err?.message ?? err)}`);
  }
}

function normalizeAllAssetsToCurrentColor() {
  const assets = Object.values(app.doc.assets ?? {});
  if (!assets.length) {
    window.alert("资产库是空的，没啥可规范 currentColor。");
    return;
  }

  const ok = window.confirm(
    `确认把 ${assets.length} 个资产的“纯色 fill/stroke”规范成 currentColor？\n\n说明：渐变/url()/多色复杂情况会跳过；这是做“可换主题单色图标库”的常用做法。\n\n可 Ctrl+Z 撤销。`
  );
  if (!ok) return;

  const updated = [];
  const errors = [];
  let replacedTotal = 0;

  for (const asset of assets) {
    try {
      const { innerMarkup, replacedCount } = normalizeSvgInnerMarkupToCurrentColor(asset.innerMarkup);
      if (replacedCount === 0) continue;
      replacedTotal += replacedCount;
      updated.push({ ...asset, innerMarkup });
    } catch (err) {
      errors.push(`${asset.name ?? asset.id}: ${String(err?.message ?? err)}`);
    }
  }

  if (!updated.length) {
    window.alert("没找到可替换的纯色 fill/stroke（可能都已经是 currentColor，或都是渐变/多色）。");
    return;
  }

  commit(upsertAssets(app.doc, updated));

  if (errors.length) {
    window.alert(["部分资产规范失败：", ...errors].join("\n"));
  } else {
    window.alert(`已规范为 currentColor：共替换 ${replacedTotal} 处。`);
  }
}

function deleteActiveAsset() {
  const assetId = app.activeAssetId;
  if (!assetId) {
    window.alert("先选一个资产再删除。");
    return;
  }

  const asset = app.doc.assets?.[assetId];
  if (!asset || asset.archived) {
    app.activeAssetId = null;
    render();
    return;
  }

  const instanceCount = app.doc.nodes.filter((n) => n.type === "use" && n.data.assetId === assetId).length;

  if (instanceCount > 0) {
    const ok = window.confirm(
      `确认从资产库移除「${asset.name}」？\n\n画布上的 ${instanceCount} 个实例会保留（仍可选中并 Delete 删除）。`
    );
    if (!ok) return;
    app.activeAssetId = null;
    commit(archiveAssets(app.doc, [assetId]));
    return;
  }

  const ok = window.confirm(`确认删除资产「${asset.name}」？`);
  if (!ok) return;
  app.activeAssetId = null;
  commit(deleteAssets(app.doc, [assetId], { removeInstances: false }));
}

function clearAllAssets() {
  const ids = Object.keys(app.doc.assets ?? {});
  if (!ids.length) {
    window.alert("资产库已经是空的。");
    return;
  }

  const usedIdSet = new Set(
    app.doc.nodes.filter((n) => n.type === "use").map((n) => String(n.data.assetId ?? "")).filter(Boolean)
  );
  const instanceCount = app.doc.nodes.filter((n) => n.type === "use" && usedIdSet.has(String(n.data.assetId ?? ""))).length;

  const toArchive = [];
  const toDelete = [];
  for (const id of ids) {
    const asset = app.doc.assets?.[id];
    if (!asset) continue;
    if (usedIdSet.has(id)) toArchive.push(id);
    else toDelete.push(id);
  }

  const ok = window.confirm(
    `确认清空资产库？\n\n将从资产库移除 ${ids.length} 个资产；画布上的 ${instanceCount} 个实例会保留。\n\n未使用的资产会被彻底删除，仍在使用的资产会被隐藏（实例删掉后会自动清理）。`
  );
  if (!ok) return;

  app.activeAssetId = null;
  app.assetSearch = "";

  let next = app.doc;
  if (toArchive.length) next = archiveAssets(next, toArchive);
  if (toDelete.length) next = deleteAssets(next, toDelete, { removeInstances: false });
  commit(next);
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
  const selectionIds = app.doc.selection?.nodeIds ?? [];

  if (!selectionIds.length) {
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

  if (selectionIds.length > 1) {
    selectedInfo.textContent = `（多选 ${selectionIds.length} 个）`;
    posXInput.value = "";
    posYInput.value = "";
    setPositionEnabled(false);

    textValueInput.disabled = true;
    textValueInput.value = "";
    if (textFontSizeInput) {
      textFontSizeInput.value = "";
      textFontSizeInput.disabled = true;
    }
    return;
  }

  const node = getSelectedNode(app.doc);
  if (!node) return;

  selectedInfo.textContent = `${node.type} · ${node.id}`;
  if (document.activeElement !== posXInput) posXInput.value = String(Math.round(node.transform.x));
  if (document.activeElement !== posYInput) posYInput.value = String(Math.round(node.transform.y));

  if (document.activeElement !== fillInput) fillInput.value = normalizeColor(node.style.fill ?? "#4f8cff");
  if (document.activeElement !== strokeInput) strokeInput.value = normalizeColor(node.style.stroke ?? "#e6e8ff");
  if (document.activeElement !== strokeWidthInput) strokeWidthInput.value = String(Number(node.style.strokeWidth ?? 2));
  if (document.activeElement !== opacityInput) opacityInput.value = String(Number(node.style.opacity ?? 1));

  if (node.type === "text") {
    textValueInput.disabled = false;
    if (document.activeElement !== textValueInput) textValueInput.value = String(node.data.content ?? "");
    if (textFontSizeInput) {
      textFontSizeInput.disabled = false;
      if (document.activeElement !== textFontSizeInput) {
        textFontSizeInput.value = String(Number(node.data.fontSize ?? 42));
      }
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

  const canManageActive = Boolean(asset && !asset.archived);
  const libraryCount = Object.values(app.doc.assets ?? {}).filter((a) => a && !a.archived).length;
  const assetCount = Object.keys(app.doc.assets ?? {}).length;

  if (btnRenameAsset) btnRenameAsset.disabled = !canManageActive;
  if (btnAssetCurrentColor) btnAssetCurrentColor.disabled = !canManageActive;
  if (btnAllAssetsCurrentColor) btnAllAssetsCurrentColor.disabled = assetCount === 0;
  if (btnDeleteAsset) btnDeleteAsset.disabled = !canManageActive;
  if (btnClearAssets) btnClearAssets.disabled = libraryCount === 0;
  if (btnClearPlacement) btnClearPlacement.disabled = !app.activeAssetId;
  if (btnExportAssetPack) btnExportAssetPack.disabled = libraryCount === 0;
  if (btnExportSingleAsset) btnExportSingleAsset.disabled = !canManageActive;
}

function mergeHistoryDoc(nextDoc, currentDoc) {
  return {
    ...nextDoc,
    viewBox: { ...currentDoc.viewBox },
    selection: { nodeIds: [] }
  };
}

function undo() {
  flushMergedHistory();
  if (app.dragging || app.panning) return;
  const prev = app.history.past.pop();
  if (!prev) return;
  app.history.future.push(app.doc);
  commit(mergeHistoryDoc(prev, app.doc), { recordHistory: false });
}

function redo() {
  flushMergedHistory();
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
  const query = String(app.assetSearch ?? "").trim().toLowerCase();
  let assets = Object.values(app.doc.assets ?? {}).filter((asset) => asset && !asset.archived);
  if (query) {
    assets = assets.filter((asset) => {
      const name = String(asset.name ?? "").toLowerCase();
      const fileName = String(asset.meta?.sourceFileName ?? "").toLowerCase();
      return name.includes(query) || fileName.includes(query);
    });
  }

  if (!assets.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = query ? "（无匹配）" : "（空）";
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
  if (assetSearchInput && document.activeElement !== assetSearchInput) {
    assetSearchInput.value = String(app.assetSearch ?? "");
  }

  const assetsChanged = app.renderCache.assetsRef !== app.doc.assets;
  const activeAssetChanged = app.renderCache.activeAssetId !== app.activeAssetId;
  const assetSearchChanged = app.renderCache.assetSearch !== app.assetSearch;

  if (assetsChanged) {
    renderAssetsToDefs(app.doc.assets, assetDefs);
    app.renderCache.assetsRef = app.doc.assets;
  }

  if (assetsChanged || activeAssetChanged || assetSearchChanged) renderAssetList();

  syncPlacementInfo();
  app.renderCache.activeAssetId = app.activeAssetId;
  app.renderCache.assetSearch = app.assetSearch;
  exportPreview.value = serializeDocumentToSvgString(app.doc);

  if (btnExportSprite) {
    const libraryCount = Object.values(app.doc.assets ?? {}).filter((a) => a && !a.archived).length;
    btnExportSprite.disabled = libraryCount === 0;
  }
}

function selectNode(nodeId) {
  const id = String(nodeId ?? "");
  if (!id) return;
  if (app.doc.selection.nodeIds[0] === id && app.doc.selection.nodeIds.length === 1) return;
  commit(setSelection(app.doc, [id]), { recordHistory: false });
}

function toggleNodeSelection(nodeId) {
  const id = String(nodeId ?? "");
  if (!id) return;

  const current = app.doc.selection?.nodeIds ?? [];
  const idx = current.indexOf(id);
  const next = idx >= 0 ? [...current.slice(0, idx), ...current.slice(idx + 1)] : [...current, id];
  commit(setSelection(app.doc, next), { recordHistory: false });
}

function isNodeSelected(nodeId) {
  const id = String(nodeId ?? "");
  if (!id) return false;
  return (app.doc.selection?.nodeIds ?? []).includes(id);
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

function startDrag(anchorNodeId, pointerId, clientX, clientY) {
  flushMergedHistory();

  const ids = app.doc.selection?.nodeIds ?? [];
  if (!ids.length) return;
  const anchorId = String(anchorNodeId ?? "");

  const startSvg = clientToSvgPoint(svg, clientX, clientY);
  const startById = {};

  for (const id of ids) {
    const node = app.doc.nodes.find((n) => n.id === id);
    if (!node) continue;
    startById[id] = { x: Number(node.transform.x ?? 0), y: Number(node.transform.y ?? 0) };
  }

  app.dragging = {
    pointerId,
    anchorNodeId: anchorId,
    selectSingleOnClick: ids.length > 1 && anchorId && ids.includes(anchorId),
    startSvg,
    nodeIds: ids,
    startById,
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
  const dx = p.x - app.dragging.startSvg.x;
  const dy = p.y - app.dragging.startSvg.y;

  let next = app.doc;
  for (const id of app.dragging.nodeIds ?? []) {
    const start = app.dragging.startById?.[id];
    if (!start) continue;
    next = updateNodeTransform(next, id, { x: start.x + dx, y: start.y + dy });
  }

  commit(next, { recordHistory: false });
}

function stopDrag(pointerId, { considerClick = true } = {}) {
  if (!app.dragging) return;
  if (app.dragging.pointerId !== pointerId) return;
  const { anchorNodeId, selectSingleOnClick, historyRecorded } = app.dragging;
  app.dragging = null;

  if (considerClick && selectSingleOnClick && !historyRecorded && anchorNodeId) {
    selectNode(anchorNodeId);
  }
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
btnExportSprite?.addEventListener("click", downloadSprite);
btnReset.addEventListener("click", resetAll);

// 面板收起/展开
btnCollapseAssets?.addEventListener("click", () => {
  const isCollapsed = assetsPanel.classList.toggle("collapsed");
  btnCollapseAssets.textContent = isCollapsed ? "›" : "‹";
  btnCollapseAssets.title = isCollapsed ? "展开资产库" : "收起资产库";
});

btnCollapseInspector?.addEventListener("click", () => {
  const isCollapsed = inspectorPanel.classList.toggle("collapsed");
  btnCollapseInspector.textContent = isCollapsed ? "‹" : "›";
  btnCollapseInspector.title = isCollapsed ? "展开属性面板" : "收起属性面板";
});

btnImportSvg?.addEventListener("click", () => fileImportSvg?.click());
btnExportAssetPack?.addEventListener("click", downloadAssetPack);
btnExportSingleAsset?.addEventListener("click", downloadSingleAsset);
btnRenameAsset?.addEventListener("click", renameActiveAsset);
btnAssetCurrentColor?.addEventListener("click", normalizeActiveAssetToCurrentColor);
btnAllAssetsCurrentColor?.addEventListener("click", normalizeAllAssetsToCurrentColor);
btnDeleteAsset?.addEventListener("click", deleteActiveAsset);
btnClearAssets?.addEventListener("click", clearAllAssets);
btnClearPlacement?.addEventListener("click", () => {
  app.activeAssetId = null;
  render();
});

assetSearchInput?.addEventListener("input", () => {
  app.assetSearch = String(assetSearchInput.value ?? "");
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
  if (!placementSizeInput) return;
  const raw = String(placementSizeInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const nextSize = clamp(Number(placementSizeInput.value || 128), 8, 4096);
  if (app.doc.settings?.placementSize === nextSize) return;
  commitMerged(setSettings(app.doc, { placementSize: nextSize }), { key: "placementSize" });
});

posXInput.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node) return;
  const raw = String(posXInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const x = Math.round(parsed);
  if (node.transform.x === x) return;
  commitMerged(updateNodeTransform(app.doc, node.id, { x }), { key: `posX:${node.id}` });
});

posYInput.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node) return;
  const raw = String(posYInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const y = Math.round(parsed);
  if (node.transform.y === y) return;
  commitMerged(updateNodeTransform(app.doc, node.id, { y }), { key: `posY:${node.id}` });
});

fillInput.addEventListener("input", () => {
  const ids = app.doc.selection?.nodeIds ?? [];
  if (!ids.length) return;
  const next = String(fillInput.value ?? "").trim();
  if (!next) return;

  let changed = false;
  let nextDoc = app.doc;
  for (const id of ids) {
    const node = nextDoc.nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.style.fill === next) continue;
    nextDoc = updateNodeStyle(nextDoc, id, { fill: next });
    changed = true;
  }
  if (!changed) return;

  commitMerged(nextDoc, { key: `fill:${ids.slice().sort().join(",")}` });
});

strokeInput.addEventListener("input", () => {
  const ids = app.doc.selection?.nodeIds ?? [];
  if (!ids.length) return;
  const next = String(strokeInput.value ?? "").trim();
  if (!next) return;

  let changed = false;
  let nextDoc = app.doc;
  for (const id of ids) {
    const node = nextDoc.nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.style.stroke === next) continue;
    nextDoc = updateNodeStyle(nextDoc, id, { stroke: next });
    changed = true;
  }
  if (!changed) return;

  commitMerged(nextDoc, { key: `stroke:${ids.slice().sort().join(",")}` });
});

strokeWidthInput.addEventListener("input", () => {
  const ids = app.doc.selection?.nodeIds ?? [];
  if (!ids.length) return;
  const raw = String(strokeWidthInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const next = Math.max(0, Math.round(parsed));

  let changed = false;
  let nextDoc = app.doc;
  for (const id of ids) {
    const node = nextDoc.nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.style.strokeWidth === next) continue;
    nextDoc = updateNodeStyle(nextDoc, id, { strokeWidth: next });
    changed = true;
  }
  if (!changed) return;

  commitMerged(nextDoc, { key: `strokeWidth:${ids.slice().sort().join(",")}` });
});

opacityInput.addEventListener("input", () => {
  const ids = app.doc.selection?.nodeIds ?? [];
  if (!ids.length) return;
  const raw = String(opacityInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const next = clamp(parsed, 0, 1);

  let changed = false;
  let nextDoc = app.doc;
  for (const id of ids) {
    const node = nextDoc.nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.style.opacity === next) continue;
    nextDoc = updateNodeStyle(nextDoc, id, { opacity: next });
    changed = true;
  }
  if (!changed) return;

  commitMerged(nextDoc, { key: `opacity:${ids.slice().sort().join(",")}` });
});

textValueInput.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node || node.type !== "text") return;
  const next = String(textValueInput.value ?? "");
  if (String(node.data.content ?? "") === next) return;
  commitMerged(updateNodeData(app.doc, node.id, { content: next }), { key: `textValue:${node.id}` });
});

textFontSizeInput?.addEventListener("input", () => {
  const node = getSelectedNode(app.doc);
  if (!node || node.type !== "text") return;
  if (!textFontSizeInput) return;
  const raw = String(textFontSizeInput.value ?? "");
  if (!raw.trim()) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const nextSize = clamp(Math.round(parsed), 1, 4096);
  if (Number(node.data.fontSize ?? 42) === nextSize) return;
  commitMerged(updateNodeData(app.doc, node.id, { fontSize: nextSize }), { key: `textFontSize:${node.id}` });
});

placementSizeInput?.addEventListener("blur", flushMergedHistory);
posXInput.addEventListener("blur", flushMergedHistory);
posYInput.addEventListener("blur", flushMergedHistory);
fillInput.addEventListener("blur", flushMergedHistory);
strokeInput.addEventListener("blur", flushMergedHistory);
strokeWidthInput.addEventListener("blur", flushMergedHistory);
opacityInput.addEventListener("blur", flushMergedHistory);
textValueInput.addEventListener("blur", flushMergedHistory);
textFontSizeInput?.addEventListener("blur", flushMergedHistory);

svg.addEventListener("contextmenu", (e) => e.preventDefault());

svg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const selectionIds = app.doc.selection?.nodeIds ?? [];
    if (selectionIds.length && e.shiftKey) {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const next =
        selectionIds.length > 1
          ? scaleSelectedNodesAsGroup(app.doc, factor)
          : scaleSelectedNodes(app.doc, factor);
      commit(next);
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

  const multiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
  if (nodeId && multiSelect) {
    toggleNodeSelection(nodeId);
    return;
  }

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

  if (!isNodeSelected(nodeId)) selectNode(nodeId);
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
  stopDrag(e.pointerId, { considerClick: false });
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
