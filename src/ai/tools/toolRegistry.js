const tools = new Map();

export function registerTool(tool) {
  if (!tool?.id || typeof tool.execute !== 'function') throw new Error('Approved tool requires an id and execute function.');
  tools.set(tool.id, Object.freeze({ access: 'read', requiredCapability: null, ...tool }));
  return tool;
}

export function getTool(id) {
  return tools.get(id) || null;
}

export function listTools() {
  return Array.from(tools.values());
}

export function clearToolsForTests() {
  tools.clear();
}
