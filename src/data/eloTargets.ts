export type SkillKey =
  | "combat"
  | "opening"
  | "utility"
  | "clutch"
  | "maps";

export type EloSkillTargets = Record<SkillKey, number>;

export type EloTier = {
  elo: number;
  label: string;
  targets: EloSkillTargets;
};

export const eloTiers: EloTier[] = [
  {
    elo: 5000,
    label: "5k",
    targets: { combat: 35, opening: 35, utility: 25, clutch: 28, maps: 35 },
  },
  {
    elo: 10000,
    label: "10k",
    targets: { combat: 45, opening: 42, utility: 35, clutch: 35, maps: 45 },
  },
  {
    elo: 15000,
    label: "15k",
    targets: { combat: 52, opening: 48, utility: 45, clutch: 42, maps: 53 },
  },
  {
    elo: 20000,
    label: "20k",
    targets: { combat: 62, opening: 55, utility: 60, clutch: 50, maps: 62 },
  },
  {
    elo: 25000,
    label: "25k",
    targets: { combat: 72, opening: 60, utility: 70, clutch: 58, maps: 72 },
  },
  {
    elo: 30000,
    label: "30k",
    targets: { combat: 82, opening: 67, utility: 80, clutch: 67, maps: 82 },
  },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getTargetsForElo(targetElo: number): EloSkillTargets {
  const safeElo = clamp(targetElo, eloTiers[0].elo, eloTiers.at(-1)?.elo || 30000);
  const upperIndex = eloTiers.findIndex((tier) => tier.elo >= safeElo);

  if (upperIndex <= 0) return eloTiers[0].targets;

  const upper = eloTiers[upperIndex];
  const lower = eloTiers[upperIndex - 1];
  const distance = upper.elo - lower.elo;
  const progress = distance ? (safeElo - lower.elo) / distance : 0;

  return {
    combat: Math.round(lower.targets.combat + (upper.targets.combat - lower.targets.combat) * progress),
    opening: Math.round(lower.targets.opening + (upper.targets.opening - lower.targets.opening) * progress),
    utility: Math.round(lower.targets.utility + (upper.targets.utility - lower.targets.utility) * progress),
    clutch: Math.round(lower.targets.clutch + (upper.targets.clutch - lower.targets.clutch) * progress),
    maps: Math.round(lower.targets.maps + (upper.targets.maps - lower.targets.maps) * progress),
  };
}

export const skillLabels: Record<SkillKey, string> = {
  combat: "Combat",
  opening: "Opening Duels",
  utility: "Utility",
  clutch: "Clutches",
  maps: "Map Performance",
};
