import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL("manifest.webmanifest", root), "utf8"),
);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
for (const icon of manifest.icons)
  assert.ok(fs.existsSync(new URL(icon.src, root)), icon.src);
const html = fs.readFileSync(new URL("index.html", root), "utf8");
assert.ok(html.includes("apple-touch-icon"));
assert.ok(html.includes("viewport-fit=cover"));
const sw = fs.readFileSync(new URL("sw.js", root), "utf8");
assert.ok(sw.includes("index.html"));
assert.ok(sw.includes("NavigationRoute"));
const assets = fs.readdirSync(new URL("assets/", root));
for (const file of assets.filter((f) => /\.(js|css)$/.test(f)))
  assert.ok(sw.includes("assets/" + file), "Missing precache asset " + file);
for (const match of html.matchAll(
  /(?:src|href)="([^"]+\.(?:js|css|webmanifest|png))"/g,
))
  assert.ok(fs.existsSync(new URL(match[1], root)), match[1]);
assert.equal(path.basename(new URL("sw.js", root).pathname), "sw.js");
console.log(
  `PWA build checks passed: manifest, icons, HTML references, navigation fallback, ${assets.length} precached JS/CSS assets. Runtime offline/iOS checks still require a browser.`,
);
