export const ACTION_DEFAULT_SLOTS = Object.freeze({
  plan: "planner",
  tasks: "implementer",
  implement: "implementer",
  review: "reviewer",
  discuss: "implementer",
  discover: "discoverer",
  verify: "verifier",
  debugger: "reviewer",
  compound: "implementer",
  supervisor: "planner",
});

export function defaultSlotForAction(action) {
  const slot = ACTION_DEFAULT_SLOTS[action];
  if (!slot) {
    throw new Error(`unknown action '${action}'`);
  }
  return slot;
}

export function resolveAgentForAction(config, { action, slot = defaultSlotForAction(action), role } = {}) {
  const ownerSlot = defaultSlotForAction(action);
  const providerOverride = config.actionProviders?.[action];
  const handoff = !providerOverride && slot !== ownerSlot ? config.slotProfiles?.[ownerSlot]?.profile?.handoff : undefined;
  const provider = providerOverride ?? handoff?.provider ?? providerForSlot(config, slot);
  const profileSegment = providerOverride ? undefined : slotProfileForResolution(config, { slot, ownerSlot, provider, action, handoff });
  return {
    provider,
    model: resolvedModel(config, { action, slot, provider, profileSegment }),
    effort: resolvedEffort(config, { action, provider, profileSegment }),
    slot,
    role,
  };
}

function providerForSlot(config, slot) {
  const provider = config.roles?.[slot];
  if (!provider) {
    throw new Error(`no provider configured for slot '${slot}'`);
  }
  return provider;
}

function slotProfileForResolution(config, { slot, ownerSlot, provider, handoff }) {
  if (handoff?.provider === provider) {
    return handoff;
  }
  const primary = config.slotProfiles?.[slot]?.profile?.primary;
  if (primary?.provider === provider) {
    return primary;
  }
  if (config.mode === "single-agent" && slot !== "implementer") {
    const implementerPrimary = config.slotProfiles?.implementer?.profile?.primary;
    if (implementerPrimary?.provider === provider) {
      return implementerPrimary;
    }
  }
  if (slot === ownerSlot) {
    return primary;
  }
  return undefined;
}

function lastActionOverride(config, action, field) {
  return [...(config.actionOverrides ?? [])].reverse().find((override) => override.action === action && override.field === field);
}

function resolvedModel(config, { action, provider, profileSegment }) {
  const cliOverride = lastActionOverride(config, action, "model");
  if (cliOverride) {
    return cliOverride.value;
  }
  const modelEntry = config.models?.[provider]?.[action];
  if (modelEntry && Object.hasOwn(modelEntry, "model")) {
    return modelEntry.model;
  }
  return profileSegment?.model;
}

function resolvedEffort(config, { action, provider, profileSegment }) {
  const cliOverride = lastActionOverride(config, action, "effort");
  if (cliOverride) {
    return cliOverride.value;
  }
  const modelEntry = config.models?.[provider]?.[action];
  if (modelEntry && Object.hasOwn(modelEntry, "effort")) {
    return modelEntry.effort;
  }
  return profileSegment?.effort;
}
