import { registerApprovedReadOnlyTools } from './readOnlyTools';
import { executeApprovedTool, ToolPermissionError } from './toolExecutor';
import { routeApprovedTool } from './intentRouter';

let registered = false;

export async function runApprovedToolForPrompt(prompt, context = {}) {
  if (!registered) { registerApprovedReadOnlyTools(); registered = true; }
  const route = routeApprovedTool(prompt, { conversation: context.conversation });
  if (!route) return null;
  try {
    const result = await executeApprovedTool(route.toolId, route.input, context);
    return { ...result, intent: route.toolId };
  } catch (error) {
    if (error instanceof ToolPermissionError) {
      return {
        intent: route.toolId,
        summary: `I cannot access that operational area with your current Primovex permissions.`,
        confidence: 1,
        sources: [{ title: 'Primovex permission gate', detail: `Access blocked before ${route.toolId} ran`, type: 'system' }],
        actions: [], warnings: ['Permission denied'], denied: true,
      };
    }
    throw error;
  }
}
