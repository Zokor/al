# Supported TOML Subset

`src/config/toml.js` implements a deliberately small TOML subset — just enough to read
`.agent-loop.toml` files written for the Rust CLI. It is not a general-purpose TOML parser.

## Supported

- Tables: `[section]` and dotted table headers such as `[models.codex.plan]`.
- Array-of-tables headers: `[[entry]]` (top-level keys only).
- Key/value assignments with bare keys (`[A-Za-z0-9_-]+`).
- Basic strings: double-quoted, single-line, with `\"` and other JSON-style escapes.
- Integers: `42`, `-7`.
- Floats: `3.5`, `-0.25` (decimal-point form only).
- Booleans: `true`, `false`.
- Single-line arrays: `["a", "b"]`, including quoted items containing commas and `\"` escapes.
- Inline comments: `key = "value" # comment` (a `#` inside a quoted string is preserved).

## Not supported

- Multi-line strings (`"""..."""` and `'''...'''`).
- Literal single-quoted strings (`'value'`).
- Dotted keys inline (`a.b = 1`); use table headers instead.
- Dates and times.
- Inline tables (`{ key = value }`).
- Multi-line arrays (an array must open and close on one line).
- Exponent (`1e6`) and underscore (`1_000`) numeric forms; these are kept as raw strings.

Unrecognized values fall through and are returned as raw strings; lines that do not match a
table header or `key = value` assignment are ignored.
