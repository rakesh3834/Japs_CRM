// Local adapter for the exact deployed Worker. It never logs cookies or secrets.
import http from "node:http";
import { Readable } from "node:stream";
import worker from "../worker/index.js";
const env = { ...process.env, JAPS_CRM_APP_ORIGIN: "http://127.0.0.1:5173" };
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:8000${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(!["GET", "HEAD"].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: "half" } : {}),
    });
    const result = await worker.fetch(request, env, { waitUntil: (promise) => promise.catch(() => {}) });
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch { outgoing.writeHead(500, { "Content-Type": "application/json" }); outgoing.end('{"error":"Local API unavailable"}'); }
});
server.listen(8000, "127.0.0.1", () => console.log("Verified CRM Worker API: http://127.0.0.1:8000"));
