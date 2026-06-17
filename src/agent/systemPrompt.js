import { stateManifest } from "./stateManifest.js";

const SINGLE_AGENT_REVIEWER_PREAMBLE_NORMAL = "You are now the REVIEWER. Evaluate the work independently and critically as if you did not write it.";
const SINGLE_AGENT_REVIEWER_PREAMBLE_TERSE = "Now REVIEWER. Evaluate independently and critically, as if you did not write it.";

const DECISION_CAPTURE_INSTRUCTIONS_NORMAL = `DECISION CAPTURE: If you make an important architectural decision, discover a constraint,
choose a reusable pattern, hit a gotcha, or identify a key dependency — append a one-line
entry to \`.agent-loop/decisions.md\` with format:
- [CATEGORY] description
where CATEGORY is one of: ARCHITECTURE, PATTERN, CONSTRAINT, GOTCHA, DEPENDENCY`;

const DECISION_CAPTURE_INSTRUCTIONS_TERSE = `DECISION CAPTURE: For important architecture decisions, constraints, reusable patterns, gotchas, or dependencies, append one line to \`.agent-loop/decisions.md\`:
- [CATEGORY] description
CATEGORY: ARCHITECTURE, PATTERN, CONSTRAINT, GOTCHA, DEPENDENCY`;

const ROLES_WITHOUT_DECISION_CAPTURE = new Set(["discoverer", "supervisor"]);

export function systemPromptForRole(config, role) {
  const parts = [];

  if (config.decisionsEnabled && !ROLES_WITHOUT_DECISION_CAPTURE.has(role)) {
    parts.push(config.promptStyle === "terse"
      ? DECISION_CAPTURE_INSTRUCTIONS_TERSE
      : DECISION_CAPTURE_INSTRUCTIONS_NORMAL);
  }

  if (role === "reviewer" && config.mode === "single-agent") {
    parts.push(config.promptStyle === "terse"
      ? SINGLE_AGENT_REVIEWER_PREAMBLE_TERSE
      : SINGLE_AGENT_REVIEWER_PREAMBLE_NORMAL);
  }

  if (config.progressiveContext) {
    const manifest = stateManifest(config);
    if (manifest) {
      parts.push(manifest);
    }
  }

  return appendSystemOverlay(parts.join("\n\n"), config, role);
}

function appendSystemOverlay(prompt, config, role) {
  let output = appendOverlayText(prompt, config.promptOverlays?.system?.all);
  if (role !== "supervisor") {
    output = appendOverlayText(output, config.promptOverlays?.system?.[role]);
  }
  return output;
}

function appendOverlayText(prompt, overlay) {
  if (typeof overlay !== "string" || !overlay.trim()) {
    return prompt;
  }
  let output = prompt;
  if (output && !output.endsWith("\n\n")) {
    output += "\n\n";
  }
  return output + overlay.replace(/^\n+|\n+$/g, "");
}
