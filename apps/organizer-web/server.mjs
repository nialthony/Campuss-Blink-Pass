import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? "3010");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mimeByExt = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function toSafeFilePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname.split("?")[0] ?? "/");
  const normalized = decoded === "/" ? "/index.html" : decoded;
  const candidate = path.normalize(path.join(__dirname, normalized));
  if (!candidate.startsWith(__dirname)) {
    return null;
  }
  return candidate;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const requestUrl = req.url ?? "/";
  const filePath = toSafeFilePath(requestUrl);
  if (!filePath) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Invalid path" }));
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeByExt.get(ext) ?? "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    if (method === "HEAD") {
      res.end();
      return;
    }
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(port, () => {
  console.log(`organizer-web verifier on http://localhost:${port}`);
});
