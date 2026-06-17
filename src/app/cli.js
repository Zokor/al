import { formatHelpText, helpEvent } from "./help.js";
import { formatVersionText, versionEvent } from "./version.js";
import { UNSUPPORTED_COMMAND_SET } from "../unsupported/commands.js";
import { COMPLETION_SHELLS } from "./completionSurface.js";
import { PIPELINE_ALIAS_DEFINITIONS } from "./pipelineAliases.js";

const SUPPORTED_COMMANDS = new Set(["status", "reset", "spec", "analyze-coverage", "plan", "tasks", "next", "resume", "verify", "discuss", "implement", "implement-verify", "review", "inline", "chain", "goal", "queue", "version", "list-agents", "init", "completions", "approve", "reject"]);
const POSITIONAL_COMMANDS = new Set(["spec", "plan", "review", "goal", "queue", "approve", "reject"]);
const GOAL_LIFECYCLE_COMMANDS = new Set(["status", "pause", "resume", "clear"]);
const QUEUE_COMMANDS = new Set(["add", "list", "status", "pause", "resume", "cancel"]);
const BOOLEAN_GLOBALS = new Set([
  "new-context",
  "json",
  "require-plan-approval",
  "no-plan-approval",
  "simple",
]);
const VALUE_GLOBALS = new Set(["session", "requirements-workflow", "implementer", "reviewer"]);
const ACTIONS = new Set(["plan", "tasks", "implement", "review", "discuss", "discover", "verify", "debugger", "compound", "supervisor"]);
const EFFORTS = new Set(["minimal", "low", "medium", "high", "max", "xhigh"]);
const BOOLEAN_IMPLEMENT_FLAGS = new Set(["per-task", "wave", "continue-on-fail", "fail-fast"]);
const VALUE_IMPLEMENT_FLAGS = new Set(["max-retries", "round-step", "max-parallel"]);
const SPECIFIC_ACTION_FLAGS = new Map([
  ["plan-model", ["plan", "model"]],
  ["tasks-model", ["tasks", "model"]],
  ["implement-model", ["implement", "model"]],
  ["review-model", ["review", "model"]],
  ["discuss-model", ["discuss", "model"]],
  ["discover-model", ["discover", "model"]],
  ["verify-model", ["verify", "model"]],
  ["debugger-model", ["debugger", "model"]],
  ["compound-model", ["compound", "model"]],
  ["plan-effort", ["plan", "effort"]],
  ["tasks-effort", ["tasks", "effort"]],
  ["implement-effort", ["implement", "effort"]],
  ["review-effort", ["review", "effort"]],
  ["discuss-effort", ["discuss", "effort"]],
  ["discover-effort", ["discover", "effort"]],
  ["verify-effort", ["verify", "effort"]],
  ["debugger-effort", ["debugger", "effort"]],
  ["compound-effort", ["compound", "effort"]],
]);

class ParseError extends Error {}

function optionName(token) {
  return token.startsWith("--") ? token.slice(2).split("=")[0] : token;
}

function splitOption(token) {
  const withoutPrefix = token.slice(2);
  const index = withoutPrefix.indexOf("=");
  if (index === -1) {
    return [withoutPrefix, undefined];
  }
  return [withoutPrefix.slice(0, index), withoutPrefix.slice(index + 1)];
}

function takeOptionValue(argv, index, inlineValue, name) {
  if (inlineValue !== undefined) {
    return [inlineValue, index];
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new ParseError(`missing value for --${name}`);
  }
  return [value, index + 1];
}

function takeManyOptionValues(argv, index, inlineValue, name) {
  const values = [];
  let nextIndex = index;
  if (inlineValue !== undefined) {
    values.push(inlineValue);
  }
  while (nextIndex + 1 < argv.length && !argv[nextIndex + 1].startsWith("-")) {
    values.push(argv[nextIndex + 1]);
    nextIndex += 1;
  }
  if (values.length === 0) {
    throw new ParseError(`missing value for --${name}`);
  }
  return [values, nextIndex];
}

function parseGenericActionValue(raw, flag) {
  const separator = raw.indexOf("=");
  if (separator === -1) {
    throw new ParseError(`invalid --${flag} value '${raw}': expected ACTION=${flag.endsWith("model") ? "MODEL" : "EFFORT"}`);
  }
  const action = raw.slice(0, separator);
  const value = raw.slice(separator + 1);
  if (!ACTIONS.has(action)) {
    throw new ParseError(`unknown action '${action}': expected one of ${Array.from(ACTIONS).join(", ")}`);
  }
  return [action, value];
}

function validateEffort(value) {
  if (!EFFORTS.has(value)) {
    throw new ParseError(`unknown effort level '${value}': expected one of ${Array.from(EFFORTS).join(", ")}`);
  }
}

function parseGlobal(argv, index, globals) {
  const token = argv[index];
  if (!token.startsWith("--")) {
    return null;
  }
  const [name, inlineValue] = splitOption(token);
  if (BOOLEAN_GLOBALS.has(name)) {
    if (inlineValue !== undefined) {
      throw new ParseError(`unexpected value for --${name}`);
    }
    globals[name] = true;
    return index;
  }
  if (VALUE_GLOBALS.has(name)) {
    const [value, nextIndex] = takeOptionValue(argv, index, inlineValue, name);
    globals[toCamel(name)] = value;
    return nextIndex;
  }
  if (SPECIFIC_ACTION_FLAGS.has(name)) {
    const [action, field] = SPECIFIC_ACTION_FLAGS.get(name);
    const [value, nextIndex] = takeOptionValue(argv, index, inlineValue, name);
    if (field === "effort") {
      validateEffort(value);
    }
    globals.actionOverrides.push({ action, field, value, argvIndex: index });
    return nextIndex;
  }
  if (name === "action-model" || name === "action-effort") {
    const [value, nextIndex] = takeOptionValue(argv, index, inlineValue, name);
    const field = name === "action-model" ? "model" : "effort";
    const [action, parsedValue] = parseGenericActionValue(value, name);
    if (field === "effort") {
      validateEffort(parsedValue);
    }
    globals.actionOverrides.push({ action, field, value: parsedValue, argvIndex: index });
    return nextIndex;
  }
  return null;
}

function toCamel(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function emptyGlobals() {
  return {
    session: undefined,
    newContext: false,
    json: false,
    requirePlanApproval: false,
    noPlanApproval: false,
    simple: false,
    requirementsWorkflow: undefined,
    implementer: undefined,
    reviewer: undefined,
    actionOverrides: [],
  };
}

function normalizeGlobals(globals) {
  globals.newContext = Boolean(globals["new-context"] || globals.newContext);
  globals.requirePlanApproval = Boolean(globals["require-plan-approval"] || globals.requirePlanApproval);
  globals.noPlanApproval = Boolean(globals["no-plan-approval"] || globals.noPlanApproval);
  globals.json = Boolean(globals.json);
  globals.simple = Boolean(globals.simple);
  delete globals["new-context"];
  delete globals["require-plan-approval"];
  delete globals["no-plan-approval"];
  if (globals.requirePlanApproval && globals.noPlanApproval) {
    throw new ParseError("--require-plan-approval cannot be used with --no-plan-approval");
  }
  if (globals.requirementsWorkflow && !["legacy", "spec"].includes(globals.requirementsWorkflow)) {
    throw new ParseError("invalid --requirements-workflow value: expected legacy or spec");
  }
  globals.actionOverrides.sort((left, right) => left.argvIndex - right.argvIndex);
  return globals;
}

function parseCommandArgs(command, args) {
  const result = { positional: [] };
  if (isImplementCommand(command)) {
    result.flags = defaultImplementFlags();
  }
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("-")) {
      result.positional.push(token);
      continue;
    }
    if (["spec", "plan"].includes(command) && ["file", "discover", "resume", "single-agent"].includes(optionName(token))) {
      index = parsePhaseOption(result, args, index);
      continue;
    }
    if (command === "tasks" && ["file", "resume", "single-agent"].includes(optionName(token))) {
      index = parsePhaseOption(result, args, index);
      continue;
    }
    if (command === "reset" && optionName(token) === "wave-lock") {
      result.waveLock = true;
      continue;
    }
    if (command === "init" && optionName(token) === "force") {
      if (splitOption(token)[1] !== undefined) {
        throw new ParseError("unexpected value for --force");
      }
      result.force = true;
      continue;
    }
    if (command === "resume" && optionName(token) === "dry-run") {
      result.dryRun = true;
      continue;
    }
    if (command === "next" && ["task", "file"].includes(optionName(token))) {
      index = parseNextOption(result, args, index);
      continue;
    }
    if (command === "verify" && ["resume", "manual"].includes(optionName(token))) {
      result[toCamel(optionName(token))] = true;
      continue;
    }
    if (command === "discuss" && ["task", "file", "discover", "resume"].includes(optionName(token))) {
      index = parseDiscussOption(result, args, index);
      continue;
    }
    if (isImplementCommand(command)) {
      const implementFlagIndex = parseImplementFlag(result, args, index);
      if (implementFlagIndex !== null) {
        index = implementFlagIndex;
        continue;
      }
      if (["task", "file", "single-agent", "resume"].includes(optionName(token))) {
        index = parseImplementCommandOption(result, args, index);
        continue;
      }
    }
    if (command === "review" && ["base", "files", "file", "plan", "single-agent"].includes(optionName(token))) {
      index = parseReviewOption(result, args, index);
      continue;
    }
    if (command === "inline" && ["task", "file"].includes(optionName(token))) {
      index = parseInlineOption(result, args, index);
      continue;
    }
    if (command === "chain" && ["command", "resume"].includes(optionName(token))) {
      index = parseChainOption(result, args, index);
      continue;
    }
    if (command === "goal") {
      index = parseGoalOption(result, args, index);
      continue;
    }
    if (command === "queue") {
      index = parseQueueOption(result, args, index);
      continue;
    }
    if (command === "reject" && optionName(token) === "reason") {
      const [name, inlineValue] = splitOption(token);
      const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
      setSingleValue(result, "reason", value, "--reason");
      index = nextIndex;
      continue;
    }
    throw new ParseError(`unexpected argument '${token}' for ${command}`);
  }
  if (command === "completions") {
    if (result.positional.length !== 1) {
      throw new ParseError("missing shell for completions");
    }
    const shell = result.positional[0];
    if (!COMPLETION_SHELLS.includes(shell)) {
      throw new ParseError(`invalid value '${shell}' for completions shell; expected one of ${COMPLETION_SHELLS.join(", ")}`);
    }
    result.shell = shell;
    result.positional = [];
  }
  if (isImplementCommand(command)) {
    validateImplementCommandArgs(result);
  }
  if (command === "review") {
    validateReviewCommandArgs(result);
  }
  if (command === "chain") {
    validateChainCommandArgs(result);
  }
  if (command === "approve" || command === "reject") {
    validateApprovalCommandArgs(command, result);
  }
  if (command === "goal") {
    validateGoalCommandArgs(result);
  }
  if (command === "queue") {
    validateQueueCommandArgs(result);
  }
  validatePositionals(command, result.positional);
  return result;
}

function isImplementCommand(command) {
  return command === "implement" || command === "implement-verify";
}

function unsupportedArgSpec(command) {
  const alias = PIPELINE_ALIAS_DEFINITIONS[command];
  if (alias) {
    return {
      ...alias,
      allowDiscover: true,
      allowFile: true,
      allowResume: true,
      allowSingleAgent: Boolean(alias.implementFlags),
      allowPerTaskResume: true,
      kind: "pipelineAlias",
    };
  }
  switch (command) {
    case "implement":
      return {
        taskStyle: "option",
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        implementFlags: true,
        rejectModeWithTask: true,
        allowPerTaskResume: false,
        kind: "implement",
      };
    case "implement-verify":
      return {
        taskStyle: "option",
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        implementFlags: true,
        rejectModeWithTask: true,
        allowPerTaskResume: false,
        kind: "implementVerify",
      };
    case "plan-tasks-implement":
    case "plan-implement":
      return {
        taskStyle: "positional",
        allowDiscover: true,
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        implementFlags: true,
        requireTaskUnlessResume: true,
        allowPerTaskResume: true,
        kind: command,
      };
    case "tasks-implement":
      return {
        taskStyle: "none",
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        implementFlags: true,
        allowPerTaskResume: true,
        kind: "tasksImplement",
      };
    case "pipeline":
      return {
        taskStyle: "option",
        allowDiscover: true,
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        allowPhases: true,
        requirePhases: true,
        implementFlags: true,
        allowPerTaskResume: true,
        kind: "pipeline",
      };
    case "supervise":
      return {
        taskStyle: "positional",
        allowDiscover: true,
        allowFile: true,
        allowResume: true,
        allowSingleAgent: true,
        allowPhases: true,
        allowQueue: true,
        implementFlags: true,
        allowPerTaskResume: true,
        kind: "supervise",
      };
    default:
      return null;
  }
}

function defaultImplementFlags() {
  return {
    perTask: false,
    wave: false,
    maxRetries: 2,
    roundStep: 2,
    continueOnFail: false,
    failFast: false,
    maxParallel: undefined,
  };
}

function parseUnsignedInteger(raw, flag) {
  if (!/^\d+$/.test(raw)) {
    throw new ParseError(`invalid --${flag} value '${raw}': expected a non-negative integer`);
  }
  return Number.parseInt(raw, 10);
}

function parseSignedInteger(raw, flag) {
  if (!/^-?\d+$/.test(raw)) {
    throw new ParseError(`invalid --${flag} value '${raw}': expected an integer`);
  }
  return Number.parseInt(raw, 10);
}

function parseImplementFlag(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (BOOLEAN_IMPLEMENT_FLAGS.has(name)) {
    if (inlineValue !== undefined) {
      throw new ParseError(`unexpected value for --${name}`);
    }
    result.flags[toCamel(name)] = true;
    return index;
  }
  if (VALUE_IMPLEMENT_FLAGS.has(name)) {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    result.flags[toCamel(name)] = parseUnsignedInteger(value, name);
    return nextIndex;
  }
  return null;
}

function parseStructuredUnsupportedArgs(command, args) {
  const spec = unsupportedArgSpec(command);
  if (!spec) {
    return { raw: args };
  }

  const result = {
    raw: args,
    positional: [],
  };
  if (spec.phases) {
    result.phases = spec.phases;
  }
  if (spec.implementFlags) {
    result.flags = defaultImplementFlags();
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("-")) {
      parseUnsupportedPositional(spec, result, token, command);
      continue;
    }

    const [name, inlineValue] = splitOption(token);
    const implementFlagIndex = spec.implementFlags ? parseImplementFlag(result, args, index) : null;
    if (implementFlagIndex !== null) {
      index = implementFlagIndex;
      continue;
    }
    if (name === "task" && spec.taskStyle === "option") {
      const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
      setSingleValue(result, "task", value, "--task");
      index = nextIndex;
      continue;
    }
    if (name === "file" && spec.allowFile) {
      const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
      setSingleValue(result, "file", value, "--file");
      index = nextIndex;
      continue;
    }
    if (name === "phases" && spec.allowPhases) {
      const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
      setSingleValue(result, "phases", value, "--phases");
      index = nextIndex;
      continue;
    }
    if (name === "queue" && spec.allowQueue) {
      rejectInlineValue(name, inlineValue);
      result.queue = true;
      continue;
    }
    if (name === "discover" && spec.allowDiscover) {
      rejectInlineValue(name, inlineValue);
      result.discover = true;
      continue;
    }
    if (name === "resume" && spec.allowResume) {
      rejectInlineValue(name, inlineValue);
      result.resume = true;
      continue;
    }
    if (name === "single-agent" && spec.allowSingleAgent) {
      rejectInlineValue(name, inlineValue);
      result.singleAgent = true;
      continue;
    }
    if (name === "command" && spec.allowCommand) {
      const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
      setSingleValue(result, "command", value, "--command");
      index = nextIndex;
      continue;
    }
    throw new ParseError(`unexpected argument '${token}' for ${command}`);
  }

  validateStructuredUnsupportedArgs(command, spec, result);
  return result;
}

function parseUnsupportedPositional(spec, result, token, command) {
  if (spec.taskStyle === "files") {
    result.files ??= [];
    result.files.push(token);
    result.positional.push(token);
    return;
  }
  if (spec.taskStyle !== "positional") {
    throw new ParseError(`unexpected argument '${token}' for ${command}`);
  }
  if (result.task !== undefined) {
    throw new ParseError(`unexpected argument '${token}' for ${command}`);
  }
  result.task = token;
  result.positional.push(token);
}

function setSingleValue(result, key, value, flag) {
  if (result[key] !== undefined) {
    throw new ParseError(`${flag} cannot be provided more than once`);
  }
  result[key] = value;
}

function rejectInlineValue(name, inlineValue) {
  if (inlineValue !== undefined) {
    throw new ParseError(`unexpected value for --${name}`);
  }
}

function validateStructuredUnsupportedArgs(command, spec, result) {
  if (spec.requirePhases && !result.phases) {
    throw new ParseError("missing value for --phases");
  }
  if (result.task !== undefined && result.file !== undefined) {
    throw new ParseError("task and --file cannot be used together.");
  }
  if (result.resume && (result.task !== undefined || result.file !== undefined)) {
    throw new ParseError("--resume cannot be combined with task or --file.");
  }
  if (spec.requireTaskUnlessResume && !result.resume && result.task === undefined && result.file === undefined) {
    throw new ParseError("Task is required. Provide task text or --file <path>.");
  }
  if (spec.requireFiles && (!Array.isArray(result.files) || result.files.length === 0)) {
    throw new ParseError("Plan file is required. Provide at least one file path.");
  }
  if (spec.rejectModeWithTask && (result.task !== undefined || result.file !== undefined) && (result.flags.perTask || result.flags.wave)) {
    throw new ParseError("--per-task and --wave cannot be combined with --task or --file.");
  }
  const shouldValidateFlags = spec.kind !== "pipeline" || String(result.phases).split(",").includes("implement");
  if (result.flags && shouldValidateFlags) {
    validateImplementFlags(result.flags, { resume: Boolean(result.resume), allowPerTaskResume: spec.allowPerTaskResume });
  }
}

function validateImplementFlags(flags, { resume, allowPerTaskResume }) {
  if (flags.wave && flags.perTask) {
    throw new ParseError("--wave and --per-task cannot be used together.");
  }
  if (resume && flags.perTask && !allowPerTaskResume) {
    throw new ParseError("--per-task cannot be combined with --resume.");
  }
  if (flags.roundStep === 0) {
    throw new ParseError("--round-step must be at least 1.");
  }
  if (flags.continueOnFail && flags.failFast) {
    throw new ParseError("--continue-on-fail and --fail-fast cannot be used together.");
  }
  if (flags.maxParallel === 0) {
    throw new ParseError("--max-parallel must be at least 1.");
  }
}

function validatePositionals(command, positional) {
  if (!POSITIONAL_COMMANDS.has(command) && positional.length > 0) {
    throw new ParseError(`unexpected argument '${positional[0]}' for ${command}`);
  }
}

function parsePhaseOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "file") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    result.file = value;
    return nextIndex;
  }
  if (inlineValue !== undefined) {
    throw new ParseError(`unexpected value for --${name}`);
  }
  result[toCamel(name)] = true;
  return index;
}

function parseDiscussOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "task" || name === "file") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    result[name] = value;
    return nextIndex;
  }
  if (inlineValue !== undefined) {
    throw new ParseError(`unexpected value for --${name}`);
  }
  result[toCamel(name)] = true;
  return index;
}

function parseNextOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
  setSingleValue(result, name, value, `--${name}`);
  return nextIndex;
}

function parseImplementCommandOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "task" || name === "file") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, name, value, `--${name}`);
    return nextIndex;
  }
  if (inlineValue !== undefined) {
    throw new ParseError(`unexpected value for --${name}`);
  }
  result[toCamel(name)] = true;
  return index;
}

function parseChainOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "command") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, "command", value, "--command");
    return nextIndex;
  }
  rejectInlineValue(name, inlineValue);
  result.resume = true;
  return index;
}

function parseGoalOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "objective") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, "objectiveText", value, "--objective");
    return nextIndex;
  }
  if (name === "file") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, toCamel(name), value, `--${name}`);
    return nextIndex;
  }
  if (name === "run") {
    rejectInlineValue(name, inlineValue);
    result.run = true;
    return index;
  }
  if (name === "replace" || name === "discover" || name === "single-agent") {
    rejectInlineValue(name, inlineValue);
    result[toCamel(name)] = true;
    return index;
  }
  const implementFlagIndex = parseImplementFlagForGoal(result, args, index);
  if (implementFlagIndex !== null) {
    return implementFlagIndex;
  }
  throw new ParseError(`unexpected argument '${token}' for goal`);
}

function parseQueueOption(result, args, index) {
  const token = args[index];
  if (result.positional.length === 0) {
    throw new ParseError(`unexpected argument '${token}' for queue`);
  }
  const [name, inlineValue] = splitOption(token);
  if (name === "objective" || name === "file") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, name === "objective" ? "objectiveText" : "file", value, `--${name}`);
    return nextIndex;
  }
  if (name === "priority") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    result.priority = parseSignedInteger(value, name);
    return nextIndex;
  }
  if (name === "depends-on") {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    result.dependsOn = [...(result.dependsOn ?? []), value];
    return nextIndex;
  }
  if (name === "run") {
    rejectInlineValue(name, inlineValue);
    result.run = true;
    return index;
  }
  throw new ParseError(`unexpected argument '${token}' for queue`);
}

function parseImplementFlagForGoal(result, args, index) {
  result.flags ??= defaultImplementFlags();
  const previousFlags = result.flags;
  const nextIndex = parseImplementFlag(result, args, index);
  if (nextIndex === null) {
    if (Object.keys(previousFlags).length === Object.keys(defaultImplementFlags()).length) {
      result.flags = previousFlags;
    }
    return null;
  }
  return nextIndex;
}

function parseReviewOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  if (name === "files") {
    const [values, nextIndex] = takeManyOptionValues(args, index, inlineValue, name);
    result.files = [...(result.files ?? []), ...values];
    return nextIndex;
  }
  if (["base", "file", "plan"].includes(name)) {
    const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
    setSingleValue(result, toCamel(name), value, `--${name}`);
    return nextIndex;
  }
  if (inlineValue !== undefined) {
    throw new ParseError(`unexpected value for --${name}`);
  }
  result[toCamel(name)] = true;
  return index;
}

function parseInlineOption(result, args, index) {
  const token = args[index];
  const [name, inlineValue] = splitOption(token);
  const [value, nextIndex] = takeOptionValue(args, index, inlineValue, name);
  setSingleValue(result, name, value, `--${name}`);
  return nextIndex;
}

function validateGoalCommandArgs(result) {
  result.objectiveWords = [];
  for (const token of result.positional) {
    if (result.goalCommand === undefined && result.objectiveWords.length === 0 && GOAL_LIFECYCLE_COMMANDS.has(token)) {
      result.goalCommand = token;
      continue;
    }
    if (result.goalCommand !== undefined) {
      throw new ParseError(`unexpected argument '${token}' for goal ${result.goalCommand}`);
    }
    result.objectiveWords.push(token);
  }
  delete result.positional;
  result.positional = [];

  if (result.goalCommand === "resume") {
    return;
  } else if (result.goalCommand !== undefined && result.run !== undefined) {
    throw new ParseError(`unexpected argument '--run' for goal ${result.goalCommand}`);
  }

  if (result.flags) {
    validateImplementFlags(result.flags, { resume: false, allowPerTaskResume: true });
  }
}

function validateQueueCommandArgs(result) {
  if (result.positional.length === 0) {
    throw new ParseError("missing queue subcommand");
  }
  const [queueCommand, ...rest] = result.positional;
  if (!QUEUE_COMMANDS.has(queueCommand)) {
    throw new ParseError(`unknown queue subcommand '${queueCommand}'`);
  }
  result.queueCommand = queueCommand;
  result.positional = [];

  if (queueCommand === "add") {
    result.objectiveWords = rest;
    result.priority ??= 0;
    result.dependsOn ??= [];
    if (result.run !== undefined) {
      throw new ParseError("unexpected argument '--run' for queue add");
    }
    return;
  }

  if (["pause", "resume", "cancel"].includes(queueCommand)) {
    if (rest.length === 0) {
      throw new ParseError(`missing queue item ID for queue ${queueCommand}`);
    }
    if (rest.length > 1) {
      throw new ParseError(`unexpected argument '${rest[1]}' for queue ${queueCommand}`);
    }
    result.queueId = rest[0];
    if (queueCommand !== "resume" && result.run !== undefined) {
      throw new ParseError(`unexpected argument '--run' for queue ${queueCommand}`);
    }
    rejectQueueAddOnlyOptions(result, queueCommand);
    return;
  }

  if (rest.length > 0) {
    throw new ParseError(`unexpected argument '${rest[0]}' for queue ${queueCommand}`);
  }
  if (result.run !== undefined) {
    throw new ParseError(`unexpected argument '--run' for queue ${queueCommand}`);
  }
  rejectQueueAddOnlyOptions(result, queueCommand);
}

function rejectQueueAddOnlyOptions(result, queueCommand) {
  const disallowed = [
    ["objectiveText", "--objective"],
    ["file", "--file"],
    ["priority", "--priority"],
    ["dependsOn", "--depends-on"],
  ].find(([key]) => result[key] !== undefined);
  if (disallowed) {
    throw new ParseError(`unexpected argument '${disallowed[1]}' for queue ${queueCommand}`);
  }
}

function validateImplementCommandArgs(result) {
  if (result.task !== undefined && result.file !== undefined) {
    throw new ParseError("--task and --file cannot be used together.");
  }
  if (result.resume && (result.task !== undefined || result.file !== undefined)) {
    throw new ParseError("--resume cannot be combined with --task or --file.");
  }
  if (result.flags.perTask && (result.task !== undefined || result.file !== undefined)) {
    throw new ParseError("--per-task cannot be combined with --task or --file.");
  }
  if (result.flags.wave && (result.task !== undefined || result.file !== undefined)) {
    throw new ParseError("--wave cannot be combined with --task or --file.");
  }
  validateImplementFlags(result.flags, { resume: Boolean(result.resume), allowPerTaskResume: false });
}

function validateReviewCommandArgs(result) {
  if ((result.files ?? []).length > 0 && result.base !== undefined) {
    throw new ParseError("--files and --base cannot be used together.");
  }
  if (result.positional.length > 1) {
    throw new ParseError(`unexpected argument '${result.positional[1]}' for review`);
  }
  result.context = result.positional[0];
}

function validateChainCommandArgs(result) {
  if (result.positional.length === 0) {
    throw new ParseError("Plan file is required. Provide at least one file path.");
  }
  result.files = result.positional;
  result.positional = [];
}

function validateApprovalCommandArgs(command, result) {
  if (result.positional.length === 0) {
    throw new ParseError(`missing phase for ${command}`);
  }
  if (result.positional.length > 1) {
    throw new ParseError(`unexpected argument '${result.positional[1]}' for ${command}`);
  }
  result.phase = result.positional[0];
  if (command === "reject" && !result.reason?.trim()) {
    throw new ParseError("--reason is required when rejecting a plan");
  }
}

export function isJsonRequested(argv) {
  return argv.some((arg) => arg === "--json");
}

export function collectActionOverrides(actionOverrides) {
  return [...actionOverrides].sort((left, right) => left.argvIndex - right.argvIndex);
}

export function parseCliFrom(argv) {
  try {
    const globals = emptyGlobals();
    const commandArgs = [];
    let command = null;

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (token === "-h" || token === "--help") {
        const jsonMode = Boolean(globals.json || argv.includes("--json"));
        return {
          kind: "exit",
          code: 0,
          stdout: jsonMode ? `${JSON.stringify(helpEvent())}\n` : formatHelpText(),
        };
      }
      if (token === "-V" || token === "--version") {
        const jsonMode = Boolean(globals.json || argv.includes("--json"));
        return {
          kind: "exit",
          code: 0,
          stdout: jsonMode ? `${JSON.stringify(versionEvent())}\n` : `${formatVersionText()}\n`,
        };
      }
      const parsedGlobalIndex = parseGlobal(argv, index, globals);
      if (parsedGlobalIndex !== null) {
        index = parsedGlobalIndex;
        continue;
      }
      if (command === null && !token.startsWith("-")) {
        command = token;
        continue;
      }
      commandArgs.push(token);
    }

    normalizeGlobals(globals);

    if (command === "help") {
      return {
        kind: "exit",
        code: 0,
        stdout: globals.json ? `${JSON.stringify(helpEvent())}\n` : formatHelpText(),
      };
    }

    if (command !== null && !SUPPORTED_COMMANDS.has(command) && !UNSUPPORTED_COMMAND_SET.has(command)) {
      throw new ParseError(`unknown command '${command}'`);
    }

    const commandArgsForDispatch =
      command && UNSUPPORTED_COMMAND_SET.has(command)
        ? parseStructuredUnsupportedArgs(command, commandArgs)
        : command
          ? parseCommandArgs(command, commandArgs)
          : {};

    return {
      kind: "parsed",
      cli: {
        command,
        globals,
        commandArgs: commandArgsForDispatch,
        rawArgv: argv,
      },
    };
  } catch (error) {
    if (error instanceof ParseError) {
      return { kind: "error", code: 1, stderr: `${error.message}\n` };
    }
    throw error;
  }
}
