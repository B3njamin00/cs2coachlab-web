import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToMatches,
  type FirestoreMatch,
} from "../services/matchService";

type MapStatus = "HIGH PRIORITY" | "NEEDS PRACTICE" | "IMPROVING" | "STRONG" | "LIMITED DATA";

type UtilityMatch = {
  matchId: string;
  analyzedAt: string;
  map: string;
  score: number;
  flashEffectRate: number;
  utilityDamage: number;
  utilityThrown: number;
  grade: string;
  mainIssue: string;
  strength: string;
  nextFocus: string;
  recommendedExercises: string[];
};

type MapUtilitySummary = {
  map: string;
  label: string;
  matches: UtilityMatch[];
  recentMatches: UtilityMatch[];
  score: number;
  previousScore: number | null;
  trendDelta: number;
  debt: number;
  status: MapStatus;
  latestIssue: string;
  latestStrength: string;
  latestFocus: string;
  recommendations: string[];
  averageFlashEffect: number;
  averageDamage: number;
  averageThrown: number;
};

const mapLabels: Record<string, string> = {
  dust2: "Dust 2",
  mirage: "Mirage",
  inferno: "Inferno",
  nuke: "Nuke",
  ancient: "Ancient",
  anubis: "Anubis",
  cache: "Cache",
  train: "Train",
  overpass: "Overpass",
  vertigo: "Vertigo",
};

const practiceSuggestions: Record<string, string[]> = {
  mirage: ["Window smoke", "Top Mid flash", "Connector smoke"],
  inferno: ["Banana control utility", "CT smoke", "Coffins molotov"],
  nuke: ["Outside smoke wall", "Secret molotov", "Ramp anti-rush utility"],
  ancient: ["Donut smoke", "Cave molotov", "B execute utility"],
  anubis: ["Mid control smoke", "Connector molotov", "B execute flashes"],
  dust2: ["Xbox smoke", "Long control flashes", "B doors smoke"],
  cache: ["Mid control utility", "Highway smoke", "B execute utility"],
  train: ["Ivy control utility", "Connector smoke", "B execute utility"],
  overpass: ["Monster control utility", "Heaven smoke", "A retake utility"],
  vertigo: ["A ramp control utility", "Elevator smoke", "B stairs molotov"],
};

function normalizeMap(value?: string) {
  return String(value || "unknown").toLowerCase().replace(/^de_/, "");
}

function mapName(value: string) {
  return mapLabels[value] || value.toUpperCase();
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function utilityScore(match: FirestoreMatch) {
  const utility = match.aiCoach?.utility?.stats;
  if (!utility) return 0;

  const flash = Math.min(35, Number(utility.flashEffectRate || 0) * 0.35);
  const damage = Math.min(35, Number(utility.damagePerDamagingGrenade || 0) * 1.4);
  const volume = Math.min(30, Number(utility.totalUtilityThrown || 0) * 3);

  return clamp(flash + damage + volume);
}

function gradeFromScore(score: number) {
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 52) return "C";
  if (score >= 36) return "D";
  return "F";
}

function buildUtilityMatch(match: FirestoreMatch): UtilityMatch | null {
  const utility = match.aiCoach?.utility;
  if (!utility) return null;

  return {
    matchId: match.id,
    analyzedAt: match.analyzedAt,
    map: normalizeMap(utility.map || match.map || match.mapNameRaw),
    score: utilityScore(match),
    flashEffectRate: Number(utility.stats.flashEffectRate || 0),
    utilityDamage: Number(utility.stats.heDamage || 0) + Number(utility.stats.molotovDamage || 0),
    utilityThrown: Number(utility.stats.totalUtilityThrown || 0),
    grade: utility.feedback.grade || gradeFromScore(utilityScore(match)),
    mainIssue: utility.feedback.mainIssue,
    strength: utility.feedback.strength,
    nextFocus: utility.feedback.nextMatchFocus,
    recommendedExercises: utility.feedback.recommendedExercises || [],
  };
}

function determineStatus(score: number, trendDelta: number, matchCount: number): MapStatus {
  if (matchCount < 2) return "LIMITED DATA";
  if (score >= 72) return "STRONG";
  if (trendDelta >= 12 && score >= 45) return "IMPROVING";
  if (score < 38) return "HIGH PRIORITY";
  return "NEEDS PRACTICE";
}

function buildMapSummaries(matches: FirestoreMatch[]): MapUtilitySummary[] {
  const utilityMatches = matches
    .map(buildUtilityMatch)
    .filter((match): match is UtilityMatch => match !== null);

  const grouped = new Map<string, UtilityMatch[]>();

  utilityMatches.forEach((match) => {
    const current = grouped.get(match.map) || [];
    current.push(match);
    grouped.set(match.map, current);
  });

  return [...grouped.entries()]
    .map(([map, mapMatches]) => {
      const sorted = [...mapMatches].sort(
        (first, second) =>
          new Date(second.analyzedAt).getTime() - new Date(first.analyzedAt).getTime()
      );
      const recentMatches = sorted.slice(0, 5);
      const olderMatches = sorted.slice(5, 10);
      const score = clamp(average(recentMatches.map((match) => match.score)));
      const previousScore = olderMatches.length
        ? clamp(average(olderMatches.map((match) => match.score)))
        : null;
      const chronological = [...recentMatches].reverse();
      const firstHalf = chronological.slice(0, Math.max(1, Math.floor(chronological.length / 2)));
      const secondHalf = chronological.slice(Math.max(1, Math.floor(chronological.length / 2)));
      const trendDelta = secondHalf.length
        ? Math.round(average(secondHalf.map((match) => match.score)) - average(firstHalf.map((match) => match.score)))
        : 0;
      const latest = sorted[0];
      const recommendations = [
        ...new Set([
          ...latest.recommendedExercises,
          ...(practiceSuggestions[map] || ["Map utility review", "Flash timing practice", "Execute rehearsal"]),
        ]),
      ].slice(0, 5);

      return {
        map,
        label: mapName(map),
        matches: sorted,
        recentMatches,
        score,
        previousScore,
        trendDelta,
        debt: 100 - score,
        status: determineStatus(score, trendDelta, recentMatches.length),
        latestIssue: latest.mainIssue,
        latestStrength: latest.strength,
        latestFocus: latest.nextFocus,
        recommendations,
        averageFlashEffect: Number(average(recentMatches.map((match) => match.flashEffectRate)).toFixed(1)),
        averageDamage: Number(average(recentMatches.map((match) => match.utilityDamage)).toFixed(1)),
        averageThrown: Number(average(recentMatches.map((match) => match.utilityThrown)).toFixed(1)),
      };
    })
    .sort((first, second) => second.debt - first.debt);
}

function statusClass(status: MapStatus) {
  if (status === "STRONG") return "border-green-500/35 bg-green-500/10 text-green-400";
  if (status === "IMPROVING") return "border-cyan-500/35 bg-cyan-500/10 text-cyan-400";
  if (status === "HIGH PRIORITY") return "border-red-500/35 bg-red-500/10 text-red-400";
  if (status === "NEEDS PRACTICE") return "border-orange-500/35 bg-orange-500/10 text-orange-400";
  return "border-slate-600 bg-slate-800 text-slate-400";
}

function scoreColor(score: number) {
  if (score >= 72) return "text-green-400";
  if (score >= 50) return "text-cyan-400";
  if (score >= 38) return "text-orange-400";
  return "text-red-400";
}

export default function MapsUtility() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setMatches([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    return subscribeToMatches(
      user.uid,
      (nextMatches) => {
        setMatches(nextMatches);
        setIsLoading(false);
      },
      (error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
    );
  }, [user]);

  const maps = useMemo(() => buildMapSummaries(matches), [matches]);
  const highPriority = maps.filter((map) => map.status === "HIGH PRIORITY" || map.status === "NEEDS PRACTICE");
  const improving = maps.filter((map) => map.status === "IMPROVING");
  const strong = maps.filter((map) => map.status === "STRONG");
  const limited = maps.filter((map) => map.status === "LIMITED DATA");
  const selected = maps.find((map) => map.map === selectedMap) || null;

  const totalUtilityMatches = maps.reduce((sum, map) => sum + map.matches.length, 0);
  const overallScore = maps.length ? clamp(average(maps.map((map) => map.score))) : 0;
  const highestDebt = maps[0] || null;
  const strongestMap = [...maps].sort((first, second) => second.score - first.score)[0] || null;

  if (loading) {
    return <div className="text-slate-400">Laster bruker...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8">
        <h1 className="text-4xl font-black">Logg inn for å se Maps & Utility</h1>
        <p className="mt-3 text-slate-300">
          Siden analyserer kart- og utilitydata for den innloggede Firestore-brukeren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
          Map Development
        </p>
        <h1 className="mt-2 text-5xl font-black tracking-tight">MAPS & UTILITY</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          Utility Debt viser hvor mye treningsverdi et kart har akkurat nå. Nye gode matcher reduserer gjelden og kan flytte kartet til Improving eller Strong.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/50 p-5 text-red-200">
          Kunne ikke hente Firestore-data: {errorMessage}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Utility Matches" value={totalUtilityMatches} color="text-white" />
        <SummaryCard label="Overall Utility" value={overallScore} color={scoreColor(overallScore)} />
        <SummaryCard label="Highest Debt" value={highestDebt ? `${highestDebt.label} · ${highestDebt.debt}` : "-"} color="text-red-400" />
        <SummaryCard label="Strongest Map" value={strongestMap ? `${strongestMap.label} · ${strongestMap.score}` : "-"} color="text-green-400" />
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-8 text-slate-400">
          Henter utilityhistorikk fra Firestore...
        </div>
      ) : maps.length === 0 ? (
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-8 text-center">
          <h2 className="text-3xl font-black">Ingen utilitydata ennå</h2>
          <p className="mt-3 text-slate-400">
            Analyser en demo med Utility Coach for å bygge den første kartprofilen.
          </p>
        </div>
      ) : (
        <>
          <MapSection
            eyebrow="Maps To Practice"
            title="High Priority Maps"
            description="Kart med høy Utility Debt og størst forventet treningsverdi."
            maps={highPriority}
            emptyText="Ingen kart er markert som High Priority akkurat nå."
            onOpen={setSelectedMap}
          />

          <MapSection
            eyebrow="Positive Trend"
            title="Improving Maps"
            description="Kart hvor de nyeste kampene viser tydelig utilityforbedring."
            maps={improving}
            emptyText="Ingen kart har nok positiv trend til Improving-status ennå."
            onOpen={setSelectedMap}
          />

          <MapSection
            eyebrow="Reliable Utility"
            title="Strong Maps"
            description="Kart som holder et stabilt høyt utilitynivå over de siste kampene."
            maps={strong}
            emptyText="Ingen kart har nådd Strong-status ennå."
            onOpen={setSelectedMap}
          />

          {limited.length > 0 && (
            <MapSection
              eyebrow="More Data Needed"
              title="Limited Data"
              description="Kart med færre enn to utilityanalyser."
              maps={limited}
              emptyText=""
              onOpen={setSelectedMap}
            />
          )}

          <section className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-[#0c1426] p-6">
            <p className="text-sm font-bold uppercase tracking-wider text-orange-400">
              Utility Practice Queue
            </p>
            <h2 className="mt-2 text-3xl font-black">Hva bør du trene nå?</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {maps.slice(0, 3).map((map, index) => (
                <button
                  key={map.map}
                  type="button"
                  onClick={() => setSelectedMap(map.map)}
                  className="rounded-2xl border border-[#263754] bg-[#08111f] p-5 text-left transition hover:border-orange-500/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-orange-400">PRIORITY {index + 1}</p>
                      <h3 className="mt-1 text-2xl font-black">{map.label}</h3>
                    </div>
                    <span className="text-3xl font-black text-red-400">{map.debt}</span>
                  </div>
                  <p className="mt-4 text-sm text-slate-300">{map.latestFocus}</p>
                  <div className="mt-4 space-y-2">
                    {map.recommendations.slice(0, 3).map((recommendation) => (
                      <div key={recommendation} className="rounded-lg bg-[#0c1426] px-3 py-2 text-sm text-slate-300">
                        {recommendation}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {selected && (
        <MapDetail map={selected} onClose={() => setSelectedMap(null)} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function MapSection({
  eyebrow,
  title,
  description,
  maps,
  emptyText,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  description: string;
  maps: MapUtilitySummary[];
  emptyText: string;
  onOpen: (map: string) => void;
}) {
  return (
    <section>
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-orange-400">{eyebrow}</p>
        <h2 className="mt-1 text-3xl font-black">{title}</h2>
        <p className="mt-2 text-slate-400">{description}</p>
      </div>

      {maps.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#263754] bg-[#0c1426]/60 p-6 text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {maps.map((map) => (
            <MapCard key={map.map} map={map} onOpen={() => onOpen(map.map)} />
          ))}
        </div>
      )}
    </section>
  );
}

function MapCard({ map, onOpen }: { map: MapUtilitySummary; onOpen: () => void }) {
  const maxScore = Math.max(...map.recentMatches.map((match) => match.score), 1);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-2xl border border-[#182538] bg-[#0c1426] p-6 text-left transition hover:-translate-y-0.5 hover:border-orange-500/45"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className={`inline-flex rounded-lg border px-3 py-2 text-xs font-black ${statusClass(map.status)}`}>
            {map.status}
          </span>
          <h3 className="mt-3 text-3xl font-black">{map.label}</h3>
          <p className="mt-2 text-sm text-slate-400">{map.recentMatches.length} siste utilitymatcher</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase text-slate-600">Utility Score</p>
          <p className={`mt-1 text-5xl font-black ${scoreColor(map.score)}`}>{map.score}</p>
          <p className="mt-1 text-sm text-red-400">Debt {map.debt}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniMetric label="Flash Effect" value={`${map.averageFlashEffect}%`} />
        <MiniMetric label="Utility Damage" value={map.averageDamage} />
        <MiniMetric label="Utility Used" value={map.averageThrown} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Recent trend</span>
          <span className={map.trendDelta >= 0 ? "text-green-400" : "text-red-400"}>
            {map.trendDelta >= 0 ? "+" : ""}{map.trendDelta}
          </span>
        </div>
        <div className="mt-3 flex h-24 items-end gap-2">
          {map.recentMatches.slice().reverse().map((match) => (
            <div key={match.matchId} className="flex flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs text-slate-500">{match.score}</span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-orange-600 to-orange-400"
                style={{ height: `${Math.max(8, (match.score / maxScore) * 64)}px` }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-[#08111f] p-4">
        <p className="text-xs font-bold uppercase text-orange-400">Latest AI Focus</p>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{map.latestFocus}</p>
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-slate-500">Åpne kartanalyse</span>
        <span className="text-2xl text-slate-600 transition group-hover:translate-x-1 group-hover:text-orange-400">›</span>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[#08111f] p-3 text-center">
      <p className="text-[10px] font-bold uppercase text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function MapDetail({ map, onClose }: { map: MapUtilitySummary; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-[#263754] bg-[#08111f] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#182538] bg-[#08111f]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-orange-400">Map Utility Report</p>
            <h2 className="mt-1 text-3xl font-black">{map.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#263754] text-2xl text-slate-400 hover:border-orange-500 hover:text-orange-400"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-[#0c1426] p-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <span className={`inline-flex rounded-lg border px-3 py-2 text-xs font-black ${statusClass(map.status)}`}>
                  {map.status}
                </span>
                <h3 className="mt-4 text-3xl font-black">Utility Debt {map.debt}</h3>
                <p className="mt-3 text-slate-300">
                  Utility Debt er V1-produktlogikk: 100 minus kartets score fra de siste fem utilitymatchene.
                </p>
              </div>
              <p className={`text-6xl font-black ${scoreColor(map.score)}`}>{map.score}</p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <DetailMetric label="Flash Effect" value={`${map.averageFlashEffect}%`} />
            <DetailMetric label="Utility Damage" value={map.averageDamage} />
            <DetailMetric label="Utility Used" value={map.averageThrown} />
          </section>

          <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
            <p className="text-xs font-bold uppercase text-red-400">Main Issue</p>
            <h3 className="mt-2 text-2xl font-black">{map.latestIssue}</h3>
            <p className="mt-5 text-xs font-bold uppercase text-green-400">Strength</p>
            <p className="mt-2 text-slate-300">{map.latestStrength}</p>
            <p className="mt-5 text-xs font-bold uppercase text-orange-400">Next Focus</p>
            <p className="mt-2 text-slate-300">{map.latestFocus}</p>
          </section>

          <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
            <p className="text-sm font-bold uppercase tracking-wider text-orange-400">Practice Queue</p>
            <div className="mt-4 space-y-3">
              {map.recommendations.map((recommendation, index) => (
                <div key={recommendation} className="flex items-center gap-4 rounded-xl bg-[#08111f] p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 font-black text-black">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-slate-200">{recommendation}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
            <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">Utility History</p>
            <div className="mt-5 space-y-3">
              {map.matches.slice(0, 10).map((match) => (
                <div key={match.matchId} className="grid grid-cols-[1fr_repeat(4,90px)] items-center gap-3 rounded-xl bg-[#08111f] p-4 text-sm">
                  <div>
                    <p className="font-bold">{new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(match.analyzedAt))}</p>
                    <p className="mt-1 text-xs text-slate-600">{match.mainIssue}</p>
                  </div>
                  <HistoryValue label="Score" value={match.score} color={scoreColor(match.score)} />
                  <HistoryValue label="Flash" value={`${match.flashEffectRate}%`} />
                  <HistoryValue label="Damage" value={match.utilityDamage} />
                  <HistoryValue label="Used" value={match.utilityThrown} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5">
      <p className="text-xs font-bold uppercase text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function HistoryValue({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase text-slate-600">{label}</p>
      <p className={`mt-1 font-black ${color}`}>{value}</p>
    </div>
  );
}
