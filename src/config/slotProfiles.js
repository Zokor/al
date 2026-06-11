import { assertRegisteredProvider, PROVIDERS_WITH_EFFORT } from "./agentRegistry.js";

const VALID_EFFORTS = new Set(["minimal", "low", "medium", "high", "max", "xhigh"]);

function parseSegment(raw, slot, path) {
  const parts = raw.split("/");
  if (parts.some((part) => part === "")) {
    throw new Error(`${path}: invalid ${slot} profile has an empty segment`);
  }
  const [provider, model, effort] = parts;
  assertRegisteredProvider(provider, `${path}.${slot}`);
  if (parts.length === 1) {
    return { provider, model: undefined, effort: undefined };
  }
  if (parts.length > 3) {
    throw new Error(`${path}.${slot}: invalid profile '${raw}'`);
  }
  if (PROVIDERS_WITH_EFFORT.has(provider) && !effort) {
    throw new Error(`${path}.${slot}: provider '${provider}' requires an effort segment`);
  }
  if (effort && !VALID_EFFORTS.has(effort)) {
    throw new Error(`${path}.${slot}: unknown effort '${effort}'`);
  }
  return { provider, model, effort };
}

export function parseSlotProfile(value, slot, path = "config") {
  if (!value) {
    return undefined;
  }
  const segments = String(value).split("|");
  if (segments.length > 2) {
    throw new Error(`${path}.${slot}: invalid profile has more than one handoff separator`);
  }
  if (segments.some((segment) => segment === "")) {
    throw new Error(`${path}.${slot}: invalid profile has an empty segment`);
  }
  const primary = parseSegment(segments[0], slot, path);
  const handoff = segments[1] ? parseSegment(segments[1], slot, path) : undefined;
  return {
    provider: primary.provider,
    profile: {
      primary,
      handoff,
    },
  };
}
