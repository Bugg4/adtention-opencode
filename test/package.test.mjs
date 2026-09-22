import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("package exposes the OpenCode V2 TUI plugin source", () => {
  assert.equal(pkg.name, "@adtention/opencode");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.exports["./tui"], "./src/tui.tsx");
});

test("package targets OpenCode 2 and the V2 plugin API", () => {
  assert.equal(pkg.engines.opencode, ">=2.0.0");
  assert.ok(
    pkg.peerDependencies["@opencode/plugin"],
    "peer-depends on @opencode/plugin",
  );
  assert.ok(
    !pkg.peerDependencies["@opencode-ai/plugin"],
    "does not peer-depend on the V1 @opencode-ai/plugin package",
  );
});

test("published package includes both entry layouts", () => {
  assert.deepEqual(pkg.files, ["src", "tui.tsx"]);
  assert.equal(pkg.bin["adtention-opencode"], "./src/cli.mjs");
});
