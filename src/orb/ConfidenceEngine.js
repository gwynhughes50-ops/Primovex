import { ORB_CONFIDENCE_BANDS } from './types';

export class ConfidenceEngine {
  normalise(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
  }

  band(value) {
    const confidence = this.normalise(value);
    if (confidence == null || confidence < 0.6) return ORB_CONFIDENCE_BANDS.UNSAFE;
    if (confidence < 0.8) return ORB_CONFIDENCE_BANDS.CONFIRM;
    if (confidence < 0.95) return ORB_CONFIDENCE_BANDS.HIGH;
    return ORB_CONFIDENCE_BANDS.VERY_HIGH;
  }

  requiresConfirmation(value) {
    const band = this.band(value);
    return band === ORB_CONFIDENCE_BANDS.CONFIRM || band === ORB_CONFIDENCE_BANDS.UNSAFE;
  }
}
