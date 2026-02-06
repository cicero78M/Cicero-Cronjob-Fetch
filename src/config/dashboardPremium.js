import { env } from './env.js';

const DEFAULT_ALLOWED_TIERS = ['tier1', 'tier2', 'premium_1'];

function normalizeTier(tier) {
  return typeof tier === 'string' ? tier.trim().toLowerCase() : null;
}

function unique(items = []) {
  return [...new Set(items)];
}

function parseAllowedTiers(rawValue) {
  if (Array.isArray(rawValue)) {
    return unique(rawValue.map(normalizeTier).filter(Boolean));
  }

  if (typeof rawValue === 'string') {
    return unique(
      rawValue
        .split(',')
        .map(normalizeTier)
        .filter(Boolean),
    );
  }

  return [...DEFAULT_ALLOWED_TIERS];
}

const parsedAllowedTiers = parseAllowedTiers(env.DASHBOARD_PREMIUM_ALLOWED_TIERS);

export const dashboardPremiumConfig = {
  allowedTiers: parsedAllowedTiers.length > 0 ? parsedAllowedTiers : [...DEFAULT_ALLOWED_TIERS],
  defaultAllowedTiers: [...DEFAULT_ALLOWED_TIERS],
  parseAllowedTiers,
};
