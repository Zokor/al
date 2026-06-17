import { listAgents } from "../../config/agentRegistry.js";

export function runListAgents(_cli, context) {
  context.stdout.write(`${JSON.stringify(listAgents(context.env), null, 2)}\n`);
  return 0;
}
