import { hasCapability } from '@/core/identity/capabilities';
import { getTool } from './toolRegistry';

export class ToolPermissionError extends Error {
  constructor(tool) {
    super(`You do not have permission to use ${tool.label || tool.id}.`);
    this.name = 'ToolPermissionError';
    this.code = 'TOOL_PERMISSION_DENIED';
    this.toolId = tool.id;
  }
}

function normaliseResult(tool, result = {}) {
  return {
    toolId: tool.id,
    data: result.data ?? null,
    summary: String(result.summary || ''),
    confidence: Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0.8,
    sources: Array.isArray(result.sources) ? result.sources : [],
    actions: Array.isArray(result.actions) ? result.actions : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    freshness: result.freshness || null,
  };
}

export async function executeApprovedTool(id, input = {}, context = {}) {
  const tool = getTool(id);
  if (!tool) throw new Error(`Approved tool not found: ${id}`);
  if (tool.access !== 'read') throw new Error(`Write tools are disabled in this sprint: ${id}`);
  if (!hasCapability(context.capabilities || [], tool.requiredCapability)) throw new ToolPermissionError(tool);
  const result = await tool.execute(input, context);
  return normaliseResult(tool, result);
}
