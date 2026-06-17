import { collectActionOverrides, isJsonRequested, parseCliFrom } from "./app/cli.js";
import { dispatchFromCli, executeDispatch } from "./app/dispatch.js";
import { elapsedPrefersStderr, printsElapsedInternally } from "./app/dispatchTypes.js";
import { clearInterrupt, requestInterrupt } from "./state/files.js";

export function emitElapsed(started, { jsonMode = false, preferStderr = false, stdout = process.stdout, stderr = process.stderr, stderrIsTTY = stderr.isTTY } = {}) {
  const elapsedMs = Math.max(0, Date.now() - started);
  if (jsonMode) {
    if (preferStderr && stderrIsTTY) {
      stderr.write(JSON.stringify({ type: "elapsed", data: { elapsed_ms: elapsedMs } }) + "\n");
    }
    return;
  }
  const stream = preferStderr ? stderr : stdout;
  stream.write(`elapsed: ${(elapsedMs / 1000).toFixed(2)}s\n`);
}

function isInterrupted(error) {
  return error?.name === "AbortError" || error?.code === "SIGINT" || error?.interrupted === true;
}

export async function runMain({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
  stderrIsTTY = process.stderr.isTTY,
  now,
  agentRunner,
  readAnswer,
} = {}) {
  const started = Date.now();
  const jsonRequested = isJsonRequested(argv);
  const onSigint = () => {
    stderr.write("Interrupted\n");
    requestInterrupt(() => process.exit(130));
  };
  process.on("SIGINT", onSigint);
  try {
    const parsed = parseCliFrom(argv);
    if (parsed.kind === "exit") {
      if (parsed.stdout) {
        stdout.write(parsed.stdout);
      }
      if (parsed.stderr) {
        stderr.write(parsed.stderr);
      }
      emitElapsed(started, { jsonMode: jsonRequested, preferStderr: jsonRequested, stdout, stderr, stderrIsTTY });
      return parsed.code;
    }
    if (parsed.kind === "error") {
      stderr.write(parsed.stderr);
      return parsed.code;
    }
    parsed.cli.actionOverrides = collectActionOverrides(parsed.cli.globals.actionOverrides);
    const dispatch = dispatchFromCli(parsed.cli);
    const code = await executeDispatch(dispatch, { argv, env, cwd, stdout, stderr, stdin, stderrIsTTY, now, agentRunner, readAnswer });
    if (!printsElapsedInternally(dispatch)) {
      emitElapsed(started, {
        jsonMode: parsed.cli.globals.json,
        preferStderr: elapsedPrefersStderr(dispatch, parsed.cli.globals.json),
        stdout,
        stderr,
        stderrIsTTY,
      });
    }
    return code;
  } catch (error) {
    if (isInterrupted(error)) {
      stderr.write(`Interrupted: ${error.message ?? "interrupted"}\n`);
      return 130;
    }
    const message = String(error.message ?? error);
    if (jsonRequested) {
      stderr.write(`${JSON.stringify({ type: "error", data: { message } })}\n`);
    } else {
      stderr.write(`${message}\n`);
    }
    return 1;
  } finally {
    process.removeListener("SIGINT", onSigint);
    clearInterrupt();
  }
}

export async function main() {
  const code = await runMain();
  process.exitCode = code;
}
