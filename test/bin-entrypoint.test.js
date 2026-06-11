import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = resolve(packageDir, "bin/agent-loop.js");

test("bin entrypoint is thin and executable", async () => {
  await chmod(binPath, 0o755);
  const text = await readFile(binPath, "utf8");
  assert.ok(text.startsWith("#!/usr/bin/env node\n"));
  assert.match(text, /import \{ main \} from "\.\.\/src\/main\.js";/);
  assert.match(text, /await main\(\);/);
  assert.equal(text.trim().split(/\r?\n/).length, 4);
  assert.ok((await stat(binPath)).mode & 0o111);
  await access(binPath, constants.X_OK);
});

test("source bin prints Rust-compatible version", async () => {
  const { stdout } = await execFileAsync(process.execPath, [binPath, "--version"], {
    cwd: packageDir,
  });
  assert.match(stdout, /^agent-loop 0\.1\.120/m);
});

test("POSIX direct bin invocation uses shebang", async () => {
  await chmod(binPath, 0o755);
  const { stdout } = await execFileAsync(binPath, ["--version"], {
    cwd: packageDir,
  });
  assert.match(stdout, /^agent-loop 0\.1\.120/m);
});

test("SIGINT during a run exits 130 after state writes complete", async () => {
  const { mkdtemp, readdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { pathToFileURL } = await import("node:url");
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const mainUrl = pathToFileURL(resolve(packageDir, "src/main.js")).href;
  const driver = [
    `import { runMain } from ${JSON.stringify(mainUrl)};`,
    "const run = runMain({ argv: [\"plan\", \"Sigint test task\"] });",
    "process.kill(process.pid, \"SIGINT\");",
    "await run;",
    "process.exit(7);",
  ].join("\n");

  let exitCode = 0;
  let stderrText = "";
  try {
    await execFileAsync(process.execPath, ["--input-type=module", "-e", driver], { cwd: project });
  } catch (error) {
    exitCode = error.code;
    stderrText = error.stderr ?? "";
  }
  assert.equal(exitCode, 130);
  assert.match(stderrText, /Interrupted\n/);

  const stateDir = resolve(project, ".agent-loop/state");
  let entries = [];
  try {
    entries = await readdir(stateDir);
  } catch (error) {
    assert.equal(error.code, "ENOENT");
  }
  for (const entry of entries) {
    assert.doesNotMatch(entry, /\.tmp-/);
    if (entry.endsWith(".json")) {
      JSON.parse(await readFile(resolve(stateDir, entry), "utf8"));
    }
  }
});
