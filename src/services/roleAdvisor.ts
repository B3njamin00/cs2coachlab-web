import type { FirestoreMatch } from "./matchService";
import type { PreferredRole } from "./settingsService";

export type SuggestedRole = Exclude<PreferredRole, "IGL">;

export type RoleScore = {
  role: SuggestedRole;
  score: number;
};

export type RoleRecommendation = {
  suggestedRole: SuggestedRole;
  confidence: number;
  enoughData: boolean;
  analyzedMatches: number;
  minimumMatches: number;
  reasons: string[];
  limitations: string[];
  scores: RoleScore[];
  metrics: {
    averageKd: number;
    averageOpeningAttempts: number;
    openingWinRate: number;
    utilityScore: number;
    clutchWinRate: number | null;
    clutchOpportunities: number;
    awpKillShare: number;
  };
};

const minimumMatches = 5;

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function utilityScore(match: FirestoreMatch) {
  const utility = match.aiCoach?.utility?.stats;
  if (!utility) return 0;

  const flash = Math.min(40, Number(utility.flashEffectRate || 0) * 0.4);
  const damage = Math.min(
    35,
    Number(utility.damagePerDamagingGrenade || 0) * 1.4
  );
  const volume = Math.min(25, Number(utility.totalUtilityThrown || 0) * 2.5);

  return clamp(flash + damage + volume);
}

function totalWeaponKills(matches: FirestoreMatch[]) {
  return matches.reduce((total, match) => {
    return (
      total +
      Object.values(match.analysis?.weapons || {}).reduce(
        (sum, kills) => sum + Number(kills),
        0
      )
    );
  }, 0);
}

function awpKills(matches: FirestoreMatch[]) {
  return matches.reduce((total, match) => {
    const weapons = match.analysis?.weapons || {};
    return (
      total +
      Object.entries(weapons).reduce((sum, [weapon, kills]) => {
        const normalized = weapon.toLowerCase();
        return normalized.includes("awp") ? sum + Number(kills) : sum;
      }, 0)
    );
  }, 0);
}

function buildReasons(
  role: SuggestedRole,
  metrics: RoleRecommendation["metrics"]
) {
  const reasons: string[] = [];

  if (role === "Entry") {
    reasons.push(
      `Du tar i snitt ${metrics.averageOpeningAttempts.toFixed(1)} opening-dueller per kamp.`
    );
    reasons.push(`Opening win rate er ${metrics.openingWinRate.toFixed(1)}%.`);
    reasons.push(`Gjennomsnittlig K/D er ${metrics.averageKd.toFixed(2)}.`);
  }

  if (role === "Support") {
    reasons.push(`Utility-scoren er ${metrics.utilityScore.toFixed(0)} av 100.`);
    reasons.push(
      `Opening-volumet er ${metrics.averageOpeningAttempts.toFixed(1)} dueller per kamp, som gir rom for en mer støttende rolle.`
    );
    reasons.push("Utilityeffekt og lavere opening-eksponering trekker mot Support.");
  }

  if (role === "Lurker") {
    reasons.push(
      metrics.clutchWinRate === null
        ? "Clutchdata er begrenset, men spillestilen viser lavere opening-eksponering."
        : `Clutch win rate er ${metrics.clutchWinRate.toFixed(1)}% over ${metrics.clutchOpportunities} muligheter.`
    );
    reasons.push(
      `Du tar i snitt ${metrics.averageOpeningAttempts.toFixed(1)} opening-dueller per kamp.`
    );
    reasons.push("Late-round-resultater og lavere opening-volum trekker mot Lurker.");
  }

  if (role === "AWPer") {
    reasons.push(`${metrics.awpKillShare.toFixed(1)}% av registrerte våpenkills kommer med AWP.`);
    reasons.push(`Opening win rate er ${metrics.openingWinRate.toFixed(1)}%.`);
    reasons.push(`Gjennomsnittlig K/D er ${metrics.averageKd.toFixed(2)}.`);
  }

  if (role === "Flex") {
    reasons.push("Ingen spesialisert rolle skiller seg tydelig nok fra de andre.");
    reasons.push("Combat, openings, utility og clutch er relativt balansert.");
    reasons.push("Flex beholdes til flere matcher gir et tydeligere mønster.");
  }

  return reasons;
}

export function analyzeSuggestedRole(
  allMatches: FirestoreMatch[]
): RoleRecommendation {
  const matches = allMatches.slice(0, 20);
  const analyzedMatches = matches.length;

  const openingData = matches
    .map((match) => match.aiCoach?.openingDuels)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const clutchData = matches
    .map((match) => match.aiCoach?.clutch?.stats)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const averageKd = average(
    matches.map((match) => Number(match.analysis?.kd || 0))
  );
  const averageOpeningAttempts = average(
    openingData.map((opening) => Number(opening.opportunities || 0))
  );
  const openingWinRate = average(
    openingData.map((opening) => Number(opening.winRate || 0))
  );
  const averageUtility = average(matches.map(utilityScore));
  const clutchOpportunities = clutchData.reduce(
    (sum, clutch) => sum + Number(clutch.opportunities || 0),
    0
  );
  const clutchWins = clutchData.reduce(
    (sum, clutch) => sum + Number(clutch.won || 0),
    0
  );
  const clutchWinRate = clutchOpportunities
    ? (clutchWins / clutchOpportunities) * 100
    : null;
  const weaponKills = totalWeaponKills(matches);
  const awpKillShare = weaponKills
    ? (awpKills(matches) / weaponKills) * 100
    : 0;

  const metrics: RoleRecommendation["metrics"] = {
    averageKd,
    averageOpeningAttempts,
    openingWinRate,
    utilityScore: averageUtility,
    clutchWinRate,
    clutchOpportunities,
    awpKillShare,
  };

  if (analyzedMatches < minimumMatches) {
    return {
      suggestedRole: "Flex",
      confidence: 0,
      enoughData: false,
      analyzedMatches,
      minimumMatches,
      reasons: [
        `Bare ${analyzedMatches} av anbefalte ${minimumMatches} matcher er tilgjengelige.`,
        "Flex beholdes til datagrunnlaget er stort nok.",
      ],
      limitations: [
        "Rolleforslaget krever minst fem analyserte matcher.",
        "IGL kan ikke vurderes pålitelig fra dagens demo-felter.",
      ],
      scores: [
        { role: "Flex", score: 50 },
        { role: "Entry", score: 0 },
        { role: "Support", score: 0 },
        { role: "Lurker", score: 0 },
        { role: "AWPer", score: 0 },
      ],
      metrics,
    };
  }

  const openingVolume = clamp((averageOpeningAttempts / 5) * 100);
  const combat = clamp(averageKd * 55);
  const utility = clamp(averageUtility);
  const clutch = clutchWinRate === null ? 35 : clamp(clutchWinRate);
  const awpUsage = clamp(awpKillShare * 2.5);
  const lowOpening = 100 - openingVolume;

  const rawScores: Record<SuggestedRole, number> = {
    Entry: clamp(openingVolume * 0.42 + openingWinRate * 0.33 + combat * 0.25),
    Support: clamp(utility * 0.58 + lowOpening * 0.27 + combat * 0.15),
    Lurker: clamp(clutch * 0.5 + lowOpening * 0.3 + combat * 0.2),
    AWPer: clamp(awpUsage * 0.55 + openingWinRate * 0.25 + combat * 0.2),
    Flex: clamp(
      62 -
        Math.abs(openingVolume - utility) * 0.15 -
        Math.abs(utility - clutch) * 0.1
    ),
  };

  const sorted = (Object.entries(rawScores) as Array<[SuggestedRole, number]>)
    .map(([role, score]) => ({ role, score }))
    .sort((first, second) => second.score - first.score);

  const winner = sorted[0];
  const runnerUp = sorted[1];
  const margin = winner.score - runnerUp.score;
  const evidenceFactor = Math.min(1, analyzedMatches / 12);
  const confidence = clamp((45 + margin * 2.2) * evidenceFactor);
  const suggestedRole: SuggestedRole =
    confidence < 45 || margin < 7 ? "Flex" : winner.role;

  return {
    suggestedRole,
    confidence: suggestedRole === "Flex" ? Math.min(confidence, 60) : confidence,
    enoughData: true,
    analyzedMatches,
    minimumMatches,
    reasons: buildReasons(suggestedRole, metrics),
    limitations: [
      "Forslaget er en V1-regelmodell basert på registrerte demo-statistikker.",
      "IGL kan ikke vurderes pålitelig uten kommunikasjon, mid-round-calling og lagkontekst.",
      "Support og Lurker vurderes indirekte fra utility, openings og clutcher.",
    ],
    scores: sorted,
    metrics,
  };
}
