import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { runAgentInvocation } from "../../agent/runtime.js";
import { resolveAgentForAction } from "../../agent/resolution.js";
import { loadConfig } from "../../config/index.js";
import { appendEvent } from "../../state/events.js";
import { appendStateFile, readStateFile, safeStatePath } from "../../state/files.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { preferencesPath } from "../../state/paths.js";
import { writeStatus } from "../../state/status.js";
import { assertNoActiveWaveLock } from "../../state/waveLock.js";
import { requireResumeWorkflow } from "./phases.js";

const DISCUSS_CHALLENGER_APPROVED_SENTINEL = "DISCUSS_CHALLENGER_APPROVED";

const KIND_LABELS = Object.freeze({
  question: "Question",
  answer: "Answer",
  approval: "Approval",
});

export async function runDiscuss(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (cli.commandArgs.discover) {
    context.stderr.write("Unsupported in node-cli first pass: discuss --discover\n");
    context.stderr.write("See node-cli/docs/unsupported.md for supported first-pass behavior.\n");
    return 2;
  }

  if (cli.commandArgs.resume) {
    await requireResumeWorkflow(config, "discuss");
    await appendEvent(config, { type: "command_started", data: { command: "discuss" } });
  } else {
    await assertNoActiveWaveLock(config);
    const task = await readDiscussTask(context.cwd, cli.commandArgs);
    await resetStateDir(config);
    await appendEvent(config, { type: "command_started", data: { command: "discuss" } });
    await initializeWorkflowState(config, { task, workflow: "discuss" });
  }

  const success = await discussLoop(config, {
    stdout: context.stdout,
    stdin: context.stdin,
    runner: context.agentRunner,
    readAnswer: context.readAnswer,
    resume: Boolean(cli.commandArgs.resume),
  });
  return success ? 0 : 1;
}

async function readDiscussTask(projectDir, commandArgs) {
  if (commandArgs.file) {
    const path = resolve(projectDir, commandArgs.file);
    const content = await readFile(path, "utf8");
    if (!content.trim()) {
      throw new Error(`Task file '${commandArgs.file}' is empty.`);
    }
    return content;
  }
  if (commandArgs.task !== undefined) {
    if (!commandArgs.task.trim()) {
      throw new Error("Task cannot be empty.");
    }
    return commandArgs.task;
  }
  throw new Error("Task is required. Provide task text or --file <path>.");
}

async function discussLoop(config, options) {
  await appendLog(config, "Discussion Phase");
  let resumeNoticePending = options.resume;
  const caveats = [];
  const challengers = buildDiscussChallengers(config);
  const multiAgentDiscuss = config.discussMultiAgent && config.mode !== "single-agent" && challengers.length > 0;

  while (true) {
    const progress = await readStateFile(config, "discuss-progress.md");
    const entries = parseDiscussProgressEntries(progress);
    const currentQuestionIndex = currentDiscussQuestionIndex(entries);
    const nextQuestionIndex = Math.max(1, currentQuestionIndex + 1);
    const pendingQuestion = lastUnansweredQuestion(entries);

    if (pendingQuestion) {
      const handled = await handlePendingInput(config, pendingQuestion, options, resumeNoticePending);
      resumeNoticePending = false;
      if (handled === "abort") {
        return false;
      }
      continue;
    }

    resumeNoticePending = false;
    await writeStatus(
      { status: "DISCUSSING", round: nextQuestionIndex, reason: "Discussion in progress", workflow: "discuss" },
      config,
    );

    const draftOutcome = await routeDiscussDraft(config, {
      entries,
      currentQuestionIndex,
      nextQuestionIndex,
      multiAgentDiscuss,
      challengers,
      caveats,
      runner: options.runner,
    });
    if (draftOutcome !== "no-draft") {
      if (draftOutcome === "continue") {
        continue;
      }
      return draftOutcome === "success";
    }

    if (roundLimitReached(currentQuestionIndex, config.discussMaxRounds)) {
      caveats.push("Discussion stopped at the configured round cap before every gray area was fully resolved.");
      await appendLog(config, "Discussion max rounds reached");
      return finalizeDiscuss(config, currentQuestionIndex || 1, caveats, options.runner);
    }

    await appendLog(config, `Discussion round ${formatRound(nextQuestionIndex, config.discussMaxRounds)}`);
    const facilitatorOutcome = await runFacilitatorTurn(config, {
      progress,
      currentQuestionIndex,
      nextQuestionIndex,
      multiAgentDiscuss,
      caveats,
      runner: options.runner,
    });
    if (facilitatorOutcome === "continue") {
      continue;
    }
    return facilitatorOutcome === "success";
  }
}

async function handlePendingInput(config, question, options, resumeNoticePending) {
  await appendEvent(config, {
    type: "discuss_question",
    data: {
      question_id: `dq-${question.round}`,
      question: question.content,
      round: question.round,
    },
  });
  if (!config.jsonMode) {
    if (resumeNoticePending) {
      options.stdout.write("\n(Resuming from previous question)\n");
    }
    options.stdout.write(`\n${question.content}\n`);
    options.stdout.write("\nYour answer: ");
  }

  let answer;
  try {
    answer = (await readAnswer(options)).trim();
  } catch (error) {
    await writeStatus(
      { status: "ERROR", round: question.round, reason: `Failed to read discussion input: ${error.message ?? error}`, workflow: "discuss" },
      config,
    );
    return "abort";
  }
  if (!answer) {
    return "continue";
  }

  await appendDiscussProgress(config, question.round, "answer", "User", answer);
  await appendEvent(config, {
    type: "discuss_answer",
    data: {
      question_id: `dq-${question.round}`,
      answer,
    },
  });
  await writeStatus(
    { status: "DISCUSSING", round: question.round + 1, reason: "Discussion answer captured", workflow: "discuss" },
    config,
  );
  return "continue";
}

async function readAnswer(options) {
  if (options.readAnswer) {
    const answer = await options.readAnswer();
    if (answer === null || answer === undefined) {
      throw new Error("Discussion input ended before an answer was provided.");
    }
    return String(answer);
  }
  const input = options.stdin ?? process.stdin;
  const reader = createInterface({ input, terminal: false });
  try {
    const iterator = reader[Symbol.asyncIterator]();
    const { value, done } = await iterator.next();
    if (done) {
      throw new Error("Discussion input ended before an answer was provided.");
    }
    return value;
  } finally {
    reader.close();
  }
}

async function routeDiscussDraft(config, context) {
  if (!(await preferencesDraftExists(config))) {
    return "no-draft";
  }
  if (!context.multiAgentDiscuss) {
    await appendLog(config, "Discussion complete - preferences.md written");
    await finalizeDiscussStatus(config, "Discussion complete");
    return "success";
  }

  const challenger = activeDiscussChallenger(context.challengers, context.entries);
  if (challenger) {
    return runChallengerPass(config, { ...context, challenger });
  }

  await appendLog(config, "All challengers approved - finalizing preferences");
  return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
    ? "success"
    : "failure";
}

async function runFacilitatorTurn(config, context) {
  const prompt =
    context.currentQuestionIndex === 0
      ? await discussInitialPrompt(config)
      : await discussFollowupPrompt(config, lastAnswer(context.progress) ?? "");

  let output;
  try {
    output = (await runDiscussAgent(config, {
      slot: "implementer",
      role: "implementer",
      prompt,
      runner: context.runner,
    })).trim();
  } catch (error) {
    context.caveats.push(`Facilitator could not complete the discussion normally: ${error.message ?? error}`);
    await appendLog(config, "Facilitator failed during discussion - attempting finalization with caveats");
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  if (await preferencesDraftExists(config)) {
    if (context.multiAgentDiscuss) {
      await appendLog(config, "Facilitator produced a draft - starting challenger passes");
      return "continue";
    }
    await appendLog(config, "Discussion complete - preferences.md written");
    await finalizeDiscussStatus(config, "Discussion complete");
    return "success";
  }

  if (!output) {
    context.caveats.push("Facilitator did not produce a usable follow-up question or decision draft.");
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  await appendDiscussProgress(config, context.nextQuestionIndex, "question", "Facilitator", output);
  await writeStatus(
    { status: "AWAITING_INPUT", round: context.nextQuestionIndex, reason: "Awaiting discussion input", workflow: "discuss" },
    config,
  );
  return "continue";
}

async function runChallengerPass(config, context) {
  const challengerRound = roundLimitReached(context.currentQuestionIndex, config.discussMaxRounds)
    ? Math.max(1, context.currentQuestionIndex)
    : context.nextQuestionIndex;
  await appendLog(config, `Challenger round ${formatRound(challengerRound, config.discussMaxRounds)} (${context.challenger.actor})`);
  const priorPreferences = await readPreferences(config);

  let output;
  try {
    output = (await runDiscussAgent(config, {
      slot: context.challenger.slot,
      role: context.challenger.role,
      prompt: await discussChallengerPrompt(config, context.challenger.actor),
      runner: context.runner,
    })).trim();
  } catch (error) {
    context.caveats.push(`${context.challenger.actor} challenger failed before approving the draft: ${error.message ?? error}`);
    await appendLog(config, `${context.challenger.actor} challenger failed - falling back to facilitator finalization`);
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  const restoredPreferences = await readPreferences(config);
  if (restoredPreferences !== priorPreferences) {
    await writePreferences(config, priorPreferences);
    await appendLog(config, `Restored preferences.md after ${context.challenger.actor} challenger attempted to edit it`);
  }

  if (output === DISCUSS_CHALLENGER_APPROVED_SENTINEL) {
    await appendDiscussProgress(config, Math.max(1, context.currentQuestionIndex), "approval", context.challenger.actor, output);
    await appendLog(config, `${context.challenger.actor} challenger approved the draft`);
    return "continue";
  }

  if (!output) {
    context.caveats.push(`${context.challenger.actor} challenger did not approve or ask a usable follow-up question.`);
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  if (isRepeatedChallengerQuestion(context.entries, output)) {
    context.caveats.push(`${context.challenger.actor} challenger repeated an earlier follow-up question instead of resolving remaining uncertainty.`);
    await appendLog(config, "Repeated challenger question detected - switching to facilitator finalization");
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  if (roundLimitReached(context.currentQuestionIndex, config.discussMaxRounds)) {
    context.caveats.push(`Discussion stopped at the configured round cap before ${context.challenger.actor.toLowerCase()} finished its challenge pass.`);
    return (await finalizeDiscuss(config, Math.max(1, context.currentQuestionIndex), context.caveats, context.runner))
      ? "success"
      : "failure";
  }

  await appendDiscussProgress(config, context.nextQuestionIndex, "question", context.challenger.actor, output);
  await writeStatus(
    { status: "AWAITING_INPUT", round: context.nextQuestionIndex, reason: "Awaiting discussion input", workflow: "discuss" },
    config,
  );
  return "continue";
}

async function finalizeDiscuss(config, round, caveats, runner) {
  const prompt = await discussFinalizePrompt(config, caveats);
  const priorPreferences = await readPreferences(config);
  let output;
  try {
    output = await runDiscussAgent(config, {
      slot: "implementer",
      role: "implementer",
      prompt,
      runner,
    });
  } catch (error) {
    await writeStatus(
      { status: "ERROR", round, reason: `Discussion finalization failed: ${error.message ?? error}`, workflow: "discuss" },
      config,
    );
    return false;
  }

  const existing = await readPreferences(config);
  const finalContent = existing !== priorPreferences ? existing : output.trim() ? output : existing;
  if (!finalContent.trim()) {
    await writeStatus(
      { status: "ERROR", round, reason: "Discussion finalization did not produce preferences.md", workflow: "discuss" },
      config,
    );
    return false;
  }

  await writePreferences(config, appendCaveats(finalContent.trim(), caveats));
  await finalizeDiscussStatus(config, caveats.length ? "Discussion complete with caveats" : "Discussion complete");
  return true;
}

async function finalizeDiscussStatus(config, reason) {
  await writeStatus({ status: "CONSENSUS", reason, workflow: "discuss" }, config);
}

async function runDiscussAgent(config, { slot, role, prompt, runner }) {
  const result = await runAgentInvocation(
    {
      config,
      action: "discuss",
      slot,
      role,
      prompt,
    },
    { runner },
  );
  return result.output;
}

function buildDiscussChallengers(config) {
  const seen = new Set();
  const implementer = resolveAgentForAction(config, { action: "discuss", slot: "implementer", role: "implementer" });
  seen.add(agentIdentity(implementer));
  return [
    { actor: "Reviewer", slot: "reviewer", role: "reviewer" },
    { actor: "Planner", slot: "planner", role: "planner" },
  ].filter((candidate) => {
    const agent = resolveAgentForAction(config, { action: "discuss", slot: candidate.slot, role: candidate.role });
    const identity = agentIdentity(agent);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function activeDiscussChallenger(challengers, entries) {
  const pending = lastUnansweredQuestion(entries);
  if (pending) {
    return challengers.find((challenger) => challenger.actor === pending.actor);
  }
  const approved = new Set(entries.filter((entry) => entry.kind === "Approval").map((entry) => entry.actor));
  return challengers.find((challenger) => !approved.has(challenger.actor));
}

function agentIdentity(agent) {
  return `${agent.provider}\0${agent.model ?? ""}`;
}

function parseDiscussProgressEntries(progress) {
  const entries = [];
  let current;
  let content = [];
  for (const line of progress.split(/\r?\n/)) {
    const header = parseDiscussHeader(line);
    if (header) {
      if (current) {
        entries.push({ ...current, content: content.join("\n").trim() });
      }
      current = header;
      content = [];
      continue;
    }
    if (current) {
      content.push(line);
    }
  }
  if (current) {
    entries.push({ ...current, content: content.join("\n").trim() });
  }
  return entries;
}

function parseDiscussHeader(line) {
  const match = line.match(/^### Round (\d+) — ([^(]+?)(?: \(([^)]+)\))?$/);
  if (!match) {
    return undefined;
  }
  return {
    round: Number.parseInt(match[1], 10),
    kind: match[2].trim(),
    actor: match[3]?.trim() ?? actorFromKind(match[2].trim()),
  };
}

function actorFromKind(kind) {
  if (kind === "Question") {
    return "Facilitator";
  }
  if (kind === "Answer") {
    return "User";
  }
  return "Unknown";
}

function currentDiscussQuestionIndex(entries) {
  return entries
    .filter((entry) => entry.kind === "Question")
    .reduce((max, entry) => Math.max(max, entry.round), 0);
}

function lastUnansweredQuestion(entries) {
  let pending;
  for (const entry of entries) {
    if (entry.kind === "Question") {
      pending = entry;
    } else if (entry.kind === "Answer") {
      pending = undefined;
    }
  }
  return pending?.content ? pending : undefined;
}

function lastAnswer(progress) {
  return parseDiscussProgressEntries(progress)
    .reverse()
    .find((entry) => entry.kind === "Answer" && entry.content)?.content;
}

function isRepeatedChallengerQuestion(entries, question) {
  const normalized = normalizeQuestion(question);
  if (!normalized) {
    return false;
  }
  return entries.some(
    (entry) =>
      ["Reviewer", "Planner"].includes(entry.actor) &&
      entry.kind === "Question" &&
      normalizeQuestion(entry.content) === normalized,
  );
}

function normalizeQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function appendDiscussProgress(config, round, kind, actor, content) {
  const label = KIND_LABELS[kind] ?? kind;
  const suffix = actor.trim() ? ` (${actor.trim()})` : "";
  await appendStateFile(config, "discuss-progress.md", `### Round ${round} — ${label}${suffix}\n${content}\n\n`);
}

async function readPreferences(config) {
  try {
    return await readFile(preferencesPath(config.projectDir), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writePreferences(config, content) {
  const path = preferencesPath(config.projectDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function preferencesDraftExists(config) {
  return Boolean((await readPreferences(config)).trim());
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}

function roundLimitReached(round, maxRounds) {
  return Number.isInteger(maxRounds) && maxRounds > 0 && round >= maxRounds;
}

function formatRound(round, maxRounds) {
  return maxRounds > 0 ? `${round}/${maxRounds}` : String(round);
}

function appendCaveats(content, caveats) {
  if (!caveats.length) {
    return content;
  }
  let output = content.trimEnd();
  if (output) {
    output += "\n\n";
  }
  if (!output.includes("## Caveats")) {
    output += "## Caveats\n";
  }
  for (const caveat of caveats) {
    const bullet = `- ${caveat.trim()}`;
    if (!output.includes(bullet)) {
      output += `${bullet}\n`;
    }
  }
  return output;
}

async function discussInitialPrompt(config) {
  const paths = phasePaths(config);
  return `Read the task from ${paths.taskMd}.\n\nYou are facilitating a requirements discussion. Your goal is to identify 3-7 gray areas, ambiguities, or important design decisions that should be clarified before planning begins.\n\nAsk ONE question at a time. Be specific and provide context for why the question matters. After the user answers, ask the next question or, if all key decisions have been made, write the agreed decisions to ${paths.preferencesMd} as a markdown list of locked decisions.${await discoveryReferenceSection(config)}\n\nStart by asking your first question now.`;
}

async function discussFollowupPrompt(config, userAnswer) {
  const paths = phasePaths(config);
  const history = (await readStateFile(config, "discuss-progress.md")) || "(no prior history)";
  return `Discussion history so far:\n${history}\n\nThe user's latest answer: ${userAnswer}\n\n${await discoveryReferenceSection(config)}\n\nBased on this answer, either:\n1. Ask your next question (if there are remaining gray areas), or\n2. If all key decisions have been made, write the agreed decisions to ${paths.preferencesMd} as a markdown list of locked decisions and say "All decisions captured."\n\nRemember: ask only ONE question at a time.`;
}

async function discussChallengerPrompt(config, actorLabel) {
  const paths = phasePaths(config);
  return `Read the task from ${paths.taskMd}.\nRead the current draft decisions from ${paths.preferencesMd}.\nRead the full discussion history from ${paths.discussProgressMd}.\n\nYou are the ${actorLabel} challenger in a multi-agent requirements discussion. ${paths.discussProgressMd} is the source of truth for the raw exchange history; ${paths.preferencesMd} is only the current draft summary. Do NOT edit repository files and do NOT rewrite ${paths.preferencesMd} yourself.${await discoveryReferenceSection(config)}\n\nDecide whether the current draft is complete from your perspective.\n\nYou must do exactly one of these two things:\n1. If you approve the current draft, reply with this exact phrase and nothing else: ${DISCUSS_CHALLENGER_APPROVED_SENTINEL}\n2. Otherwise, ask exactly one direct user-facing follow-up question.\n\nDo not ask multiple questions. Do not provide commentary before or after the question.`;
}

async function discussFinalizePrompt(config, caveats) {
  const paths = phasePaths(config);
  const caveatsSection = caveats.length
    ? `\n\nUnresolved caveats that must be reflected in the final draft:\n${caveats.map((item) => `- ${item}`).join("\n")}\nInclude an explicit \`## Caveats\` section in ${paths.preferencesMd} covering these gaps.`
    : "";
  return `Read the task from ${paths.taskMd}.\nRead the current draft from ${paths.preferencesMd}.\nRead the full discussion history from ${paths.discussProgressMd}.${await discoveryReferenceSection(config)}${caveatsSection}\n\nRewrite ${paths.preferencesMd} from scratch so it reflects the full discussion, including every resolved answer from the transcript.\nThe final file should be a concise markdown summary of locked decisions.\nIf there are unresolved gaps or validation questions, include a \`## Caveats\` section with bullet points.\nDo not ask another question. Your job is to finalize the decision summary now.`;
}

async function discoveryReferenceSection(config) {
  const content = await readStateFile(config, "discovery.md");
  if (!content.trim()) {
    return "";
  }
  return `\n\nA prior discovery prepass is available at ${phasePaths(config).discoveryMd}. Read it before deciding what to ask next.\n\nDiscovery summary:\n${content}`;
}

function phasePaths(config) {
  return {
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    discoveryMd: displayPath(config, safeStatePath(config, "discovery.md")),
    preferencesMd: displayPath(config, preferencesPath(config.projectDir)),
    discussProgressMd: displayPath(config, safeStatePath(config, "discuss-progress.md")),
  };
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}
