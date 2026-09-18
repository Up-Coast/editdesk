import assert from "node:assert/strict";
import http from "node:http";
import { symlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { startServer } from "../../src/server/server.js";
import { createProject } from "./temporary-project.js";

const PAGE = `<!doctype html><html><head><title>T</title></head><body><h1>Welcome</h1></body></html>`;

/**
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} files
 */
async function serve(t, files) {
  const project = await createProject(files);
  const server = await startServer({
    upstream: null,
    root: project.root,
    port: 0,
  });
  t.after(async () => {
    await server.close();
    await project.remove();
  });
  return { project, server };
}

/**
 * Makes a request with full control of its headers, which fetch does not give.
 * @param {number} port
 * @param {http.RequestOptions} options
 * @param {string} [body]
 * @returns {Promise<{ status: number, body: string }>}
 */
function request(port, options, body) {
  return new Promise((resolve, reject) => {
    const sent = http.request(
      { host: "127.0.0.1", port, ...options },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body: text }),
        );
      },
    );
    sent.on("error", reject);
    sent.end(body);
  });
}

/**
 * @param {string} page An HTML page served by Editdesk.
 */
function tokenIn(page) {
  const config = page.match(/id="editdesk-config">(.*?)<\/script>/)?.[1];
  assert.ok(config, "the page carries the editor's configuration");
  return JSON.parse(config).token;
}

test("criterion: an HTML page is served with the editor added and its elements numbered", async (t) => {
  const { server } = await serve(t, { "index.html": PAGE });
  const page = await (await fetch(server.url)).text();
  assert.match(
    page,
    /<script type="module" src="\/__editdesk\/client\/editor\.js"><\/script>/,
  );
  assert.match(page, /<h1 data-editdesk-el="\d+">Welcome<\/h1>/);
});

test("criterion: other files are served untouched with their content type", async (t) => {
  const { server } = await serve(t, {
    "index.html": PAGE,
    "site.css": "h1 { color: red; }",
  });
  const response = await fetch(`${server.url}/site.css`);
  assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(await response.text(), "h1 { color: red; }");
});

test("criterion: a folder without an index page lists its pages", async (t) => {
  const { server } = await serve(t, {
    "pages/one.html": PAGE,
    "pages/<two>.html": PAGE,
  });
  const listing = await (await fetch(`${server.url}/pages/`)).text();
  assert.match(listing, /<a href="one\.html">one\.html<\/a>/);
  assert.match(listing, /<a href="%3Ctwo%3E\.html">&lt;two&gt;\.html<\/a>/);
});

test("criterion: nothing outside the served folder, and no hidden file, can be read", async (t) => {
  const { project, server } = await serve(t, {
    "index.html": PAGE,
    ".env": "SECRET=1",
  });
  await symlink("/etc", path.join(project.root, "escape"));
  for (const target of [
    "/../../etc/hosts",
    "/%2e%2e/%2e%2e/etc/hosts",
    "/.env",
    "/escape/hosts",
    "/%00",
  ]) {
    const response = await request(server.port, {
      path: target,
      headers: { host: `localhost:${server.port}` },
    });
    assert.equal(response.status, 404, target);
  }
});

test("criterion: a request addressed to any other host name is refused", async (t) => {
  const { server } = await serve(t, { "index.html": PAGE });
  const response = await request(server.port, {
    path: "/",
    headers: { host: "attacker.example" },
  });
  assert.equal(response.status, 403);
  assert.ok(!response.body.includes("Welcome"));
});

test("criterion: an edit is accepted only with this run's token, from this origin, as JSON", async (t) => {
  const { project, server } = await serve(t, {
    "index.html": PAGE,
    "app.js": `const a = "Old words";`,
  });
  const token = tokenIn(await (await fetch(server.url)).text());
  const body = JSON.stringify({
    page: "/",
    element: null,
    slot: 0,
    oldText: "Old words",
    newText: "New words",
    location: null,
  });
  const send = (/** @type {Record<string, string>} */ headers) =>
    request(
      server.port,
      {
        method: "POST",
        path: "/__editdesk/api/edit",
        headers: { host: `localhost:${server.port}`, ...headers },
      },
      body,
    );
  const json = { "content-type": "application/json" };

  assert.equal((await send(json)).status, 403);
  assert.equal(
    (await send({ ...json, "x-editdesk-token": "0".repeat(64) })).status,
    403,
  );
  assert.equal(
    (
      await send({
        ...json,
        "x-editdesk-token": token,
        origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await send({ "content-type": "text/plain", "x-editdesk-token": token }))
      .status,
    400,
  );
  assert.equal(await project.read("app.js"), `const a = "Old words";`);

  const accepted = await send({
    ...json,
    "x-editdesk-token": token,
    origin: `http://localhost:${server.port}`,
  });
  assert.equal(accepted.status, 200);
  assert.equal(JSON.parse(accepted.body).outcome, "saved");
  assert.equal(await project.read("app.js"), `const a = "New words";`);
});

test("criterion: the editor's own files are served, and only those", async (t) => {
  const { server } = await serve(t, { "index.html": PAGE });
  const script = await fetch(`${server.url}/__editdesk/client/editor.js`);
  assert.equal(script.status, 200);
  assert.equal(
    script.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  const outside = await request(server.port, {
    path: "/__editdesk/client/..%2fmessages.js",
    headers: { host: `localhost:${server.port}` },
  });
  assert.equal(outside.status, 404);
});
