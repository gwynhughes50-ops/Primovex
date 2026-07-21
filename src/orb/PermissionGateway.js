import { hasCapability } from '@/core/identity/capabilities';
import { redactOperationalData } from './OrbDataFabric';

export class PermissionGateway {
  canAccess(requiredCapability, context = {}) {
    if (!requiredCapability) return true;
    return hasCapability(context.capabilities || [], requiredCapability);
  }

  filterResponse(response = {}, context = {}) {
    const canSeeNamedAudit = this.canAccess('audit.read', context) || this.canAccess('users.manage', context) || this.canAccess('practiceAdmin.write', context);
    const withheld = [...(response.withheld || [])];
    const sources = (response.sources || []).map((item) => {
      if (canSeeNamedAudit || !item?.personal) return item;
      withheld.push(item.field || 'named operational detail');
      return { ...item, detail: 'Named detail withheld by Primovex permissions', personal: false };
    });
    const data = redactOperationalData(response.data, canSeeNamedAudit, withheld);
    return { ...response, data, sources, withheld: [...new Set(withheld)] };
  }
}
