import { resolve } from "node:path";

export function validateSessionName(session) {
  if (session === undefined || session === null) {
    return undefined;
  }
  if (session === "") {
    throw new Error("Config error: Session name cannot be empty.");
  }
  const sessionLength = Buffer.byteLength(session, "utf8");
  if (sessionLength > 64) {
    throw new Error(`Config error: Session name too long (${sessionLength} chars, max 64): ${session}`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(session)) {
    throw new Error(`Config error: Invalid session name '${session}': only alphanumeric, hyphens, and underscores allowed.`);
  }
  return session;
}

export function agentLoopDir(projectDir) {
  return resolve(projectDir, ".agent-loop");
}

export function preferencesPath(projectDir) {
  return resolve(agentLoopDir(projectDir), "preferences.md");
}

export function chainPath(projectDir) {
  return resolve(agentLoopDir(projectDir), "chain.json");
}

export function stateDirForSession(projectDir, session) {
  const validated = validateSessionName(session);
  return validated
    ? resolve(agentLoopDir(projectDir), "state", validated)
    : resolve(agentLoopDir(projectDir), "state");
}

export function waveLockPathForSession(projectDir, session) {
  const validated = validateSessionName(session);
  return validated
    ? resolve(agentLoopDir(projectDir), `wave-${validated}.lock`)
    : resolve(agentLoopDir(projectDir), "wave.lock");
}

export function waveJournalPathForSession(projectDir, session) {
  const validated = validateSessionName(session);
  return validated
    ? resolve(agentLoopDir(projectDir), `wave-progress-${validated}.jsonl`)
    : resolve(agentLoopDir(projectDir), "wave-progress.jsonl");
}
