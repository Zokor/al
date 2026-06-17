# TOML → JSON config conversion

Convert node-cli configuration from `.agent-loop.toml` to `.agent-loop.json`,
removing TOML from the runtime path entirely and providing a migration script.

## Tasks

- [x] `src/config/json.js`: JSON config reader — ENOENT → `{}`, invalid JSON / non-object root → hard error naming the file
- [x] `src/config/index.js`: read `.agent-loop.json`; update `.agent-loop.toml` strings in error messages and slot-profile source labels; warn on stderr when a legacy `.agent-loop.toml` is present
- [x] Delete `src/config/toml.js`
- [x] `scripts/migrate-config.js`: standalone TOML-subset → `.agent-loop.json` converter (`--force` to overwrite)
- [x] `test/config.test.js` + `test/commands.test.js`: fixtures write JSON instead of TOML
- [x] `test/toml.test.js` → `test/migrate.test.js`: parser coverage (floats, quoted commas, escapes, array-of-tables) moves to migration-script tests; add corrupt-JSON and legacy-warning tests
- [x] Docs: delete `docs/toml-subset.md`, add `docs/json-config.md` (format, example, precedence, migration)
- [x] CHANGELOG entry under [Unreleased] (repo root CHANGELOG.md)
- [x] Verify: `npm test` green, `node scripts/lint.js` clean, functional smoke with a real `.agent-loop.json`

## Review

- Runtime config now reads only `<project>/.agent-loop.json` via `src/config/json.js`
  (ENOENT → `{}`; invalid JSON / non-object root → hard error naming the file).
  `src/config/toml.js` is deleted; its subset parser moved verbatim into the standalone
  `scripts/migrate-config.js` (`node scripts/migrate-config.js [projectDir] [--force]`).
  The script has no static `src/` imports: post-conversion schema validation is loaded
  via dynamic `import()` and skipped with a `note:` when the script runs as a single
  copied file outside the package.
- `loadConfig` warns (stderr, via the existing `emitConfigWarnings` path) when a legacy
  `.agent-loop.toml` exists: a migrate hint when no JSON file is present, an "ignored"
  notice when both exist. Warnings also surface in `config.warnings`.
- Also modified: `src/main.js` (fatal config errors in `--json` mode are emitted as a
  `{"type":"error",...}` NDJSON event on stderr instead of a plain stack line) and
  `package.json` (adds the `migrate-config` npm script referenced by the docs).
- Tests: 51 → 63 passing (`node --test`); all old TOML parser assertions preserved in
  `test/migrate.test.js` plus end-to-end script runs (including a copied-out-of-package
  standalone run), and new config tests cover corrupt JSON, non-object root, and both
  legacy-TOML warnings. `node scripts/lint.js` clean. The former repo-root TOML loading
  test became a self-contained tmp-dir JSON fixture (the repo root keeps
  `.agent-loop.toml` for the Rust CLI).
- Docs: `docs/toml-subset.md` replaced by `docs/json-config.md` (format, annotated
  example, precedence, accepted-vs-acted-on keys, migration). CHANGELOG [Unreleased]
  gained a Changed entry.
