import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendStateFile } from "../state/files.js";

export const CHECK_TIMEOUT_MS = 600_000;
const CHECK_MAX_LINES = 100;
const execFileAsync = promisify(execFile);

export async function runCheckCommands(config, commands, { startLog, itemLog, header }) {
  if (commands.length === 0) {
    return undefined;
  }
  await appendLog(config, startLog);
  const results = [];
  for (const check of commands) {
    await appendLog(config, `${itemLog}: ${check.label}`);
    const result = await runSingleCheck(config, check);
    await appendLog(config, `${itemLog} ${result.success ? "PASS" : "FAIL"}: ${check.label}`);
    results.push(result);
  }
  return {
    output: formatCheckResults(results, header),
    anyFailed: results.some((result) => !result.success),
  };
}

async function runSingleCheck(config, check) {
  const [command, args] = shellCommand(check.command);
  try {
    const result = await execFileAsync(command, args, {
      cwd: config.projectDir,
      encoding: "utf8",
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 20,
    });
    return checkResult(check, {
      success: true,
      timedOut: false,
      output: combineOutput(result.stdout, result.stderr),
    });
  } catch (error) {
    return checkResult(check, {
      success: false,
      timedOut: error.killed || error.signal === "SIGTERM",
      output: combineOutput(error.stdout, error.stderr) || `Failed to run: ${error.message ?? error}`,
    });
  }
}

function checkResult(check, result) {
  const { output, truncated } = truncateOutput(result.output, CHECK_MAX_LINES);
  return {
    label: check.label,
    success: result.success,
    timedOut: result.timedOut,
    remediation: check.remediation,
    output,
    outputTruncated: truncated,
  };
}

function shellCommand(command) {
  return process.platform === "win32"
    ? ["cmd", ["/C", command]]
    : ["sh", ["-c", command]];
}

function formatCheckResults(results, header) {
  const lines = [header];
  for (const result of results) {
    const status = result.timedOut ? "TIMEOUT" : result.success ? "PASS" : "FAIL";
    if (result.success && !result.timedOut) {
      lines.push(`${result.label} [PASS]`);
      continue;
    }
    lines.push(`\n--- ${result.label} [${status}] ---`);
    if (result.outputTruncated) {
      lines.push(`NOTE: output truncated to last ${CHECK_MAX_LINES} lines.`);
    }
    if (result.remediation) {
      lines.push(result.output ? `REMEDIATION: ${result.remediation}\n${result.output}` : `REMEDIATION: ${result.remediation}`);
    } else if (result.output) {
      lines.push(result.output);
    }
  }
  return lines.join("\n");
}

function combineOutput(stdout, stderr) {
  return [stdout, stderr]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n")
    .trim();
}

function truncateOutput(output, maxLines) {
  const lines = String(output ?? "").split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { output: String(output ?? "").trim(), truncated: false };
  }
  return { output: lines.slice(-maxLines).join("\n").trim(), truncated: true };
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}
