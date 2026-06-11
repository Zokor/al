import { formatHelpText, helpEvent } from "./help.js";
import { formatVersionText, versionEvent } from "./version.js";
import { UNSUPPORTED_COMMAND_SET } from "../unsupported/commands.js";

const SUPPORTED_COMMANDS = new Set(["status", "reset", "spec", "plan", "tasks", "next", "resume", "verify", "version"]);
const POSITIONAL_COMMANDS = new Set(["spec", "plan"]);
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
    if (command === "resume" && optionName(token) === "dry-run") {
      result.dryRun = true;
      continue;
    }
    if (command === "verify" && ["resume", "manual"].includes(optionName(token))) {
      result[toCamel(optionName(token))] = true;
      continue;
    }
    throw new ParseError(`unexpected argument '${token}' for ${command}`);
  }
  validatePositionals(command, result.positional);
  return result;
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
        ? { raw: commandArgs }
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
