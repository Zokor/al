import { resolve } from "node:path";

export function validateSessionName(session) {
  if (session === undefined || session === null || session === "") {
    return undefined;
  }
  if (session.length > 64) {
    throw new Error("invalid session name: must be at most 64 characters");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(session)) {
    throw new Error("invalid session name: use ASCII letters, numbers, hyphen, or underscore only");
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
