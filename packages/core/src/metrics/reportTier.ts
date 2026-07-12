import type { NormalizedProfile } from '../types';
import type { CohortComparison } from './baselines';
import type { PlayerAggregate } from './playerReport';

/**
 * Report headline states, in precedence order: the platform's own flag beats
 * everything; the sample gate beats any metric talk; with a cohort comparison
 * available the tier is the calibrated normal/unusual/extreme; without one
 * (no covering baseline band) the report stays explicitly uncalibrated.
 */
export type ReportTier =
  'flagged-by-platform' | 'insufficient-sample' | 'uncalibrated' | 'normal' | 'unusual' | 'extreme';

export function reportTier(
  profile: NormalizedProfile,
  aggregate: PlayerAggregate,
  comparison?: CohortComparison,
): ReportTier {
  if (profile.banned) return 'flagged-by-platform';
  if (!aggregate.sampleOk) return 'insufficient-sample';
  return comparison?.tier ?? 'uncalibrated';
}
