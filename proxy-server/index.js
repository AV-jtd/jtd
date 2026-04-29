import http from "http";
import https from "https";
import { URL } from "url";

const SUPABASE_ORIGIN = "https://nvfioycpwyzwukvokwql.supabase.co";
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const target = new URL(req.url, SUPABASE_ORIGIN);

  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };

  // Убираем заголовки, которые мешают проксированию
  delete options.headers["origin"];
  delete options.headers["referer"];

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-expose-headers": "*",
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  // Preflight OPTIONS — отвечаем сразу без проксирования
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Supabase proxy running on port ${PORT}`);
});
