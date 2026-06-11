import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const packageDir = resolve(import.meta.dirname, "..");
const roots = ["bin", "src", "scripts", "test"];
const files = [];

async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(path);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
}

for (const root of roots) {
  await collect(resolve(packageDir, root));
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

console.log(`Checked ${files.length} JavaScript files`);
