import { loadConfig } from "../../config/index.js";
import { appendEvent } from "../../state/events.js";
import { readStateFile } from "../../state/files.js";

const REQUIREMENT_ID_RE = /\bREQ-\d{3}\b/g;
const TASK_HEADING_RE = /^#{2,6}\s+(.+)$/;
const LIST_TASK_RE = /^[-*]\s+(?:\[[ xX]\]\s+)?(?:\*\*)?(?:Task\s*)?\d+[\).:\-]\s*(.+)$/;

export async function runAnalyzeCoverage(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  await appendEvent(config, { type: "command_started", data: { command: "analyze-coverage" } });
  const report = await analyzeSpecCoverage(config);
  if (cli.globals.json) {
    context.stdout.write(`${JSON.stringify(commandStartedEvent(config))}\n`);
    context.stdout.write(`${JSON.stringify({ type: "spec_coverage", data: report })}\n`);
  } else {
    writePlainCoverageReport(context, report);
  }
  return report.missing_requirements.length === 0 && report.orphan_tasks.length === 0 ? 0 : 1;
}

function commandStartedEvent(config) {
  return {
    ts: (config.now ? config.now() : new Date()).toISOString(),
    seq: 1,
    type: "command_started",
    data: {
      command: "analyze-coverage",
      isPipeline: false,
    },
    protocol_version: 1,
  };
}

export async function analyzeSpecCoverage(config) {
  const spec = await readStateFile(config, "spec.md");
  if (!spec.trim()) {
    throw new Error("State error: No spec.md found. Run 'agent-loop spec' first.");
  }
  const tasks = await readStateFile(config, "tasks.md");
  if (!tasks.trim()) {
    throw new Error("State error: No tasks.md found. Run 'agent-loop tasks' first.");
  }

  const requirements = extractRequirementIds(spec);
  const covered = new Set(extractRequirementIds(tasks));
  const coveredRequirements = requirements.filter((requirement) => covered.has(requirement));
  const missingRequirements = requirements.filter((requirement) => !covered.has(requirement));
  const coveragePercent = requirements.length === 0
    ? 100
    : Math.floor((coveredRequirements.length * 100) / requirements.length);

  return {
    requirements,
    covered_requirements: coveredRequirements,
    missing_requirements: missingRequirements,
    orphan_tasks: orphanTasksForCoverage(tasks),
    coverage_percent: coveragePercent,
  };
}

function writePlainCoverageReport(context, report) {
  context.stdout.write(`coverage: ${report.coverage_percent}%\n`);
  if (report.missing_requirements.length > 0) {
    context.stdout.write(`missing requirements: ${report.missing_requirements.join(", ")}\n`);
  }
  if (report.orphan_tasks.length > 0) {
    context.stdout.write("orphan tasks:\n");
    for (const task of report.orphan_tasks) {
      context.stdout.write(`  - ${task}\n`);
    }
  }
}

function extractRequirementIds(content) {
  return Array.from(new Set(
    Array.from(String(content ?? "").matchAll(REQUIREMENT_ID_RE), (match) => match[0].toUpperCase()),
  )).sort();
}

function taskBlocksForCoverage(tasks) {
  const blocks = [];
  let currentTitle;
  let currentBody = "";

  for (const line of String(tasks ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    const title = titleForTaskLine(trimmed);
    if (title) {
      if (currentTitle !== undefined) {
        blocks.push([currentTitle, currentBody.trim()]);
        currentBody = "";
      }
      currentTitle = title;
      continue;
    }
    if (currentTitle !== undefined) {
      currentBody += `${line}\n`;
    }
  }

  if (currentTitle !== undefined) {
    blocks.push([currentTitle, currentBody.trim()]);
  }
  if (blocks.length === 0 && String(tasks ?? "").trim()) {
    blocks.push(["tasks.md", String(tasks).trim()]);
  }
  return blocks;
}

function titleForTaskLine(trimmed) {
  return TASK_HEADING_RE.exec(trimmed)?.[1]?.trim()
    ?? LIST_TASK_RE.exec(trimmed)?.[1]?.trim();
}

function orphanTasksForCoverage(tasks) {
  return taskBlocksForCoverage(tasks)
    .filter(([title, body]) => extractRequirementIds(`${title}\n${body}`).length === 0)
    .map(([title]) => title);
}
