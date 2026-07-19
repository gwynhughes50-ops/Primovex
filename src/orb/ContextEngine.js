export class ContextEngine {
  build(raw = {}) {
    const profile = raw.profile || {};
    return Object.freeze({
      userId: raw.userId || null,
      role: raw.role || profile.role || 'unknown',
      capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
      siteId: raw.siteId || profile.siteId || profile.practiceId || 'primary',
      spaceId: raw.spaceId || null,
      module: raw.module || null,
      workflow: raw.workflow || null,
      device: raw.device || null,
      profile,
      conversation: Array.isArray(raw.conversation) ? raw.conversation : [],
      forcedIntent: raw.forcedIntent || null,
    });
  }
}
