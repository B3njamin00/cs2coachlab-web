import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { FirestoreMatch } from "./matchService";
import {
  getTargetsForElo,
  skillLabels,
  type SkillKey,
} from "../data/eloTargets";

export type ProgressProfile = {
  currentElo: number;
  targetElo: number;
};

export type SkillStatus = "ON TARGET" | "IMPROVING" | "NEEDS WORK" | "HIGH PRIORITY" | "NOT ENOUGH DATA";

export type SkillProgress = {
  key: SkillKey;
  label: string;
  score: number;
  target: number;
  gap: number;
  status: SkillStatus;
  explanation: string;
  trend: number[];
};

export type ProgressTask = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  action: string;
};

export type MatchTrend = {
  label: string;
  kd: number;
  hs: number;
  opening: number;
  utility: number;
  clutch: number;
};

export type ProgressAnalysis = {
  matchCount: number;
  limitedData: boolean;
  skills: SkillProgress[];
  priorities: SkillProgress[];
  tasks: ProgressTask[];
  trends: MatchTrend[];
  estimatedElo: number | null;
  largestGap: SkillProgress | null;
};

export const defaultProgressProfile: ProgressProfile = {
  currentElo: 12000,
  targetElo: 20000,
};

function profileReference(uid: string) {
  return doc(db, "users", uid, "profile", "progress");
}

export function subscribeToProgressProfile(
  uid: string,
  onProfile: (profile: ProgressProfile) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    profileReference(uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onProfile(defaultProgressProfile);
        return;
      }

      const data = snapshot.data();
      onProfile({
        currentElo: Number(data.currentElo || defaultProgressProfile.currentElo),
        targetElo: Number(data.targetElo || defaultProgressProfile.targetElo),
      });
    },
    (error) => onError?.(error)
  );
}

export async function saveProgressProfile(uid: string, profile: ProgressProfile) {
  await setDoc(
    profileReference(uid),
    {
      currentElo: Math.max(0, Math.round(profile.currentElo)),
      targetElo: Math.max(0, Math.round(profile.targetElo)),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function combatScore(match: FirestoreMatch) {
  const kd = Number(match.analysis?.kd || 0);
  const hs = Number(match.analysis?.hsPercent || 0);
  return clampScore(kd * 45 + hs * 0.45);
}

function openingScore(match: FirestoreMatch) {
  return clampScore(Number(match.aiCoach?.openingDuels?.winRate || 0));
}

function utilityScore(match: FirestoreMatch) {
  const utility = match.aiCoach?.utility?.stats;
  if (!utility) return 0;

  const flash = Math.min(35, Number(utility.flashEffectRate || 0) * 0.35);
  const damage = Math.min(35, Number(utility.damagePerDamagingGrenade || 0) * 1.4);
  const volume = Math.min(30, Number(utility.totalUtilityThrown || 0) * 3);
  return clampScore(flash + damage + volume);
}

function clutchScore(match: FirestoreMatch) {
  const clutch = match.aiCoach?.clutch?.stats;
  if (!clutch || clutch.opportunities === 0) return 0;
  return clampScore(Number(clutch.winRate || 0));
}

function mapScore(match: FirestoreMatch) {
  if (match.result === "win" || match.won) return 75;
  if (match.result === "draw") return 55;
  return 35;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function statusFor(score: number, target: number, trend: number[], matchCount: number): SkillStatus {
  if (matchCount < 3) return "NOT ENOUGH DATA";
  const gap = target - score;
  if (gap <= 0) return "ON TARGET";
  const recent = trend.slice(-3);
  const earlier = trend.slice(0, Math.max(0, trend.length - 3));
  if (recent.length >= 2 && earlier.length >= 2 && average(recent) > average(earlier) + 5) {
    return "IMPROVING";
  }
  return gap >= 20 ? "HIGH PRIORITY" : "NEEDS WORK";
}

function explanationFor(key: SkillKey, score: number, target: number) {
  const gap = Math.max(0, target - score);
  const atTarget = gap === 0;

  const descriptions: Record<SkillKey, string> = {
    combat: atTarget
      ? "K/D og headshot-nivå møter det valgte ELO-målet."
      : `Combat-score mangler ${gap} poeng. Prioriter presisjon, spraykontroll og kvaliteten på duellene.`,
    opening: atTarget
      ? "Opening-duellene møter det valgte ELO-målet."
      : `Opening-score mangler ${gap} poeng. Reduser tørre openings og prioriter flash, trade eller retrett.`,
    utility: atTarget
      ? "Utility-bruken møter det valgte ELO-målet."
      : `Utility-score mangler ${gap} poeng. Øk effekt per flash og bruk kartspesifikk utility før kontakt.`,
    clutch: atTarget
      ? "Clutch-konverteringen møter det valgte ELO-målet."
      : `Clutch-score mangler ${gap} poeng. Isoler dueller og reposisjoner etter hver kill.`,
    maps: atTarget
      ? "Map-resultatene møter det valgte ELO-målet."
      : `Map-score mangler ${gap} poeng. Stabiliser prestasjonene på kartene med svakest resultater.`,
  };

  return descriptions[key];
}

function taskFor(skill: SkillProgress): ProgressTask {
  const priority: ProgressTask["priority"] =
    skill.gap >= 20 ? "HIGH" : skill.gap >= 10 ? "MEDIUM" : "LOW";

  const actions: Record<SkillKey, string> = {
    combat: "Fullfør Aim Botz, HS Only DM eller Recoil Trainer fra treningsplanen.",
    opening: "Sikt mot færre tørre openings og opening win rate nærmere målverdien.",
    utility: "Fullfør anbefalt map utility og skap flere effektive flash-events per kamp.",
    clutch: "Fullfør clutchøvelsene og tren på isolering og reposisjonering.",
    maps: "Prioriter kartene som AI Coach har merket for utility- eller resultatforbedring.",
  };

  return {
    id: `progress-${skill.key}`,
    priority,
    title: `Forbedre ${skill.label}`,
    description: skill.explanation,
    action: actions[skill.key],
  };
}

export function analyzeProgress(
  allMatches: FirestoreMatch[],
  profile: ProgressProfile
): ProgressAnalysis {
  const matches = allMatches.slice(0, 10);
  const targets = getTargetsForElo(profile.targetElo);

  const chronological = [...matches].reverse();
  const trends: MatchTrend[] = chronological.map((match, index) => ({
    label: String(index + 1),
    kd: Number(match.analysis?.kd || 0),
    hs: Number(match.analysis?.hsPercent || 0),
    opening: openingScore(match),
    utility: utilityScore(match),
    clutch: clutchScore(match),
  }));

  const scoreMap: Record<SkillKey, number[]> = {
    combat: matches.map(combatScore),
    opening: matches.map(openingScore),
    utility: matches.map(utilityScore),
    clutch: matches
      .filter((match) => Number(match.aiCoach?.clutch?.stats?.opportunities || 0) > 0)
      .map(clutchScore),
    maps: matches.map(mapScore),
  };

  const skills = (Object.keys(scoreMap) as SkillKey[]).map((key) => {
    const values = scoreMap[key];
    const score = clampScore(average(values));
    const target = targets[key];
    const gap = Math.max(0, target - score);

    return {
      key,
      label: skillLabels[key],
      score,
      target,
      gap,
      status: statusFor(score, target, values, matches.length),
      explanation: explanationFor(key, score, target),
      trend: values,
    } satisfies SkillProgress;
  });

  const priorities = [...skills]
    .filter((skill) => skill.gap > 0)
    .sort((first, second) => second.gap - first.gap);

  const tasks = priorities.slice(0, 3).map(taskFor);
  const averageRatio = average(
    skills.map((skill) => skill.target > 0 ? Math.min(1.2, skill.score / skill.target) : 0)
  );
  const estimatedElo = matches.length >= 5
    ? Math.max(0, Math.round((profile.targetElo * averageRatio) / 100) * 100)
    : null;

  return {
    matchCount: matches.length,
    limitedData: matches.length < 5,
    skills,
    priorities,
    tasks,
    trends,
    estimatedElo,
    largestGap: priorities[0] || null,
  };
}
