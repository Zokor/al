import { readJsonStateFile, writeStateFile } from "./files.js";

export async function readJsonObjectWithRawFields(config, fileName) {
  const object = await readJsonStateFile(config, fileName);
  if (object === null) {
    return { object: {}, unknownFields: [] };
  }
  if (Array.isArray(object) || typeof object !== "object") {
    throw new Error(`${fileName} must contain a JSON object`);
  }
  return { object, unknownFields: Object.keys(object) };
}

export function mergeKnownJsonFields(existingObject, knownFields, knownFieldNames) {
  const known = new Set(knownFieldNames);
  const merged = {};
  for (const [key, value] of Object.entries(existingObject ?? {})) {
    if (!known.has(key)) {
      merged[key] = value;
    }
  }
  for (const key of knownFieldNames) {
    if (Object.prototype.hasOwnProperty.call(knownFields, key) && knownFields[key] !== undefined) {
      merged[key] = knownFields[key];
    }
  }
  return merged;
}

export function mergeKnownArrayEntriesById(existingArray, knownArray, { idField, knownFieldNames }) {
  const existingById = new Map();
  for (const entry of Array.isArray(existingArray) ? existingArray : []) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, idField)) {
      existingById.set(entry[idField], entry);
    }
  }
  return knownArray.map((knownEntry) => {
    const existing = existingById.get(knownEntry[idField]) ?? {};
    return mergeKnownJsonFields(existing, knownEntry, knownFieldNames);
  });
}

export async function writeMergedJsonFile(config, fileName, knownFields, knownFieldNames) {
  const existing = (await readJsonStateFile(config, fileName)) ?? {};
  const merged = mergeKnownJsonFields(existing, knownFields, knownFieldNames);
  await writeStateFile(config, fileName, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}
