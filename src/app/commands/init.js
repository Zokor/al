import { stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatProjectJsonConfig } from "../../config/template.js";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function runInit(cli, context) {
  const configPath = resolve(context.cwd, ".agent-loop.json");
  if ((await exists(configPath)) && !cli.commandArgs.force) {
    context.stderr.write(`Error: ${configPath} already exists. Use --force to overwrite.\n`);
    return 1;
  }

  const legacyPath = resolve(context.cwd, ".agent-loop.toml");
  if (!(await exists(configPath)) && (await exists(legacyPath)) && !cli.commandArgs.force) {
    context.stderr.write(
      `Error: ${legacyPath} already exists. Run 'npm run migrate-config -- "${context.cwd}"' to convert it, or use --force to create a new .agent-loop.json.\n`,
    );
    return 1;
  }

  const { content, detectedLanguage } = await formatProjectJsonConfig(context.cwd);
  await writeFile(configPath, content);
  if (!cli.globals.json) {
    if (detectedLanguage) {
      context.stdout.write(`Generated .agent-loop.json (auto-detected: ${detectedLanguage} project).\n`);
    } else {
      context.stdout.write("Generated .agent-loop.json with defaults.\n");
    }
  }
  return 0;
}
