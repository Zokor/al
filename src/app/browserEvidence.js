import { stat } from "node:fs/promises";
import { readStateFile, safeStatePath } from "../state/files.js";

export const BROWSER_EVIDENCE_GATE_FILENAME = "browser-evidence-gate.md";
export const BROWSER_EVIDENCE_EXEMPT_FILENAME = "browser-evidence-exempt.flag";

const BROWSER_GOAL_KEYWORDS = [
  "browser",
  "e2e",
  "end-to-end",
  "playwright",
  "cypress",
  "puppeteer",
  "selenium",
  "frontend",
  "page",
  "route",
  "modal",
  "form",
  "button",
  "click",
  "viewport",
  "responsive",
  "accessibility",
];

export async function browserEvidenceGateAssessment(config, browserOutcome) {
  if (browserOutcome || config.browserEvidencePolicy === "off" || await stateFileExists(config, BROWSER_EVIDENCE_EXEMPT_FILENAME)) {
    return undefined;
  }
  const keywordHits = await browserGoalKeywordHits(config);
  if (keywordHits.length === 0) {
    return undefined;
  }
  return {
    keywordHits,
    commandsConfigured: config.browserTestCommands.length > 0,
    checksEnabled: config.verifyBrowserTest,
    stateExempted: false,
  };
}

export function browserEvidenceGateSummary(assessment) {
  if (assessment.commandsConfigured && !assessment.checksEnabled) {
    return "browser-facing goals detected but browser/E2E checks are disabled";
  }
  if (assessment.commandsConfigured) {
    return "browser-facing goals detected but no browser/E2E result was captured";
  }
  return "browser-facing goals detected but no browser/E2E command is configured";
}

export function browserEvidenceGateReport(config, assessment, targetPhase) {
  const keywords = assessment.keywordHits.map((keyword) => `- \`${keyword}\``).join("\n");
  const commandState = browserEvidenceCommandState(assessment);
  return `# Browser Evidence Gate\n\nAgent Loop paused before ${targetPhase} because the active plan/task looks browser-facing, but no deterministic browser/E2E evidence ran.\n\n## Detected Signals\n\n${keywords}\n\n## Current Configuration\n\n- \`browser_evidence_policy\`: \`${config.browserEvidencePolicy}\`\n- \`verify_browser_test\`: \`${config.verifyBrowserTest}\`\n- \`browser_test_commands\`: ${commandState}\n- State exemption: \`${assessment.stateExempted}\`\n\n## Required Action\n\nConfigure \`browser_test_commands\` with a deterministic browser/E2E command and keep \`verify_browser_test = true\`, then resume. If this work intentionally has no browser surface, set \`browser_evidence_policy\` to \`off\` or write an exemption reason to \`${safeStatePath(config, BROWSER_EVIDENCE_EXEMPT_FILENAME)}\`.\n`;
}

function browserEvidenceCommandState(assessment) {
  if (assessment.commandsConfigured && assessment.checksEnabled) {
    return "configured and enabled, but no result was captured";
  }
  if (assessment.commandsConfigured) {
    return "configured but disabled (`verify_browser_test = false`)";
  }
  return "not configured";
}

async function browserGoalKeywordHits(config) {
  const plan = await readStateFile(config, "plan.md");
  const task = await readStateFile(config, "task.md");
  const combined = `${plan}\n${task}`.toLowerCase();
  return BROWSER_GOAL_KEYWORDS.filter((keyword) => combined.includes(keyword));
}

async function stateFileExists(config, fileName) {
  try {
    await stat(safeStatePath(config, fileName));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
