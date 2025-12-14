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

