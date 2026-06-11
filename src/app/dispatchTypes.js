export const DispatchKind = Object.freeze({
  ShowHelp: "ShowHelp",
  Version: "Version",
  Status: "Status",
  Reset: "Reset",
  Spec: "Spec",
  Plan: "Plan",
  Tasks: "Tasks",
  Next: "Next",
  Resume: "Resume",
  Verify: "Verify",
  Unsupported: "Unsupported",
});

const AGENT_RUNTIME_DISPATCHES = new Set([
  DispatchKind.Spec,
  DispatchKind.Plan,
  DispatchKind.Tasks,
  DispatchKind.Verify,
  DispatchKind.Unsupported,
]);

export function printsElapsedInternally(dispatch) {
  return AGENT_RUNTIME_DISPATCHES.has(dispatch.kind);
}

export function elapsedPrefersStderr(dispatch, jsonMode) {
  return Boolean(jsonMode);
}

export function needsSignalHandlers(dispatch) {
  return AGENT_RUNTIME_DISPATCHES.has(dispatch.kind);
}
