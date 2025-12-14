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
