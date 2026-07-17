export function developerToolsEnabled() {
  return Boolean(
    import.meta.env.DEV ||
    import.meta.env.VITE_PRIMOVEX_DEVELOPER_TOOLS === 'true' ||
    import.meta.env.VITE_DEV_MODE === 'true'
  );
}

export function developerAccessAllowed(role) {
  return developerToolsEnabled() || role === 'System Admin';
}
