import { RUST_AGENT_LOOP_VERSION } from "../generated/rustVersion.js";

export function formatVersionText() {
  return `agent-loop ${RUST_AGENT_LOOP_VERSION}`;
}

export function versionEvent() {
  return {
    type: "version",
    data: {
      version: RUST_AGENT_LOOP_VERSION,
    },
  };
}

export function handleVersion({ jsonMode = false, stdout = process.stdout } = {}) {
  if (jsonMode) {
    stdout.write(`${JSON.stringify(versionEvent())}\n`);
  } else {
    stdout.write(`${formatVersionText()}\n`);
  }
  return 0;
}
