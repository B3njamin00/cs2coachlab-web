import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "../firebase";

export type FirestoreMatch = {
  id: string;
  fileName: string;
  fileSize: number;
  analyzedAt: string;
  updatedAt?: unknown;
  map: string;
  mapNameRaw?: string;
  won: boolean;
  result: "win" | "loss" | "draw";
  score: {
    player: number;
    opponent: number;
  };
  unresolvedRounds?: number;
  totalRounds?: number;
  analysis: {
    player: string;
    steamId?: string;
    kills: number;
    deaths: number;
    kd: number;
    headshots?: number;
    hsPercent: number;
    averageKillDistance?: number;
    coachScore: string;
    focusArea: string;
    favoriteWeapon?: string;
    weapons?: Record<string, number>;
    totalDeathEvents?: number;
  };
  aiCoach?: {
    version?: string;
    openingDuels: {
      opportunities: number;
      won: number;
      lost: number;
      winRate: number;
      teamWinsAfterOpeningKill: number;
      teamLossesAfterOpeningDeath: number;
    };
    keyMoments: Array<{
      round: number;
      tick: number;
      type: "opening_kill" | "opening_death";
      opponent: string;
      weapon: string;
      headshot?: boolean;
      distance?: number;
      roundWon: boolean | null;
    }>;
    utility?: {
      version: string;
      map: string;
      stats: {
        flashesThrown: number;
        blindEventsCreated: number;
        flashEffectRate: number;
        smokesThrown: number;
        heGrenadesThrown: number;
        molotovsThrown: number;
        heDamage: number;
        molotovDamage: number;
        damagePerDamagingGrenade: number;
        totalUtilityThrown: number;
      };
      feedback: {
        grade: string;
        mainIssue: string;
        strength: string;
        summary: string;
        nextMatchFocus: string;
        recommendedExercises: string[];
      };
    };
    impact?: {
      version: string;
      stats: {
        roundsPlayed: number;
        kills: number;
        killsPerRound: number;
        roundsWonWithKill: number;
        threeK: number;
        fourK: number;
        aces: number;
        retakeImpact: number;
        openingChains: number;
        highImpactRounds: number;
        highImpactRate: number;
        score: number;
      };
      rounds: Array<{
        round: number;
        startTick: number;
        endTick: number;
        kills: number;
        headshots: number;
        type: "multikill" | "retake" | "round_swing" | "ace";
        roundWon: boolean;
      }>;
      feedback: {
        grade: string;
        mainIssue: string;
        strength: string;
        summary: string;
        nextMatchFocus: string;
        recommendedExercises: string[];
      };
    };
    clutch?: {
      version: string;
      stats: {
        opportunities: number;
        won: number;
        lost: number;
        winRate: number;
        largestClutchWon: string | null;
        byType: Record<string, { opportunities: number; won: number; lost: number; winRate: number }>;
      };
      situations: Array<{
        round: number;
        type: string;
        enemiesAtStart: number;
        startTick: number;
        endTick: number;
        opponentsAtStart: string[];
        result: "won" | "lost";
        killsAfterStart: number;
        headshots: number;
        kills: Array<{ tick: number; opponent: string; weapon: string; headshot: boolean }>;
      }>;
      feedback: {
        grade: string;
        mainIssue: string;
        strength: string;
        summary: string;
        nextMatchFocus: string;
        recommendedExercises: string[];
      };
    };
    feedback: {
      grade: string;
      mainIssue: string;
      secondaryIssue?: string;
      strength: string;
      summary: string;
      nextMatchFocus: string;
      recommendedExercises: string[];
    };
  };
};

export type DashboardData = {
  totalMatches: number;
  averageKd: number;
  averageHsPercent: number;
  totalKills: number;
  totalDeaths: number;
  bestWeapon: string;
  weaponStats: Record<string, number>;
  latestCoachScore: string;
  latestFocusArea: string;
  latestAiCoach: FirestoreMatch["aiCoach"] | null;
  recentMatches: FirestoreMatch[];
  mapWins: Array<{
    map: string;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
  }>;
};

function matchesCollection(uid: string) {
  return collection(db, "users", uid, "matches");
}

function convertMatch(snapshot: QueryDocumentSnapshot<DocumentData>): FirestoreMatch {
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<FirestoreMatch, "id">),
  };
}

export async function saveMatch(uid: string, match: FirestoreMatch) {
  const matchReference = doc(db, "users", uid, "matches", match.id);

  await setDoc(
    matchReference,
    {
      ...match,
      ownerUid: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getMatches(uid: string): Promise<FirestoreMatch[]> {
  const matchesQuery = query(
    matchesCollection(uid),
    orderBy("analyzedAt", "desc")
  );
  const snapshot = await getDocs(matchesQuery);
  return snapshot.docs.map(convertMatch);
}

export async function getLatestMatch(uid: string): Promise<FirestoreMatch | null> {
  const latestQuery = query(
    matchesCollection(uid),
    orderBy("analyzedAt", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(latestQuery);
  return snapshot.empty ? null : convertMatch(snapshot.docs[0]);
}

export function subscribeToMatches(
  uid: string,
  onMatches: (matches: FirestoreMatch[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const matchesQuery = query(
    matchesCollection(uid),
    orderBy("analyzedAt", "desc")
  );

  return onSnapshot(
    matchesQuery,
    (snapshot) => onMatches(snapshot.docs.map(convertMatch)),
    (error) => onError?.(error)
  );
}

export function createDashboardData(matches: FirestoreMatch[]): DashboardData {
  const mapOrder = [
    "dust2",
    "mirage",
    "inferno",
    "nuke",
    "ancient",
    "anubis",
    "cache",
  ];

  let totalKills = 0;
  let totalDeaths = 0;
  let totalHeadshots = 0;
  const weaponStats: Record<string, number> = {};

  const mapSummary = Object.fromEntries(
    mapOrder.map((map) => [
      map,
      { map, matches: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
    ])
  ) as Record<
    string,
    {
      map: string;
      matches: number;
      wins: number;
      losses: number;
      draws: number;
      winRate: number;
    }
  >;

  for (const match of matches) {
    totalKills += Number(match.analysis?.kills || 0);
    totalDeaths += Number(match.analysis?.deaths || 0);
    totalHeadshots += Number(match.analysis?.headshots || 0);

    for (const [weapon, kills] of Object.entries(match.analysis?.weapons || {})) {
      weaponStats[weapon] = (weaponStats[weapon] || 0) + Number(kills);
    }

    const normalizedMap = String(match.map || match.mapNameRaw || "unknown")
      .toLowerCase()
      .replace(/^de_/, "");

    if (mapSummary[normalizedMap]) {
      mapSummary[normalizedMap].matches += 1;
      if (match.result === "win" || match.won) mapSummary[normalizedMap].wins += 1;
      else if (match.result === "draw") mapSummary[normalizedMap].draws += 1;
      else mapSummary[normalizedMap].losses += 1;
    }
  }

  const sortedWeapons = Object.fromEntries(
    Object.entries(weaponStats).sort((a, b) => b[1] - a[1])
  );

  const mapWins = mapOrder.map((map) => {
    const item = mapSummary[map];
    return {
      ...item,
      winRate: item.matches
        ? Number(((item.wins / item.matches) * 100).toFixed(1))
        : 0,
    };
  });

  const latest = matches[0];

  return {
    totalMatches: matches.length,
    averageKd: totalDeaths
      ? Number((totalKills / totalDeaths).toFixed(2))
      : totalKills,
    averageHsPercent: totalKills
      ? Number(((totalHeadshots / totalKills) * 100).toFixed(1))
      : 0,
    totalKills,
    totalDeaths,
    bestWeapon: Object.keys(sortedWeapons)[0] || "Ingen",
    weaponStats: sortedWeapons,
    latestCoachScore:
      latest?.aiCoach?.feedback.grade || latest?.analysis.coachScore || "-",
    latestFocusArea:
      latest?.aiCoach?.feedback.mainIssue || latest?.analysis.focusArea || "-",
    latestAiCoach: latest?.aiCoach || null,
    recentMatches: matches.slice(0, 5),
    mapWins,
  };
}
