function uniqStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function setViewBox(doc, viewBox) {
  return { ...doc, viewBox: { ...viewBox } };
}

export function setSettings(doc, settingsPatch) {
  return { ...doc, settings: { ...doc.settings, ...settingsPatch } };
}

export function setSelection(doc, nodeIds) {
  return { ...doc, selection: { nodeIds: uniqStrings(nodeIds ?? []) } };
}

export function clearSelection(doc) {
  if (!doc.selection.nodeIds.length) return doc;
  return { ...doc, selection: { nodeIds: [] } };
}

export function addNode(doc, node, { select = true } = {}) {
  const nextNodes = [...doc.nodes, node];
  const next = { ...doc, nodes: nextNodes };
  return select ? setSelection(next, [node.id]) : next;
}

export function updateNode(doc, nodeId, updater) {
  const id = String(nodeId ?? "");
  const idx = doc.nodes.findIndex((n) => n.id === id);
  if (idx < 0) return doc;
  const prevNode = doc.nodes[idx];
  const nextNode = updater(prevNode);
  if (!nextNode || nextNode === prevNode) return doc;
  const nextNodes = doc.nodes.slice();
  nextNodes[idx] = nextNode;
  return { ...doc, nodes: nextNodes };
}

export function updateNodeTransform(doc, nodeId, transformPatch) {
  return updateNode(doc, nodeId, (node) => ({
    ...node,
    transform: { ...node.transform, ...transformPatch }
  }));
}

export function updateNodeStyle(doc, nodeId, stylePatch) {
  return updateNode(doc, nodeId, (node) => ({
    ...node,
    style: { ...node.style, ...stylePatch }
  }));
}

export function updateNodeData(doc, nodeId, dataPatch) {
  return updateNode(doc, nodeId, (node) => ({
    ...node,
    data: { ...node.data, ...dataPatch }
  }));
}

export function deleteSelectedNodes(doc) {
  const sel = new Set(doc.selection.nodeIds);
  if (!sel.size) return doc;
  const nextNodes = doc.nodes.filter((n) => !sel.has(n.id));
  return { ...doc, nodes: nextNodes, selection: { nodeIds: [] } };
}

export function resetCanvas(doc, { keepAssets = true } = {}) {
  return {
    ...doc,
    viewBox: { x: 0, y: 0, w: 800, h: 600 },
    assets: keepAssets ? doc.assets : {},
    nodes: [],
    selection: { nodeIds: [] }
  };
}

export function upsertAssets(doc, assets) {
  const nextAssets = { ...doc.assets };
  for (const asset of assets ?? []) {
    nextAssets[asset.id] = asset;
  }
  return { ...doc, assets: nextAssets };
}

export function renameAsset(doc, assetId, nextName) {
  const id = String(assetId ?? "");
  if (!id) return doc;
  const asset = doc.assets?.[id];
  if (!asset) return doc;
  const name = String(nextName ?? "").trim();
  if (!name) return doc;
  if (asset.name === name) return doc;
  return { ...doc, assets: { ...doc.assets, [id]: { ...asset, name } } };
}

export function archiveAssets(doc, assetIds) {
  const ids = uniqStrings(assetIds ?? []);
  if (!ids.length) return doc;

  const nextAssets = { ...doc.assets };
  let changed = false;

  for (const id of ids) {
    const asset = nextAssets[id];
    if (!asset || asset.archived) continue;
    nextAssets[id] = { ...asset, archived: true };
    changed = true;
  }

  return changed ? { ...doc, assets: nextAssets } : doc;
}

export function deleteAssets(doc, assetIds, { removeInstances = true } = {}) {
  const ids = uniqStrings(assetIds ?? []);
  if (!ids.length) return doc;
  const idSet = new Set(ids);

  const nextAssets = { ...doc.assets };
  let removedAny = false;
  for (const id of ids) {
    if (nextAssets[id] !== undefined) {
      delete nextAssets[id];
      removedAny = true;
    }
  }
  if (!removedAny) return doc;

  const nextNodes = removeInstances
    ? doc.nodes.filter((n) => !(n.type === "use" && idSet.has(String(n.data.assetId ?? ""))))
    : doc.nodes;

  const nodeIdSet = new Set(nextNodes.map((n) => n.id));
  const nextSelection = { nodeIds: (doc.selection?.nodeIds ?? []).filter((id) => nodeIdSet.has(id)) };

  return { ...doc, assets: nextAssets, nodes: nextNodes, selection: nextSelection };
}

export function purgeUnusedArchivedAssets(doc) {
  const used = new Set();
  for (const node of doc.nodes ?? []) {
    if (node.type !== "use") continue;
    const assetId = String(node.data?.assetId ?? "");
    if (assetId) used.add(assetId);
  }

  let changed = false;
  const nextAssets = { ...doc.assets };
  for (const [id, asset] of Object.entries(nextAssets)) {
    if (!asset?.archived) continue;
    if (used.has(id)) continue;
    delete nextAssets[id];
    changed = true;
  }

  return changed ? { ...doc, assets: nextAssets } : doc;
}

function scaleNodeInner(node, factor, { minSize, maxSize }) {
  if (!node) return node;
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return node;

  if (node.type === "rect") {
    const w0 = Number(node.data.width);
    const h0 = Number(node.data.height);
    if (!(w0 > 0) || !(h0 > 0)) return node;

    const w1 = clamp(w0 * f, minSize, maxSize);
    const h1 = clamp(h0 * f, minSize, maxSize);

    const cx = Number(node.transform.x) + w0 / 2;
    const cy = Number(node.transform.y) + h0 / 2;
    const x1 = cx - w1 / 2;
    const y1 = cy - h1 / 2;

    const rx0 = Number(node.data.rx);
    const rxLimit = Math.max(0, Math.min(w1, h1) / 2);
    const rx1 = Number.isFinite(rx0) ? clamp(rx0 * f, 0, rxLimit) : node.data.rx;

    return {
      ...node,
      transform: { ...node.transform, x: x1, y: y1 },
      data: { ...node.data, width: w1, height: h1, rx: rx1 }
    };
  }

  if (node.type === "circle") {
    const r0 = Number(node.data.r);
    if (!(r0 > 0)) return node;
    const r1 = clamp(r0 * f, minSize, maxSize);
    return { ...node, data: { ...node.data, r: r1 } };
  }

  if (node.type === "text") {
    const s0 = Number(node.data.fontSize ?? 42);
    const base = Number.isFinite(s0) && s0 > 0 ? s0 : 42;
    const s1 = clamp(base * f, minSize, maxSize);
    return { ...node, data: { ...node.data, fontSize: s1 } };
  }

  if (node.type === "use") {
    const w0 = Number(node.data.width);
    const h0 = Number(node.data.height);
    if (!(w0 > 0) || !(h0 > 0)) return node;

    const w1 = clamp(w0 * f, minSize, maxSize);
    const h1 = clamp(h0 * f, minSize, maxSize);

    const cx = Number(node.transform.x) + w0 / 2;
    const cy = Number(node.transform.y) + h0 / 2;
    const x1 = cx - w1 / 2;
    const y1 = cy - h1 / 2;

    return {
      ...node,
      transform: { ...node.transform, x: x1, y: y1 },
      data: { ...node.data, width: w1, height: h1 }
    };
  }

  return node;
}

export function scaleSelectedNodes(doc, factor, { minSize = 1, maxSize = 4096 } = {}) {
  const ids = doc.selection.nodeIds ?? [];
  if (!ids.length) return doc;

  let next = doc;
  for (const id of ids) {
    next = updateNode(next, id, (node) => scaleNodeInner(node, factor, { minSize, maxSize }));
  }
  return next;
}

function nodeBounds(node) {
  if (!node) return null;

  if (node.type === "rect" || node.type === "use") {
    const x = Number(node.transform?.x ?? 0);
    const y = Number(node.transform?.y ?? 0);
    const w = Number(node.data?.width ?? 0);
    const h = Number(node.data?.height ?? 0);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    if (!(w > 0) || !(h > 0)) return null;
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }

  if (node.type === "circle") {
    const cx = Number(node.transform?.x ?? 0);
    const cy = Number(node.transform?.y ?? 0);
    const r = Number(node.data?.r ?? 0);
    if (![cx, cy, r].every(Number.isFinite)) return null;
    if (!(r > 0)) return null;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }

  if (node.type === "text") {
    const x = Number(node.transform?.x ?? 0);
    const y = Number(node.transform?.y ?? 0);
    const fs = Number(node.data?.fontSize ?? 42);
    const size = Number.isFinite(fs) && fs > 0 ? fs : 42;
    const half = size / 2;
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x - half, minY: y - half, maxX: x + half, maxY: y + half };
  }

  return null;
}

function scaleNodeAboutPoint(node, factor, { cx, cy, minSize, maxSize }) {
  if (!node) return node;
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return node;

  if (node.type === "rect") {
    const x0 = Number(node.transform?.x ?? 0);
    const y0 = Number(node.transform?.y ?? 0);
    const w0 = Number(node.data?.width ?? 0);
    const h0 = Number(node.data?.height ?? 0);
    if (![x0, y0, w0, h0].every(Number.isFinite)) return node;
    if (!(w0 > 0) || !(h0 > 0)) return node;

    const c0x = x0 + w0 / 2;
    const c0y = y0 + h0 / 2;
    const c1x = cx + (c0x - cx) * f;
    const c1y = cy + (c0y - cy) * f;

    const w1 = clamp(w0 * f, minSize, maxSize);
    const h1 = clamp(h0 * f, minSize, maxSize);
    const x1 = c1x - w1 / 2;
    const y1 = c1y - h1 / 2;

    const rx0 = Number(node.data?.rx ?? 0);
    const rxLimit = Math.max(0, Math.min(w1, h1) / 2);
    const rx1 = Number.isFinite(rx0) ? clamp(rx0 * f, 0, rxLimit) : node.data?.rx;

    return {
      ...node,
      transform: { ...node.transform, x: x1, y: y1 },
      data: { ...node.data, width: w1, height: h1, rx: rx1 }
    };
  }

  if (node.type === "use") {
    const x0 = Number(node.transform?.x ?? 0);
    const y0 = Number(node.transform?.y ?? 0);
    const w0 = Number(node.data?.width ?? 0);
    const h0 = Number(node.data?.height ?? 0);
    if (![x0, y0, w0, h0].every(Number.isFinite)) return node;
    if (!(w0 > 0) || !(h0 > 0)) return node;

    const c0x = x0 + w0 / 2;
    const c0y = y0 + h0 / 2;
    const c1x = cx + (c0x - cx) * f;
    const c1y = cy + (c0y - cy) * f;

    const w1 = clamp(w0 * f, minSize, maxSize);
    const h1 = clamp(h0 * f, minSize, maxSize);
    const x1 = c1x - w1 / 2;
    const y1 = c1y - h1 / 2;

    return {
      ...node,
      transform: { ...node.transform, x: x1, y: y1 },
      data: { ...node.data, width: w1, height: h1 }
    };
  }

  if (node.type === "circle") {
    const x0 = Number(node.transform?.x ?? 0);
    const y0 = Number(node.transform?.y ?? 0);
    const r0 = Number(node.data?.r ?? 0);
    if (![x0, y0, r0].every(Number.isFinite)) return node;
    if (!(r0 > 0)) return node;

    const x1 = cx + (x0 - cx) * f;
    const y1 = cy + (y0 - cy) * f;
    const r1 = clamp(r0 * f, minSize, maxSize);

    return { ...node, transform: { ...node.transform, x: x1, y: y1 }, data: { ...node.data, r: r1 } };
  }

  if (node.type === "text") {
    const x0 = Number(node.transform?.x ?? 0);
    const y0 = Number(node.transform?.y ?? 0);
    if (![x0, y0].every(Number.isFinite)) return node;

    const fs0 = Number(node.data?.fontSize ?? 42);
    const base = Number.isFinite(fs0) && fs0 > 0 ? fs0 : 42;
    const fs1 = clamp(base * f, minSize, maxSize);

    const x1 = cx + (x0 - cx) * f;
    const y1 = cy + (y0 - cy) * f;
    return {
      ...node,
      transform: { ...node.transform, x: x1, y: y1 },
      data: { ...node.data, fontSize: fs1 }
    };
  }

  return node;
}

export function scaleSelectedNodesAsGroup(doc, factor, { minSize = 1, maxSize = 4096 } = {}) {
  const ids = doc.selection.nodeIds ?? [];
  if (ids.length < 2) return scaleSelectedNodes(doc, factor, { minSize, maxSize });

  const idSet = new Set(ids);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of doc.nodes ?? []) {
    if (!idSet.has(node.id)) continue;
    const b = nodeBounds(node);
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return doc;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let changed = false;
  const nextNodes = (doc.nodes ?? []).map((node) => {
    if (!idSet.has(node.id)) return node;
    const next = scaleNodeAboutPoint(node, factor, { cx, cy, minSize, maxSize });
    if (next !== node) changed = true;
    return next;
  });

  return changed ? { ...doc, nodes: nextNodes } : doc;
}
