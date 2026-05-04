const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { extname, join, normalize } = require("node:path");

const DEFAULT_PORT = Number(process.env.PORT || 5173);
const REMOTE_ORIGIN = "https://office.jbedu.kr";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safePublicPath(pathname) {
  const publicDir = process.env.PUBLIC_DIR || join(process.cwd(), "public");
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  return join(publicDir, normalized);
}

async function proxyRemotePage(req, res, requestUrl) {
  const targetPath = requestUrl.searchParams.get("path") || "/jbstudy-g/M010503/index.do";
  const targetQuery = requestUrl.searchParams.get("query") || "";

  if (!targetPath.startsWith("/jbstudy-g/M010503/")) {
    send(res, 400, JSON.stringify({ error: "허용되지 않은 경로입니다." }), {
      "content-type": "application/json; charset=utf-8",
    });
    return;
  }

  const remoteUrl = new URL(targetPath, REMOTE_ORIGIN);
  if (targetQuery) {
    new URLSearchParams(targetQuery).forEach((value, key) => {
      remoteUrl.searchParams.set(key, value);
    });
  }

  try {
    const remoteRes = await fetch(remoteUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.4",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
    });

    const text = await remoteRes.text();
    send(res, remoteRes.ok ? 200 : remoteRes.status, text, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }), {
      "content-type": "application/json; charset=utf-8",
    });
  }
}

function startServer(port = DEFAULT_PORT) {
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://localhost:${port}`);

    if (requestUrl.pathname === "/api/page") {
      await proxyRemotePage(req, res, requestUrl);
      return;
    }

    try {
      const filePath = safePublicPath(requestUrl.pathname);
      const body = await readFile(filePath);
      const type = contentTypes[extname(filePath)] || "application/octet-stream";
      send(res, 200, body, { "content-type": type });
    } catch {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      console.log(`Meal PDF app running at http://127.0.0.1:${address.port}`);
      resolve(server);
    });
  });
}

module.exports = {
  startServer,
};
