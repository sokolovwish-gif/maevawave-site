import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const upstream = await fetch(`http://127.0.0.1:3012${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request,
      duplex: "half",
    });
    response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    return response.end(Buffer.from(await upstream.arrayBuffer()));
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname === "/admin/" ? "/admin/index.html" : url.pathname;
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    return response.end();
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(8765, "127.0.0.1", () => {
  console.log("Admin preview listening on 8765");
});
