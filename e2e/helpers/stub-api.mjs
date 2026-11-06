// Stub Task API for the e2e tests (started by playwright.config.ts, port STUB_PORT).
// Tests steer it through /__control and read what it received through /__requests.
//   POST /__control   {"list": <behaviour>, "create": <behaviour>, "reset": true}
//   GET  /__requests  -> [{ method, path, body }]
// behaviour: { status, body, raw, delayMs, destroy } or null for the default (in-memory store).
import http from "node:http";

const port = Number(process.env.STUB_PORT);
let store = [];
let behaviour = { list: null, create: null };
let requests = [];
let nextId = 1;

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

function applyBehaviour(b, req, res, fallback) {
  if (!b) return fallback();
  if (b.destroy) return req.socket.destroy();
  if (b.hang) return undefined; // never answers
  const respond = () => send(res, b.status ?? 200, b.raw !== undefined ? b.raw : (b.body ?? {}));
  if (b.delayMs) setTimeout(respond, b.delayMs);
  else respond();
  return undefined;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://stub");
    const body = await readBody(req);
    if (url.pathname === "/__ready") return send(res, 200, { ok: true });
    if (url.pathname === "/__control") {
      const next = JSON.parse(body || "{}");
      if (next.reset) {
        store = [];
        requests = [];
        behaviour = { list: null, create: null };
        nextId = 1;
      }
      if ("store" in next) store = next.store;
      if ("list" in next) behaviour.list = next.list;
      if ("create" in next) behaviour.create = next.create;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__requests") return send(res, 200, requests);
    requests.push({ method: req.method, path: url.pathname, body });
    if (url.pathname === "/tasks" && req.method === "GET") {
      return applyBehaviour(behaviour.list, req, res, () => send(res, 200, store));
    }
    if (url.pathname === "/tasks" && req.method === "POST") {
      return applyBehaviour(behaviour.create, req, res, () => {
        const input = JSON.parse(body);
        const task = { id: `t${nextId++}`, title: String(input.title).trim(), due_date: input.due_date ?? null };
        store.push(task);
        send(res, 201, task);
      });
    }
    return send(res, 404, { detail: "not found" });
  })
  .listen(port, "127.0.0.1");
