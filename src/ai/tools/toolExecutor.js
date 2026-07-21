import { hasCapability } from '@/core/identity/capabilities';
import { getTool } from './toolRegistry';
import { createDataFabricResult } from '@/orb/OrbDataFabric';

export class ToolPermissionError extends Error {
  constructor(tool) {
    super(`You do not have permission to use ${tool.label || tool.id}.`);
    this.name = 'ToolPermissionError';
    this.code = 'TOOL_PERMISSION_DENIED';
    this.toolId = tool.id;
  }
}

function normaliseResult(tool, result = {}) {
  return createDataFabricResult(tool, result);
}

export async function executeApprovedTool(id, input = {}, context = {}) {
  const tool = getTool(id);
  if (!tool) throw new Error(`Approved tool not found: ${id}`);
  if (tool.access !== 'read') throw new Error(`Write tools are disabled in this sprint: ${id}`);
  if (!hasCapability(context.capabilities || [], tool.requiredCapability)) throw new ToolPermissionError(tool);
  const result = await tool.execute(input, context);
  return normaliseResult(tool, result);
}
