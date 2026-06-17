import { readStateFile, removeStateFile, writeStateFile } from "../state/files.js";

export const ACCEPTANCE_GOALS_SCHEMA_VERSION = 3;

const ACCEPTANCE_GOALS_FILENAME = "acceptance-goals.json";
const SOURCE_WARNINGS = Object.freeze({
  plan_heuristic_fallback: "Acceptance goals fell back to heuristic extraction from plan.md because no explicit `## Canonical Acceptance Goals` section was found.",
  embedded_task_plan_heuristic_fallback: "Acceptance goals fell back to heuristic extraction from the embedded task.md plan because no explicit `## Canonical Acceptance Goals` section was found.",
  task_heuristic_fallback: "Acceptance goals fell back to heuristic extraction from task.md because no explicit `## Canonical Acceptance Goals` section was found.",
});
const PLAN_META_SECTIONS = ["files to modify", "files to change", "key decisions", "notes", "overview"];

export async function loadOrRefreshAcceptanceGoals(config) {
  const expectedHash = await acceptanceGoalSourceHash(config);
  const raw = await readStateFile(config, ACCEPTANCE_GOALS_FILENAME);
  const cached = parseAcceptanceGoalsFile(raw);
  if (cached && await cachedAcceptanceGoalsAreFresh(config, cached, expectedHash)) {
    const extracted = goalsFromAcceptanceFile(cached);
    if (!sameArray(extracted.lintIssues, cached.lint_issues)) {
      await writeStateFile(config, ACCEPTANCE_GOALS_FILENAME, `${JSON.stringify(goalsToAcceptanceFile(config, extracted, expectedHash), null, 2)}\n`);
    }
    return extracted;
  }
  return refreshAcceptanceGoals(config, expectedHash);
}

export async function acceptanceGoalSourceHash(config) {
  const spec = await readStateFile(config, "spec.md");
  const plan = await readStateFile(config, "plan.md");
  const task = await readStateFile(config, "task.md");
  return stableContentHash(`spec.md\0${spec}\0plan.md\0${plan}\0task.md\0${task}`);
}

export function formatCanonicalGoalList(goals) {
  return goals.map((goal) => `- ${goal.canonicalId}: ${goal.displayText}`).join("\n");
}

export function canonicalGoalLintShouldBlock(sourceKind) {
  return ["spec_requirements", "slice_task_scope", "explicit_section"].includes(sourceKind);
}

export function lintCanonicalGoals(goals) {
  const issues = [];
  const subjectRequirements = new Map();
  const evidenceCitationRe = /\b[\w./-]+\.[a-z0-9]+:\d+\b/i;
  const quotedSubjectRe = /`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'/g;

  for (const candidate of goals) {
    const text = candidate.displayText.trim();
    if (evidenceCitationRe.test(text)) {
      issues.push(`${candidate.canonicalId} contains a file:line evidence citation and should move to supporting detail instead of staying a canonical acceptance goal: ${text}`);
    }

    const polarity = goalRequirementPolarity(text);
    if (!polarity) {
      continue;
    }

    for (const subject of lintSubjectsForGoal(text, quotedSubjectRe)) {
      const existing = subjectRequirements.get(subject) ?? [];
      subjectRequirements.set(subject, [...existing, { polarity, goalId: candidate.canonicalId }]);
    }
  }

  for (const [subject, requirements] of subjectRequirements.entries()) {
    const positiveIds = requirements
      .filter((requirement) => requirement.polarity === "positive")
      .map((requirement) => requirement.goalId);
    const negativeIds = requirements
      .filter((requirement) => requirement.polarity === "negative")
      .map((requirement) => requirement.goalId);
    if (positiveIds.length > 0 && negativeIds.length > 0) {
      issues.push(`Canonical goals contradict each other for \`${subject}\`: positive requirements in ${positiveIds.join(", ")} conflict with negative requirements in ${negativeIds.join(", ")}`);
    }
  }

  return uniqueAliases(issues).sort();
}

export function normalizeGoalAlias(value) {
  let normalized = String(value ?? "").trim().replaceAll("**", "").replaceAll("`", "").replaceAll("*", "");
  while (normalized) {
    const trimmed = normalized.trim();
    const withoutPrefix = stripKnownPlanRefPrefix(trimmed, "task.md") ?? stripKnownPlanRefPrefix(trimmed, "plan.md");
    if (withoutPrefix !== undefined) {
      normalized = withoutPrefix.trim();
      continue;
    }
    const stripped = trimmed.match(/^(?:\u00a7|:|#)\s*(.+)$/)?.[1]
      ?? trimmed.match(/^"(.+)"$/)?.[1]
      ?? trimmed.match(/^'(.+)'$/)?.[1];
    if (!stripped) {
      normalized = trimmed;
      break;
    }
    normalized = stripped.trim();
  }
  return normalized.toLowerCase();
}

async function refreshAcceptanceGoals(config, sourceHash) {
  const extracted = await extractPlanGoalRefsWithMetadata(config);
  if (!extracted) {
    await removeStateFile(config, ACCEPTANCE_GOALS_FILENAME);
    return undefined;
  }
  const file = goalsToAcceptanceFile(config, extracted, sourceHash);
  await writeStateFile(config, ACCEPTANCE_GOALS_FILENAME, `${JSON.stringify(file, null, 2)}\n`);
  return extracted;
}

async function extractPlanGoalRefsWithMetadata(config) {
  const taskScopeGoals = extractSliceTaskScopeGoalRefsFromContent(await readStateFile(config, "tasks.md"));
  if (taskScopeGoals) {
    return extractedCanonicalGoals(taskScopeGoals, "slice_task_scope");
  }

  const specGoals = extractSpecRequirementGoalRefsFromContent(await readStateFile(config, "spec.md"));
  if (specGoals) {
    return extractedCanonicalGoals(specGoals, "spec_requirements");
  }

  const plan = await readStateFile(config, "plan.md");
  const planExplicit = extractExplicitCanonicalGoalRefsFromContent(plan);
  if (planExplicit) {
    return extractedCanonicalGoals(planExplicit, "explicit_section");
  }
  const planHeuristic = extractHeuristicPlanGoalRefsFromContent(plan);
  if (planHeuristic) {
    return extractedCanonicalGoals(planHeuristic, "plan_heuristic_fallback");
  }

  const task = await readStateFile(config, "task.md");
  const embeddedPlan = extractEmbeddedPlanSection(task);
  if (embeddedPlan) {
    const embeddedExplicit = extractExplicitCanonicalGoalRefsFromContent(embeddedPlan);
    if (embeddedExplicit) {
      return extractedCanonicalGoals(embeddedExplicit, "explicit_section");
    }
    const embeddedHeuristic = extractHeuristicPlanGoalRefsFromContent(embeddedPlan);
    if (embeddedHeuristic) {
      return extractedCanonicalGoals(embeddedHeuristic, "embedded_task_plan_heuristic_fallback");
    }
  }

  const taskExplicit = extractExplicitCanonicalGoalRefsFromContent(task);
  if (taskExplicit) {
    return extractedCanonicalGoals(taskExplicit, "explicit_section");
  }
  const taskSummary = extractTaskSummaryGoalRefsFromContent(task);
  if (taskSummary) {
    return extractedCanonicalGoals(taskSummary, "task_heuristic_fallback");
  }
  const taskHeuristic = extractHeuristicPlanGoalRefsFromContent(task);
  return taskHeuristic ? extractedCanonicalGoals(taskHeuristic, "task_heuristic_fallback") : undefined;
}

function extractedCanonicalGoals(goals, sourceKind) {
  return {
    goals,
    sourceKind,
    sourceWarning: SOURCE_WARNINGS[sourceKind],
    lintIssues: lintCanonicalGoals(goals),
  };
}

function parseAcceptanceGoalsFile(raw) {
  if (!raw.trim()) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function cachedAcceptanceGoalsAreFresh(config, file, expectedHash) {
  if (
    file.schema_version !== ACCEPTANCE_GOALS_SCHEMA_VERSION
    || file.source_hash !== expectedHash
    || !Array.isArray(file.goals)
    || file.goals.length === 0
  ) {
    return false;
  }
  if (file.source_kind === "spec_requirements" && extractSliceTaskScopeGoalRefsFromContent(await readStateFile(config, "tasks.md"))) {
    return false;
  }
  return true;
}

function goalsToAcceptanceFile(config, extracted, sourceHash) {
  return {
    schema_version: ACCEPTANCE_GOALS_SCHEMA_VERSION,
    source_hash: sourceHash,
    generated_at: (config.now ? config.now() : new Date()).toISOString(),
    source_kind: extracted.sourceKind,
    source_warning: extracted.sourceWarning ?? null,
    lint_issues: extracted.lintIssues,
    goals: extracted.goals.map((goal) => ({
      id: goal.canonicalId,
      display_text: goal.displayText,
      aliases: goal.aliases,
    })),
  };
}

function goalsFromAcceptanceFile(file) {
  const goals = file.goals.map((goal) => ({
    canonicalId: goal.id,
    displayText: goal.display_text,
    aliases: Array.isArray(goal.aliases) ? goal.aliases : [],
  }));
  return {
    goals,
    sourceKind: file.source_kind,
    sourceWarning: typeof file.source_warning === "string" ? file.source_warning : undefined,
    lintIssues: lintCanonicalGoals(goals),
  };
}

function goalRequirementPolarity(text) {
  const normalized = normalizeGoalAlias(text);
  const strongNegativePatterns = [
    "must not exist",
    "should not exist",
    "does not exist",
    "do not exist",
    "must not emit",
    "must not be emitted",
    "should not be emitted",
    "zero test modifications allowed",
    "no test modifications",
    "zero test changes",
    "no test changes",
    "must not change",
    "must not modify",
    "must be absent",
    "should be absent",
  ];
  if (strongNegativePatterns.some((pattern) => normalized.includes(pattern))) {
    return "negative";
  }
  if (goalIsPositiveTestCoverageRequirement(normalized)) {
    return "positive";
  }
  if (normalized.includes("forbidden")) {
    return "negative";
  }
  const positivePatterns = [
    "must exist",
    "should exist",
    "must be emitted",
    "should be emitted",
    " be emitted",
    " emits ",
    " emit ",
    "must include",
    "should include",
  ];
  if (positivePatterns.some((pattern) => normalized.includes(pattern))) {
    return "positive";
  }
  if (normalized.includes("test") && ["add", "update", "modify", "change", "cover"].some((verb) => normalized.includes(verb))) {
    return "positive";
  }
  return undefined;
}

function goalIsPositiveTestCoverageRequirement(normalized) {
  return normalized.includes("test")
    && (
      ["add ", "create ", "update ", "modify ", "change "].some((verb) => normalized.startsWith(verb))
      || normalized.includes(" covering ")
      || normalized.includes(" coverage ")
    );
}

function lintSubjectsForGoal(text, quotedSubjectRe) {
  const subjects = [];
  for (const match of text.matchAll(quotedSubjectRe)) {
    const subject = match.slice(1).find((value) => typeof value === "string" && value.trim());
    if (subject) {
      subjects.push(normalizeGoalAlias(subject));
    }
  }
  const normalized = normalizeGoalAlias(text);
  if (normalized.includes("test")) {
    subjects.push("tests");
  }
  return uniqueAliases(subjects).sort();
}

function stableContentHash(content) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(content, "utf8")) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function extractSpecRequirementGoalRefsFromContent(content) {
  if (!String(content ?? "").trim()) {
    return undefined;
  }
  const reqRe = /\b(REQ-\d{3})\b/i;
  const seen = new Set();
  const goals = [];
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = reqRe.exec(trimmed);
    if (!match) {
      continue;
    }
    const canonicalId = match[1].toUpperCase();
    if (seen.has(canonicalId)) {
      continue;
    }
    seen.add(canonicalId);
    const text = trimmed
      .replace(reqRe, "")
      .trim()
      .replace(/^[-*:.)\s]+/, "")
      .trim();
    const displayText = text || trimmed;
    goals.push(goal(canonicalId, displayText, [canonicalId, displayText]));
  }
  return goals.length > 0 ? goals : undefined;
}

function extractSliceTaskScopeGoalRefsFromContent(content) {
  return extractInlineCoveredRequirementsGoalRefsFromContent(content) ?? extractSectionCoveredRequirementGoalRefsFromContent(content);
}

function extractSectionCoveredRequirementGoalRefsFromContent(content) {
  const text = String(content ?? "");
  if (!text.toLowerCase().includes("req ids covered by this slice")) {
    return undefined;
  }
  const reqLineRe = /^\s*[-*]\s*((?:REQ|C)-\d+)\s*(?:[-\u2013\u2014:]\s*(.+))?\s*$/i;
  const goals = [];
  let inScopeSection = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inScopeSection) {
      if (trimmed.toLowerCase().includes("req ids covered by this slice")) {
        inScopeSection = true;
      }
      continue;
    }
    if (!trimmed) {
      if (goals.length > 0) {
        break;
      }
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (goals.length === 0 && lower.startsWith("subset of")) {
      continue;
    }
    if (trimmed.startsWith("#") || trimmed === "---" || lower.startsWith("conventions ") || lower.startsWith("conventions to follow")) {
      if (goals.length > 0) {
        break;
      }
      continue;
    }
    const match = reqLineRe.exec(trimmed);
    if (!match) {
      if (goals.length > 0 && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
        break;
      }
      continue;
    }
    const canonicalId = match[1].toUpperCase();
    const displayText = match[2]?.trim() || trimmed;
    goals.push(goal(canonicalId, displayText, [canonicalId, displayText]));
  }
  return goals.length > 0 ? goals : undefined;
}

function extractInlineCoveredRequirementsGoalRefsFromContent(content) {
  const coveredLineRe = /^\s*covered requirements\s*:\s*(.+)$/i;
  const reqRe = /\b((?:REQ|C)-\d+)\b(?:\s*\(([^)]*)\))?/gi;
  const seen = new Set();
  const goals = [];
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const covered = coveredLineRe.exec(line.trim());
    if (!covered) {
      continue;
    }
    for (const match of covered[1].matchAll(reqRe)) {
      const canonicalId = match[1].toUpperCase();
      if (seen.has(canonicalId)) {
        continue;
      }
      seen.add(canonicalId);
      const qualifier = match[2]?.trim();
      const displayText = qualifier ? `${canonicalId} (${qualifier})` : canonicalId;
      goals.push(goal(canonicalId, displayText, [canonicalId, displayText]));
    }
  }
  return goals.length > 0 ? goals : undefined;
}

function extractExplicitCanonicalGoalRefsFromContent(content) {
  const section = extractExplicitCanonicalGoalSection(content);
  return section ? extractHeuristicPlanGoalRefsFromContent(section) : undefined;
}

function extractExplicitCanonicalGoalSection(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("#") && strippedHeadingText(trimmed).replace(/:$/, "").toLowerCase() === "canonical acceptance goals";
  });
  if (start === -1) {
    return undefined;
  }
  const startLevel = headingLevel(lines[start]);
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("#") && headingLevel(line) <= startLevel) {
      break;
    }
    section.push(line);
  }
  const text = section.join("\n");
  return text.trim() ? text : undefined;
}

function extractEmbeddedPlanSection(taskContent) {
  const lines = String(taskContent ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) {
      return false;
    }
    const heading = strippedHeadingText(trimmed).toLowerCase();
    return heading === "plan" || heading.startsWith("plan:") || heading.startsWith("plan -");
  });
  return start === -1 ? undefined : lines.slice(start).join("\n");
}

function extractTaskSummaryGoalRefsFromContent(content) {
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^#{1,4}\s+task\b/i.test(trimmed)) {
      continue;
    }
    const heading = strippedHeadingText(trimmed);
    if (!heading) {
      continue;
    }
    const aliases = ["goal-1", heading];
    const taskNumber = /^task\s+(\d+)\b/i.exec(heading)?.[1];
    if (taskNumber) {
      aliases.push(taskNumber, `task ${taskNumber}`);
    }
    return [goal("goal-1", heading, aliases)];
  }
  return undefined;
}

function extractHeuristicPlanGoalRefsFromContent(content) {
  if (!String(content ?? "").trim()) {
    return undefined;
  }
  const lines = String(content).split(/\r?\n/);
  const goals = [];
  let inMetaSection = false;
  let inVerificationSection = false;
  const hasStepHeadings = lines.some((line) => stepHeadingMatch(line.trim()));

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const headingText = strippedHeadingText(trimmed);
      const sectionName = headingText.replace(/^[\d. ]+/, "").trim().toLowerCase();
      inVerificationSection = sectionName.startsWith("verification") || sectionName.startsWith("testing");
      inMetaSection = PLAN_META_SECTIONS.some((pattern) => sectionName.startsWith(pattern));
    }
    if (inMetaSection || !trimmed) {
      continue;
    }

    const topLevelItem = leadingWhitespaceLength(line) === 0 ? parseTopLevelListItem(trimmed) : undefined;
    if (hasStepHeadings) {
      const heading = stepHeadingMatch(trimmed);
      if (heading) {
        goals.push(goalFromHeading(heading, goals.length + 1));
      } else if (inVerificationSection && topLevelItem) {
        goals.push(goalFromListItem(topLevelItem, goals.length + 1, true));
      }
    } else if (topLevelItem) {
      goals.push(goalFromListItem(topLevelItem, goals.length + 1, inVerificationSection));
    }
  }
  return goals.length > 0 ? goals : undefined;
}

function goalFromHeading(headingRaw, index) {
  const canonicalId = `goal-${index}`;
  const aliases = [canonicalId, headingRaw];
  const goalLabel = headingRaw.match(/^(goal-\d+)\b/i)?.[1];
  if (goalLabel) {
    aliases.push(goalLabel);
  }
  const stepLabel = headingRaw.match(/^(step\s+\d+)\b/i)?.[1];
  if (stepLabel) {
    aliases.push(stepLabel);
  }
  const numbered = headingRaw.match(/^(\d+)(?:[.\-\u2013\u2014:\s]+)(.+)$/);
  if (numbered) {
    aliases.push(numbered[1], `${numbered[1]}.`, numbered[2].trim());
  }
  const stripped = headingRaw
    .replace(/^goal-\d+\s*[-\u2013\u2014:]\s*/i, "")
    .replace(/^step\s+\d+\s*[-\u2013\u2014:]?\s*/i, "")
    .replace(/^\d+(?:[.\-\u2013\u2014:\s]+)\s*/, "")
    .trim();
  if (stripped) {
    aliases.push(stripped);
  }
  return goal(canonicalId, headingRaw, aliases);
}

function goalFromListItem(item, index, verificationSection) {
  const canonicalId = `goal-${index}`;
  const displayText = verificationSection && item.number
    ? `Verification item ${item.number}: ${item.text}`
    : item.text;
  const aliases = [canonicalId, item.text, displayText];
  if (item.number) {
    aliases.push(item.number, `${item.number}. ${item.text}`);
  }
  return goal(canonicalId, displayText, aliases);
}

function goal(canonicalId, displayText, aliases) {
  return {
    canonicalId,
    displayText,
    aliases: uniqueAliases(aliases.map((alias) => normalizeGoalAlias(alias))),
  };
}

function parseTopLevelListItem(trimmed) {
  const bullet = trimmed.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/);
  if (bullet?.[1]?.trim()) {
    return { number: undefined, text: bullet[1].trim() };
  }
  const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numbered?.[2]?.trim()) {
    return { number: numbered[1], text: numbered[2].trim() };
  }
  return undefined;
}

function stepHeadingMatch(trimmed) {
  if (!trimmed.startsWith("#")) {
    return undefined;
  }
  const heading = strippedHeadingText(trimmed);
  return /^(goal-\d+|step\s+\d+)\b/i.test(heading) || /^\d+(?:[.\-\u2013\u2014:\s]+).+/.test(heading)
    ? heading
    : undefined;
}

function strippedHeadingText(line) {
  return line.replace(/^#+\s*/, "").trim();
}

function headingLevel(line) {
  return line.trim().match(/^#+/)?.[0].length ?? 0;
}

function leadingWhitespaceLength(line) {
  return line.length - line.trimStart().length;
}

function uniqueAliases(aliases) {
  return Array.from(new Set(aliases.filter(Boolean)));
}

function sameArray(left, right) {
  return Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function stripKnownPlanRefPrefix(input, prefix) {
  return input.slice(0, prefix.length).toLowerCase() === prefix
    ? input.slice(prefix.length)
    : undefined;
}
