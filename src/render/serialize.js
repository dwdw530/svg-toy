import { formatViewBox } from "../model/parsers.js";
import { svgEl } from "./svg.js";
import { renderAssetsToDefs, renderSceneNodes } from "./render.js";

export function serializeDocumentToSvgString(doc) {
  const root = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    "xmlns:xlink": "http://www.w3.org/1999/xlink",
    viewBox: formatViewBox(doc.viewBox)
  });

  const defs = svgEl("defs");
  renderAssetsToDefs(doc.assets, defs);
  root.appendChild(defs);

  const scene = svgEl("g");
  renderSceneNodes(doc.nodes, [], scene, { forExport: true });
  root.appendChild(scene);

  const xml = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`;
}

export function serializeAssetsToSpriteString(assetsById) {
  const root = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    "xmlns:xlink": "http://www.w3.org/1999/xlink"
  });

  const defs = svgEl("defs");
  renderAssetsToDefs(assetsById ?? {}, defs);
  root.appendChild(defs);

  const xml = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`;
}

/**
 * 把资产列表序列化为 manifest 对象（调用方自己 JSON.stringify）
 * @param {Object} assetsById - { [id]: asset }
 * @returns {{ version: string, generatedAt: string, assets: Array }}
 */
export function serializeAssetsToManifest(assetsById) {
  const assets = Object.values(assetsById ?? {})
    .filter((a) => a && !a.archived)
    .map((asset) => ({
      id: asset.id,
      name: asset.name ?? asset.id,
      viewBox: asset.viewBox ?? "",
      sourceFileName: asset.meta?.sourceFileName ?? ""
    }));

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    assets
  };
}

/**
 * 把单个资产序列化为完整 SVG 字符串
 * @param {Object} asset - { id, viewBox, innerMarkup, ... }
 * @returns {string}
 */
export function serializeSingleAssetToSvgString(asset) {
  if (!asset) return "";

  const root = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    "xmlns:xlink": "http://www.w3.org/1999/xlink",
    viewBox: asset.viewBox ?? "0 0 100 100"
  });

  root.innerHTML = asset.innerMarkup ?? "";

  const xml = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`;
}
