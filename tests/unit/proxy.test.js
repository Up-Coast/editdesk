import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import { test } from "node:test";
import { startServer } from "../../src/server/server.js";

/**
 * Starts a stand-in for a development server.
 * @param {import("node:test").TestContext} t
 * @param {http.RequestListener} listener
 */
async function startUpstream(t, listener) {
  const upstream = http.createServer(listener);
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const { port } = /** @type {net.AddressInfo} */ (upstream.address());
  return { upstream, url: new URL(`http://127.0.0.1:${port}`) };
}

/**
 * @param {import("node:test").TestContext} t
 * @param {URL} upstreamUrl
 */
async function startProxy(t, upstreamUrl) {
  const server = await startServer({
    upstream: upstreamUrl,
    root: null,
    port: 0,
  });
  t.after(server.close);
  return server;
}

test("criterion: a proxied page gets the editor, loses its content security policy, and nothing else changes", async (t) => {
  const { url } = await startUpstream(t, (request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "script-src 'none'",
      "x-upstream-host": request.headers.host ?? "",
    });
    response.end(
      "<!doctype html><html><head></head><body><h1>Hi</h1></body></html>",
    );
  });
  const proxy = await startProxy(t, url);
  const response = await fetch(proxy.url);
  const page = await response.text();
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-upstream-host"), url.host);
  assert.match(page, /editdesk\/client\/editor\.js/);
  assert.equal(
    page.replace(/<script.*<\/script>/, ""),
    "<!doctype html><html><head></head><body><h1>Hi</h1></body></html>",
  );
});

test("criterion: a live site is shown without any way to write files", async (t) => {
  const { url } = await startUpstream(t, (request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html><head></head><body>Hi</body></html>");
  });
  const proxy = await startProxy(t, url);
  const page = await (await fetch(proxy.url)).text();
  const config = JSON.parse(
    page.match(/id="editdesk-config">(.*?)<\/script>/)?.[1] ?? "{}",
  );
  assert.equal(config.canSave, false);
  const response = await fetch(`${proxy.url}/__editdesk/api/edit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-editdesk-token": config.token,
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
});

test("criterion: responses that are not pages pass through byte for byte", async (t) => {
  const payload = Buffer.from([0, 255, 1, 254, 60, 104, 116, 109, 108, 62]);
  const { url } = await startUpstream(t, (request, response) => {
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.end(payload);
  });
  const proxy = await startProxy(t, url);
  const received = Buffer.from(
    await (await fetch(`${proxy.url}/file.bin`)).arrayBuffer(),
  );
  assert.deepEqual(received, payload);
});

test("criterion: request bodies and methods reach the upstream", async (t) => {
  const { url } = await startUpstream(t, async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ method: request.method, body, path: request.url }),
    );
  });
  const proxy = await startProxy(t, url);
  const response = await fetch(`${proxy.url}/api/things?x=1`, {
    method: "PUT",
    body: "payload",
  });
  assert.deepEqual(await response.json(), {
    method: "PUT",
    body: "payload",
    path: "/api/things?x=1",
  });
});

test("criterion: a redirect to the upstream's own address stays inside Editdesk", async (t) => {
  const { url } = await startUpstream(t, (request, response) => {
    response.writeHead(302, {
      location: `http://${request.headers.host}/next`,
    });
    response.end();
  });
  const proxy = await startProxy(t, url);
  const response = await fetch(proxy.url, { redirect: "manual" });
  assert.equal(response.headers.get("location"), `${proxy.url}/next`);
});

test("criterion: an upstream that is not running gives a plain explanation", async (t) => {
  const proxy = await startProxy(t, new URL("http://127.0.0.1:9"));
  const response = await fetch(proxy.url);
  assert.equal(response.status, 502);
  assert.match(
    await response.text(),
    /could not reach http:\/\/127\.0\.0\.1:9/,
  );
});

test("criterion: live-reload WebSocket connections pass through", async (t) => {
  const { upstream, url } = await startUpstream(t, () => {});
  upstream.on("upgrade", (request, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
    );
    socket.on("data", (data) => socket.write(`echo:${data}`));
  });
  const proxy = await startProxy(t, url);
  const socket = net.connect(proxy.port, "127.0.0.1");
  t.after(() => socket.destroy());
  await once(socket, "connect");
  socket.write(
    `GET /_next/webpack-hmr HTTP/1.1\r\nHost: localhost:${proxy.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
  );
  const [handshake] = await once(socket, "data");
  assert.match(String(handshake), /101 Switching Protocols/);
  socket.write("ping");
  const [echo] = await once(socket, "data");
  assert.equal(String(echo), "echo:ping");
});
