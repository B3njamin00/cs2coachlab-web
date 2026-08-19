export type SkillKey = "aim" | "opening" | "utility" | "impact" | "clutch";

export type SkillBenchmark = {
  elo: number;
  aim: number;
  opening: number;
  utility: number;
  impact: number;
  clutch: number;
};

export const skillLabels: Record<SkillKey, string> = {
  aim: "Aim",
  opening: "Opening",
  utility: "Utility",
  impact: "Impact",
  clutch: "Clutch",
};

export const skillBenchmarks: SkillBenchmark[] = [
  { elo: 1000, aim: 18, opening: 22, utility: 12, impact: 15, clutch: 18 },
  { elo: 5000, aim: 30, opening: 32, utility: 24, impact: 28, clutch: 28 },
  { elo: 10000, aim: 43, opening: 42, utility: 36, impact: 40, clutch: 38 },
  { elo: 15000, aim: 55, opening: 51, utility: 48, impact: 52, clutch: 48 },
  { elo: 20000, aim: 67, opening: 59, utility: 61, impact: 64, clutch: 58 },
  { elo: 25000, aim: 78, opening: 67, utility: 73, impact: 76, clutch: 68 },
  { elo: 30000, aim: 88, opening: 75, utility: 84, impact: 87, clutch: 78 },
  { elo: 35000, aim: 96, opening: 84, utility: 94, impact: 96, clutch: 88 },
];

export type PremierTier = {
  min: number;
  max: number | null;
  name: string;
  hex: string;
  textClass: string;
  borderClass: string;
  backgroundClass: string;
};

export const premierTiers: PremierTier[] = [
  { min: 0, max: 4999, name: "Grey", hex: "#B0B0B0", textClass: "text-[#B0B0B0]", borderClass: "border-[#B0B0B0]/40", backgroundClass: "bg-[#B0B0B0]/10" },
  { min: 5000, max: 9999, name: "Light Blue", hex: "#63B3ED", textClass: "text-[#63B3ED]", borderClass: "border-[#63B3ED]/40", backgroundClass: "bg-[#63B3ED]/10" },
  { min: 10000, max: 14999, name: "Blue", hex: "#4C7DFF", textClass: "text-[#4C7DFF]", borderClass: "border-[#4C7DFF]/40", backgroundClass: "bg-[#4C7DFF]/10" },
  { min: 15000, max: 19999, name: "Purple", hex: "#9B5DE5", textClass: "text-[#9B5DE5]", borderClass: "border-[#9B5DE5]/40", backgroundClass: "bg-[#9B5DE5]/10" },
  { min: 20000, max: 24999, name: "Pink", hex: "#EC4899", textClass: "text-[#EC4899]", borderClass: "border-[#EC4899]/40", backgroundClass: "bg-[#EC4899]/10" },
  { min: 25000, max: 29999, name: "Red", hex: "#EF4444", textClass: "text-[#EF4444]", borderClass: "border-[#EF4444]/40", backgroundClass: "bg-[#EF4444]/10" },
  { min: 30000, max: null, name: "Gold", hex: "#F6C945", textClass: "text-[#F6C945]", borderClass: "border-[#F6C945]/40", backgroundClass: "bg-[#F6C945]/10" },
];

export function getPremierTier(elo: number) {
  return premierTiers.find((tier) => elo >= tier.min && (tier.max === null || elo <= tier.max)) || premierTiers[0];
}

export function scoreToSkillElo(skill: SkillKey, score: number) {
  const safe = Math.max(0, Math.min(100, score));
  const upperIndex = skillBenchmarks.findIndex((benchmark) => benchmark[skill] >= safe);
  if (upperIndex <= 0) return Math.round(skillBenchmarks[0].elo * (safe / Math.max(1, skillBenchmarks[0][skill])) / 100) * 100;
  if (upperIndex === -1) return 35000;
  const lower = skillBenchmarks[upperIndex - 1];
  const upper = skillBenchmarks[upperIndex];
  const ratio = (safe - lower[skill]) / Math.max(1, upper[skill] - lower[skill]);
  return Math.max(0, Math.round((lower.elo + (upper.elo - lower.elo) * ratio) / 100) * 100);
}

export function targetScoreForElo(skill: SkillKey, elo: number) {
  const upperIndex = skillBenchmarks.findIndex((benchmark) => benchmark.elo >= elo);
  if (upperIndex <= 0) return skillBenchmarks[0][skill];
  if (upperIndex === -1) return skillBenchmarks.at(-1)?.[skill] || 100;
  const lower = skillBenchmarks[upperIndex - 1];
  const upper = skillBenchmarks[upperIndex];
  const ratio = (elo - lower.elo) / Math.max(1, upper.elo - lower.elo);
  return Math.round(lower[skill] + (upper[skill] - lower[skill]) * ratio);
}
