import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const port = Number(process.env.PORT ?? process.argv[2] ?? 5173);
const host = process.env.HOST ?? "127.0.0.1";

const mimeByExt = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

function toSafeFilePath(urlPath) {
  const cleaned = urlPath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(cleaned);
  const rel = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, rel);
  if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) return null;
  return resolved;
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return send(res, 400, "Bad Request");
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method Not Allowed");
    }

    const urlPath = req.url === "/" ? "/index.html" : req.url;
    const filePath = toSafeFilePath(urlPath);
    if (!filePath) return send(res, 403, "Forbidden");

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) return send(res, 404, "Not Found");

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeByExt.get(ext) ?? "application/octet-stream";

    if (req.method === "HEAD") {
      return send(res, 200, "", { "content-type": contentType });
    }

    const data = await fs.readFile(filePath);
    return send(res, 200, data, { "content-type": contentType });
  } catch (err) {
    return send(res, 500, String(err?.stack ?? err));
  }
});

server.listen(port, host, () => {
  console.log(`[svg-playground] serving ${rootDir}`);
  console.log(`[svg-playground] http://${host}:${port}`);
});

