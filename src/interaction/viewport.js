import { clamp } from "../model/parsers.js";

export function clientToSvgPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function zoomViewBoxAtPoint(viewBox, svgPoint, zoomFactor, { minW = 80, maxW = 8000 } = {}) {
  const vb = viewBox;
  const nextW = clamp(vb.w / zoomFactor, minW, maxW);
  const ratio = vb.h / vb.w;
  const nextH = nextW * ratio;

  const scale = nextW / vb.w;
  const nextX = svgPoint.x - (svgPoint.x - vb.x) * scale;
  const nextY = svgPoint.y - (svgPoint.y - vb.y) * scale;

  return { x: nextX, y: nextY, w: nextW, h: nextH };
}

