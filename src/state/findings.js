import { readJsonStateFile, writeStateFile } from "./files.js";
import { mergeKnownArrayEntriesById, mergeKnownJsonFields } from "./json.js";

export const FINDINGS_KNOWN_FIELDS = ["round", "findings"];
export const FINDING_ENTRY_KNOWN_FIELDS = ["id", "severity", "summary", "file_refs"];

export async function writeFindings(findings, config) {
  const existing = (await readJsonStateFile(config, "findings.json")) ?? {};
  const normalized = {
    round: findings.round ?? 0,
    findings: mergeKnownArrayEntriesById(existing.findings, findings.findings ?? [], {
      idField: "id",
      knownFieldNames: FINDING_ENTRY_KNOWN_FIELDS,
    }),
  };
  const merged = mergeKnownJsonFields(existing, normalized, FINDINGS_KNOWN_FIELDS);
  await writeStateFile(config, "findings.json", `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}
