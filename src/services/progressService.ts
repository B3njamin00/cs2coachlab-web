import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { FirestoreMatch } from "./matchService";
import { scoreToSkillElo, skillLabels, targetScoreForElo, type SkillKey } from "../data/eloTargets";

export type ProgressProfile = { currentElo: number; targetElo: number };
export type SkillStatus = "ON TARGET" | "IMPROVING" | "NEEDS WORK" | "HIGH PRIORITY" | "NOT ENOUGH DATA";
export type DetailStat = { label: string; value: string | number; benchmark?: string; note?: string };
export type SkillProgress = { key: SkillKey; label: string; score: number; skillElo: number; targetElo: number; eloGap: number; targetScore: number; status: SkillStatus; explanation: string; trend: number[]; detailStats: DetailStat[]; dataPoints: number };
export type ProgressTask = { id: string; priority: "HIGH" | "MEDIUM" | "LOW"; title: string; description: string; action: string };
export type ProgressAnalysis = { matchCount: number; analyzedWindow: number; limitedData: boolean; skills: SkillProgress[]; priorities: SkillProgress[]; tasks: ProgressTask[]; estimatedElo: number | null; largestGap: SkillProgress | null };

export const defaultProgressProfile: ProgressProfile = { currentElo: 12000, targetElo: 20000 };
function profileReference(uid: string) { return doc(db, "users", uid, "profile", "progress"); }
export function subscribeToProgressProfile(uid: string, onProfile: (profile: ProgressProfile) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(profileReference(uid), (snapshot) => {
    if (!snapshot.exists()) return onProfile(defaultProgressProfile);
    const data = snapshot.data();
    onProfile({ currentElo: Number(data.currentElo || defaultProgressProfile.currentElo), targetElo: Number(data.targetElo || defaultProgressProfile.targetElo) });
  }, (error) => onError?.(error));
}
export async function saveProgressProfile(uid: string, profile: ProgressProfile) {
  await setDoc(profileReference(uid), { currentElo: Math.max(0, Math.round(profile.currentElo)), targetElo: Math.max(0, Math.round(profile.targetElo)), updatedAt: serverTimestamp() }, { merge: true });
}
function avg(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number) { return Math.min(100, Math.max(0, Math.round(value))); }
function utilityScore(match: FirestoreMatch) {
  const stats = match.aiCoach?.utility?.stats;
  if (!stats) return 0;
  return clamp(Math.min(35, Number(stats.flashEffectRate || 0) * .35) + Math.min(35, Number(stats.damagePerDamagingGrenade || 0) * 1.4) + Math.min(30, Number(stats.totalUtilityThrown || 0) * 3));
}
function aimScore(match: FirestoreMatch) { return clamp(Number(match.analysis?.kd || 0) * 43 + Number(match.analysis?.hsPercent || 0) * .42 + Math.min(14, Number(match.aiCoach?.impact?.stats?.killsPerRound || 0) * 16)); }
function openingScore(match: FirestoreMatch) { return clamp(Number(match.aiCoach?.openingDuels?.winRate || 0)); }
function impactScore(match: FirestoreMatch) {
  const score = match.aiCoach?.impact?.stats?.score;
  if (typeof score === "number") return clamp(score);
  const rounds = Number(match.totalRounds || 0);
  return clamp(Number(match.analysis?.kills || 0) / Math.max(1, rounds) * 48);
}
function clutchScore(match: FirestoreMatch) {
  const stats = match.aiCoach?.clutch?.stats;
  if (!stats || !stats.opportunities) return null;
  const weightedWins = Object.entries(stats.byType || {}).reduce((sum, [type, record]) => sum + Number(type.replace("1v", "")) * Number(record.won || 0), 0);
  const weightedTotal = Object.entries(stats.byType || {}).reduce((sum, [type, record]) => sum + Number(type.replace("1v", "")) * Number(record.opportunities || 0), 0);
  return clamp(weightedTotal ? weightedWins / weightedTotal * 100 : stats.winRate);
}
function statusFor(elo: number, targetElo: number, trend: number[], count: number): SkillStatus {
  if (count < 5) return "NOT ENOUGH DATA";
  if (elo >= targetElo) return "ON TARGET";
  const recent = avg(trend.slice(-5));
  const earlier = avg(trend.slice(0, Math.max(0, trend.length - 5)));
  if (trend.length >= 10 && recent > earlier + 7) return "IMPROVING";
  return targetElo - elo >= 5000 ? "HIGH PRIORITY" : "NEEDS WORK";
}
function explanation(key: SkillKey, elo: number, target: number) {
  const gap = Math.max(0, target - elo);
  const label = skillLabels[key];
  return gap === 0 ? `${label} spiller allerede på eller over det valgte ELO-målet.` : `${label} tilsvarer omtrent ${elo.toLocaleString("nb-NO")} ELO og ligger ${gap.toLocaleString("nb-NO")} under målet.`;
}
function task(skill: SkillProgress): ProgressTask {
  const actions: Record<SkillKey, string> = { aim: "Aim Botz, HS Only DM og recoil-trening.", opening: "Ta første kontakt med flash, trade eller trygg retrett.", utility: "Tren anbefalte lineups og øk flash-effekt og utility damage.", impact: "Spill for trades, multi-kills, site holds og retakes.", clutch: "Isoler 1vX-dueller og reposisjoner etter hver kill." };
  return { id: `v2-${skill.key}`, priority: skill.eloGap >= 7000 ? "HIGH" : skill.eloGap >= 3000 ? "MEDIUM" : "LOW", title: `${skill.label}: lukk ELO-gapet`, description: skill.explanation, action: actions[skill.key] };
}

export function analyzeProgress(allMatches: FirestoreMatch[], profile: ProgressProfile): ProgressAnalysis {
  const matches = allMatches.slice(0, 30);
  const chronological = [...matches].reverse();
  const values: Record<SkillKey, number[]> = {
    aim: chronological.map(aimScore),
    opening: chronological.filter((m) => m.aiCoach?.openingDuels).map(openingScore),
    utility: chronological.filter((m) => m.aiCoach?.utility).map(utilityScore),
    impact: chronological.map(impactScore),
    clutch: chronological.map(clutchScore).filter((v): v is number => v !== null),
  };
  const totalRounds = matches.reduce((sum, match) => sum + Number(match.totalRounds || 0), 0);
  const totalKills = matches.reduce((sum, match) => sum + Number(match.analysis?.kills || 0), 0);
  const impactStats = matches.map((m) => m.aiCoach?.impact?.stats).filter(Boolean);
  const clutchStats = matches.map((m) => m.aiCoach?.clutch?.stats).filter(Boolean);
  const skills = (Object.keys(values) as SkillKey[]).map((key) => {
    const score = clamp(avg(values[key]));
    const skillElo = scoreToSkillElo(key, score);
    const targetScore = targetScoreForElo(key, profile.targetElo);
    const base = { key, label: skillLabels[key], score, skillElo, targetElo: profile.targetElo, eloGap: Math.max(0, profile.targetElo - skillElo), targetScore, status: statusFor(skillElo, profile.targetElo, values[key], values[key].length), explanation: explanation(key, skillElo, profile.targetElo), trend: values[key], dataPoints: values[key].length };
    const detailStats: Record<SkillKey, DetailStat[]> = {
      aim: [{ label: "K/D", value: avg(matches.map((m) => Number(m.analysis?.kd || 0))).toFixed(2) }, { label: "HS%", value: `${avg(matches.map((m) => Number(m.analysis?.hsPercent || 0))).toFixed(1)}%` }, { label: "Kills / round", value: totalRounds ? (totalKills / totalRounds).toFixed(2) : "-" }, { label: "Avg kill distance", value: avg(matches.map((m) => Number(m.analysis?.averageKillDistance || 0))).toFixed(1) }],
      opening: [{ label: "Opening WR", value: `${avg(matches.map((m) => Number(m.aiCoach?.openingDuels?.winRate || 0))).toFixed(1)}%` }, { label: "Opportunities", value: matches.reduce((s, m) => s + Number(m.aiCoach?.openingDuels?.opportunities || 0), 0) }, { label: "Won", value: matches.reduce((s, m) => s + Number(m.aiCoach?.openingDuels?.won || 0), 0) }, { label: "Lost", value: matches.reduce((s, m) => s + Number(m.aiCoach?.openingDuels?.lost || 0), 0) }],
      utility: [{ label: "Flash effect", value: `${avg(matches.map((m) => Number(m.aiCoach?.utility?.stats?.flashEffectRate || 0))).toFixed(1)}%` }, { label: "Utility damage", value: Math.round(avg(matches.map((m) => Number(m.aiCoach?.utility?.stats?.heDamage || 0) + Number(m.aiCoach?.utility?.stats?.molotovDamage || 0)))) }, { label: "Utility used", value: avg(matches.map((m) => Number(m.aiCoach?.utility?.stats?.totalUtilityThrown || 0))).toFixed(1) }, { label: "Damage / grenade", value: avg(matches.map((m) => Number(m.aiCoach?.utility?.stats?.damagePerDamagingGrenade || 0))).toFixed(1) }],
      impact: [{ label: "High-impact rounds", value: impactStats.reduce((s, v: any) => s + Number(v?.highImpactRounds || 0), 0) }, { label: "3K rounds", value: impactStats.reduce((s, v: any) => s + Number(v?.threeK || 0), 0) }, { label: "4K rounds", value: impactStats.reduce((s, v: any) => s + Number(v?.fourK || 0), 0) }, { label: "Aces / Retakes", value: `${impactStats.reduce((s, v: any) => s + Number(v?.aces || 0), 0)} / ${impactStats.reduce((s, v: any) => s + Number(v?.retakeImpact || 0), 0)}` }],
      clutch: [{ label: "Opportunities", value: clutchStats.reduce((s, v: any) => s + Number(v?.opportunities || 0), 0) }, { label: "Won", value: clutchStats.reduce((s, v: any) => s + Number(v?.won || 0), 0) }, { label: "Win rate", value: `${avg(clutchStats.map((v: any) => Number(v?.winRate || 0))).toFixed(1)}%` }, { label: "Largest won", value: matches.find((m) => m.aiCoach?.clutch?.stats?.largestClutchWon)?.aiCoach?.clutch?.stats?.largestClutchWon || "-" }],
    };
    return { ...base, detailStats: detailStats[key] } satisfies SkillProgress;
  });
  const rankedSkills = skills.filter((skill) => skill.key !== "clutch");
  const priorities = [...rankedSkills]
    .filter((skill) => skill.eloGap > 0)
    .sort((first, second) => second.eloGap - first.eloGap);
  const estimatedElo = matches.length >= 5
    ? Math.round(avg(rankedSkills.map((skill) => skill.skillElo)) / 100) * 100
    : null;
  return {
    matchCount: matches.length,
    analyzedWindow: 30,
    limitedData: matches.length < 5,
    skills,
    priorities,
    tasks: priorities.slice(0, 3).map(task),
    estimatedElo,
    largestGap: priorities[0] || null,
  };
}
