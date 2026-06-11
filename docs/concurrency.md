# Concurrency and the Single-Writer Expectation

The `.agent-loop/` state directory assumes a single writer at a time. State initialization
writes several files (`status.json`, `findings.json`, decisions, `workflow.txt`, ...) as a
sequence of atomic per-file writes (temp file + rename) without a directory-wide lock, so two
concurrent runs against the same project (or the same `--session`) can interleave and leave
mixed state.

## Wave lock awareness

The Rust CLI guards wave runs with a lock file (`.agent-loop/wave.lock`, or
`.agent-loop/wave-<session>.lock` for named sessions) containing JSON with the owning `pid`
and `started_at` timestamp (see `cli/src/wave_runtime/lock.rs`).

The Node CLI does not acquire this lock — it never runs waves — but before any state-mutating
command (the `spec`, `plan`, and `tasks` initialization shells) it checks for an existing wave
lock:

- No lock file: proceed.
- Lock owned by a dead PID, or older than the stale threshold (30 seconds, matching the Rust
  `WAVE_LOCK_STALE_SECONDS` default): treated as stale and ignored; the Rust CLI reclaims such
  locks itself.
- Lock owned by a live process, or a lock whose contents cannot be parsed: the command aborts
  with `A run is in progress (PID X). If stale, run: agent-loop reset --wave-lock`.

The Node CLI never deletes or rewrites the lock as part of this check; `agent-loop reset
--wave-lock` remains the explicit recovery path.

## Expectations

- Do not run the Node CLI's state-mutating commands while a Rust CLI run is in progress on the
  same project/session.
- Read-only commands (`status`, `next`, `resume --dry-run`) are safe to run concurrently but
  may observe partially updated state between two atomic writes.
