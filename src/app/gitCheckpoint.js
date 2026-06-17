import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendStateFile } from "../state/files.js";

const execFileAsync = promisify(execFile);

export async function gitCheckpoint(message, config, baselineFiles = new Set()) {
  if (!config.autoCommit) {
    await appendLog(config, "⏭️ Git checkpoint skipped (AUTO_COMMIT=0)");
    return;
  }
  if (!(await isGitRepo(config))) {
    await appendLog(config, "⚠ Git checkpoint skipped (not a git repo)");
    return;
  }

  const changedEntries = await listChangedEntries(config);
  if (!changedEntries) {
    await logCheckpointFailure(config);
    return;
  }

  const filesToCommit = changedEntries
    .map((entry) => entry.path)
    .filter((file) => shouldIncludeForCheckpoint(file, baselineFiles));

  if (filesToCommit.length === 0) {
    await appendLog(config, "⏭️ Git checkpoint skipped (no loop-owned changes)");
    return;
  }

  const candidateSet = new Set(filesToCommit);
  const scopedPaths = extendCheckpointPaths(changedEntries, filesToCommit, candidateSet);

  const added = await runGit(config, ["add", "-A", "--", ...filesToCommit]);
  if (!added.ok) {
    await logCheckpointFailure(config);
    return;
  }

  const staged = await runGit(config, ["diff", "--cached", "--name-only", "--"]);
  if (!staged.ok) {
    await logCheckpointFailure(config);
    return;
  }

  const stagedForCommit = parseNameOnlyPaths(staged.stdout)
    .filter((line) => candidateSet.has(line));

  if (stagedForCommit.length === 0) {
    await appendLog(config, "⏭️ Git checkpoint skipped (no scoped staged files)");
    return;
  }

  const committed = await runGit(config, ["commit", "-m", `agent-loop: ${message}`, "--only", "--", ...scopedPaths]);
  if (!committed.ok) {
    await logCheckpointFailure(config);
    return;
  }

  await appendLog(config, `📦 Git checkpoint: ${message} (${stagedForCommit.length} file(s))`);
  if (config.autoPush) {
    const pushed = await runGit(config, ["push"]);
    await appendLog(config, pushed.ok ? "📤 Git push completed" : "⚠ Git push failed");
  }
}

function shouldIncludeForCheckpoint(file, baselineFiles) {
  if (file === ".agent-loop/state" || file.startsWith(".agent-loop/state/")) {
    return false;
  }
  return !baselineFiles.has(file);
}

function extendCheckpointPaths(entries, candidates, candidateSet) {
  const scopedPaths = [...candidates];
  const seen = new Set(candidateSet);
  for (const entry of entries) {
    if (!candidateSet.has(entry.path) || !entry.renameSource) {
      continue;
    }
    if (!seen.has(entry.renameSource)) {
      seen.add(entry.renameSource);
      scopedPaths.push(entry.renameSource);
    }
  }
  return scopedPaths;
}

async function isGitRepo(config) {
  const result = await runGit(config, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout.trim() === "true";
}

async function listChangedEntries(config) {
  const result = await runGit(config, ["status", "--porcelain", "--untracked-files=all"]);
  if (!result.ok) {
    return undefined;
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parsePorcelainEntry)
    .filter((entry) => entry.path);
}

function parsePorcelainEntry(line) {
  const rawPath = line.slice(3);
  const renameParts = rawPath.split(" -> ");
  if (renameParts.length === 2) {
    return { path: renameParts[1], renameSource: renameParts[0] };
  }
  return { path: rawPath };
}

function parseNameOnlyPaths(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function runGit(config, args) {
  try {
    const output = await execFileAsync("git", args, {
      cwd: config.projectDir,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
    return { ok: true, stdout: output.stdout ?? "", stderr: output.stderr ?? "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? String(error),
    };
  }
}

async function logCheckpointFailure(config) {
  await appendLog(config, "⚠ Git checkpoint skipped (commit failed or nothing to commit)");
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}
