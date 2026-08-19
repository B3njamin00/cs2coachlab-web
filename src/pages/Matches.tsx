import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToMatches,
  type FirestoreMatch,
} from "../services/matchService";

type ResultFilter = "all" | "win" | "loss" | "draw";
type SortMode = "newest" | "oldest" | "best-grade" | "highest-kd";

type MatchScores = {
  combat: number;
  opening: number;
  utility: number;
  clutch: number | null;
  overall: number;
};

type CareerAverages = {
  kd: number;
  hs: number;
  opening: number;
  utility: number;
  clutch: number | null;
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

const gradeOrder: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
  "-": 0,
};

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeMap(value?: string) {
  return String(value || "unknown").toLowerCase().replace(/^de_/, "");
}

function mapName(value?: string) {
  const normalized = normalizeMap(value);
  return mapLabels[normalized] || normalized.toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return "Ukjent dato";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function utilityScore(match: FirestoreMatch) {
  const utility = match.aiCoach?.utility?.stats;
  if (!utility) return 0;

  const flash = Math.min(35, Number(utility.flashEffectRate || 0) * 0.35);
  const damage = Math.min(
    35,
    Number(utility.damagePerDamagingGrenade || 0) * 1.4
  );
  const volume = Math.min(30, Number(utility.totalUtilityThrown || 0) * 3);
  return clamp(flash + damage + volume);
}

function combatScore(match: FirestoreMatch) {
  const kd = Number(match.analysis?.kd || 0);
  const hs = Number(match.analysis?.hsPercent || 0);
  return clamp(kd * 45 + hs * 0.45);
}

function matchScores(match: FirestoreMatch): MatchScores {
  const combat = combatScore(match);
  const opening = clamp(Number(match.aiCoach?.openingDuels?.winRate || 0));
  const utility = utilityScore(match);
  const clutchStats = match.aiCoach?.clutch?.stats;
  const clutch = clutchStats && clutchStats.opportunities > 0
    ? clamp(Number(clutchStats.winRate || 0))
    : null;
  const available = [combat, opening, utility, clutch].filter(
    (score): score is number => score !== null
  );

  return {
    combat,
    opening,
    utility,
    clutch,
    overall: clamp(average(available)),
  };
}

function gradeFromScore(score: number) {
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 52) return "C";
  if (score >= 36) return "D";
  return "F";
}

function coachGrade(match: FirestoreMatch) {
  return match.aiCoach?.feedback.grade || match.analysis?.coachScore || gradeFromScore(matchScores(match).overall);
}

function gradeClass(grade: string) {
  if (grade === "A") return "border-green-500/40 bg-green-500/10 text-green-400";
  if (grade === "B") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-400";
  if (grade === "C") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
  if (grade === "D") return "border-orange-500/40 bg-orange-500/10 text-orange-400";
  if (grade === "F") return "border-red-500/40 bg-red-500/10 text-red-400";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function resultLabel(result: FirestoreMatch["result"]) {
  if (result === "win") return "SEIER";
  if (result === "draw") return "UAVGJORT";
  return "TAP";
}

function resultClass(result: FirestoreMatch["result"]) {
  if (result === "win") return "border-green-500/40 bg-green-500/10 text-green-400";
  if (result === "draw") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
  return "border-red-500/40 bg-red-500/10 text-red-400";
}

function careerAverages(matches: FirestoreMatch[]): CareerAverages {
  const clutchMatches = matches.filter(
    (match) => Number(match.aiCoach?.clutch?.stats?.opportunities || 0) > 0
  );

  return {
    kd: Number(average(matches.map((match) => Number(match.analysis?.kd || 0))).toFixed(2)),
    hs: Number(average(matches.map((match) => Number(match.analysis?.hsPercent || 0))).toFixed(1)),
    opening: Number(average(matches.map((match) => Number(match.aiCoach?.openingDuels?.winRate || 0))).toFixed(1)),
    utility: Number(average(matches.map(utilityScore)).toFixed(1)),
    clutch: clutchMatches.length
      ? Number(average(clutchMatches.map((match) => Number(match.aiCoach?.clutch?.stats?.winRate || 0))).toFixed(1))
      : null,
  };
}

export default function Matches() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<FirestoreMatch | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [mapFilter, setMapFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setMatches([]);
      setSelectedMatch(null);
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

  useEffect(() => {
    if (!selectedMatch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMatch(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMatch]);

  const availableMaps = useMemo(
    () => [...new Set(matches.map((match) => normalizeMap(match.map || match.mapNameRaw)))].sort(),
    [matches]
  );

  const averages = useMemo(() => careerAverages(matches), [matches]);

  const summary = useMemo(() => {
    const wins = matches.filter((match) => match.result === "win" || match.won).length;
    const losses = matches.filter((match) => match.result === "loss" && !match.won).length;
    const draws = matches.filter((match) => match.result === "draw").length;
    const best = [...matches].sort(
      (first, second) => matchScores(second).overall - matchScores(first).overall
    )[0];

    return {
      wins,
      losses,
      draws,
      winRate: matches.length ? Number(((wins / matches.length) * 100).toFixed(1)) : 0,
      best,
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const filtered = matches.filter((match) => {
      const resultMatches =
        resultFilter === "all" ||
        (resultFilter === "win" && (match.result === "win" || match.won)) ||
        (resultFilter === "loss" && match.result === "loss" && !match.won) ||
        (resultFilter === "draw" && match.result === "draw");
      const selectedMap = normalizeMap(match.map || match.mapNameRaw);
      const mapMatches = mapFilter === "all" || selectedMap === mapFilter;
      const gradeMatches = gradeFilter === "all" || coachGrade(match) === gradeFilter;
      const searchMatches =
        !normalizedSearch ||
        mapName(match.map || match.mapNameRaw).toLowerCase().includes(normalizedSearch) ||
        match.fileName.toLowerCase().includes(normalizedSearch) ||
        match.aiCoach?.feedback.mainIssue.toLowerCase().includes(normalizedSearch);

      return resultMatches && mapMatches && gradeMatches && searchMatches;
    });

    return [...filtered].sort((first, second) => {
      if (sortMode === "oldest") {
        return new Date(first.analyzedAt).getTime() - new Date(second.analyzedAt).getTime();
      }
      if (sortMode === "best-grade") {
        return gradeOrder[coachGrade(second)] - gradeOrder[coachGrade(first)];
      }
      if (sortMode === "highest-kd") {
        return Number(second.analysis?.kd || 0) - Number(first.analysis?.kd || 0);
      }
      return new Date(second.analyzedAt).getTime() - new Date(first.analyzedAt).getTime();
    });
  }, [matches, resultFilter, mapFilter, gradeFilter, sortMode, searchText]);

  if (loading) {
    return <div className="text-slate-400">Laster bruker...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8">
        <h1 className="text-4xl font-black">Logg inn for å se matchene dine</h1>
        <p className="mt-3 text-slate-300">
          Matches viser kun Firestore-kampene til den innloggede brukeren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
          Match History
        </p>
        <h1 className="mt-2 text-5xl font-black tracking-tight">MATCHES</h1>
        <p className="mt-2 text-slate-400">
          Leetify-inspirert kampoversikt med Opening, Utility, Clutch og AI Coach.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/50 p-5 text-red-200">
          Kunne ikke hente matcher: {errorMessage}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Analyzed" value={matches.length} color="text-white" />
        <SummaryCard label="Win Rate" value={`${summary.winRate}%`} color="text-green-400" />
        <SummaryCard label="Average K/D" value={averages.kd.toFixed(2)} color="text-cyan-400" />
        <SummaryCard label="Average HS" value={`${averages.hs}%`} color="text-purple-400" />
        <SummaryCard
          label="Best Match"
          value={summary.best ? `${mapName(summary.best.map)} · ${coachGrade(summary.best)}` : "-"}
          color="text-orange-400"
        />
      </section>

      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Søk på kart, fil eller AI-fokus"
            className="rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-orange-500"
          />

          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
            className="rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-slate-200 outline-none"
          >
            <option value="all">Alle resultater</option>
            <option value="win">Seire</option>
            <option value="loss">Tap</option>
            <option value="draw">Uavgjort</option>
          </select>

          <select
            value={mapFilter}
            onChange={(event) => setMapFilter(event.target.value)}
            className="rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-slate-200 outline-none"
          >
            <option value="all">Alle kart</option>
            {availableMaps.map((map) => (
              <option key={map} value={map}>{mapName(map)}</option>
            ))}
          </select>

          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
            className="rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-slate-200 outline-none"
          >
            <option value="all">Alle grades</option>
            {["A", "B", "C", "D", "F"].map((grade) => (
              <option key={grade} value={grade}>Grade {grade}</option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-slate-200 outline-none"
          >
            <option value="newest">Nyeste først</option>
            <option value="oldest">Eldste først</option>
            <option value="best-grade">Beste grade</option>
            <option value="highest-kd">Høyeste K/D</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <FilterChip active={resultFilter === "all"} onClick={() => setResultFilter("all")}>Alle</FilterChip>
          <FilterChip active={resultFilter === "win"} onClick={() => setResultFilter("win")}>Seire {summary.wins}</FilterChip>
          <FilterChip active={resultFilter === "loss"} onClick={() => setResultFilter("loss")}>Tap {summary.losses}</FilterChip>
          <FilterChip active={resultFilter === "draw"} onClick={() => setResultFilter("draw")}>Uavgjort {summary.draws}</FilterChip>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-8 text-slate-400">
          Henter matcher fra Firestore...
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-8 text-center">
          <h2 className="text-2xl font-black">Ingen matcher passer filteret</h2>
          <p className="mt-2 text-slate-400">Nullstill filtrene eller analyser en ny demo.</p>
          <button
            type="button"
            onClick={() => {
              setResultFilter("all");
              setMapFilter("all");
              setGradeFilter("all");
              setSearchText("");
            }}
            className="mt-5 rounded-xl border border-orange-500 px-5 py-3 text-orange-400"
          >
            Nullstill filtre
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              onOpen={() => setSelectedMatch(match)}
            />
          ))}
        </div>
      )}

      {selectedMatch && (
        <MatchDetails
          match={selectedMatch}
          averages={averages}
          onClose={() => setSelectedMatch(null)}
        />
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

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-orange-500 px-3 py-2 font-bold text-black"
          : "rounded-lg bg-[#08111f] px-3 py-2 text-slate-400 hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function MatchRow({ match, onOpen }: { match: FirestoreMatch; onOpen: () => void }) {
  const scores = matchScores(match);
  const grade = coachGrade(match);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-2xl border border-[#182538] bg-[#0c1426] p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-500/45 hover:bg-[#101a2d]"
    >
      <div className="grid items-center gap-5 xl:grid-cols-[140px_1.4fr_110px_repeat(4,minmax(90px,1fr))_120px]">
        <div>
          <span className={`inline-flex rounded-lg border px-3 py-2 text-xs font-black ${resultClass(match.result)}`}>
            {resultLabel(match.result)}
          </span>
          <p className="mt-3 text-sm text-slate-500">{formatDate(match.analyzedAt)}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black">{mapName(match.map || match.mapNameRaw)}</h2>
            <span className="text-lg font-bold text-slate-400">
              {match.score?.player ?? 0} - {match.score?.opponent ?? 0}
            </span>
          </div>
          <p className="mt-2 line-clamp-1 text-sm text-slate-400">
            {match.aiCoach?.feedback.mainIssue || match.analysis?.focusArea || "Ingen AI-feedback"}
          </p>
        </div>

        <div className={`rounded-xl border p-3 text-center ${gradeClass(grade)}`}>
          <p className="text-[10px] font-bold uppercase">Coach</p>
          <p className="text-3xl font-black">{grade}</p>
        </div>

        <ScoreCell label="K/D" value={Number(match.analysis?.kd || 0).toFixed(2)} />
        <ScoreCell label="HS" value={`${Number(match.analysis?.hsPercent || 0)}%`} />
        <ScoreCell label="Opening" value={gradeFromScore(scores.opening)} sub={`${scores.opening}%`} />
        <ScoreCell label="Utility" value={gradeFromScore(scores.utility)} sub={`${scores.utility}`} />

        <div className="flex items-center justify-end gap-4">
          <div className="text-right">
            <p className="text-xs uppercase text-slate-600">Clutch</p>
            <p className="mt-1 text-xl font-black text-cyan-400">
              {scores.clutch === null ? "-" : gradeFromScore(scores.clutch)}
            </p>
            <p className="text-xs text-slate-500">
              {scores.clutch === null ? "ingen data" : `${scores.clutch}%`}
            </p>
          </div>
          <span className="text-2xl text-slate-600 transition group-hover:translate-x-1 group-hover:text-orange-400">›</span>
        </div>
      </div>
    </button>
  );
}

function ScoreCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#08111f] p-3 text-center">
      <p className="text-[10px] font-bold uppercase text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function MatchDetails({
  match,
  averages,
  onClose,
}: {
  match: FirestoreMatch;
  averages: CareerAverages;
  onClose: () => void;
}) {
  const scores = matchScores(match);
  const grade = coachGrade(match);
  const utility = match.aiCoach?.utility;
  const clutch = match.aiCoach?.clutch;
  const opening = match.aiCoach?.openingDuels;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside className="h-full w-full max-w-4xl overflow-y-auto border-l border-[#263754] bg-[#08111f] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#182538] bg-[#08111f]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-orange-400">Match Report</p>
            <h2 className="mt-1 text-3xl font-black">{mapName(match.map || match.mapNameRaw)}</h2>
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
          <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex rounded-lg border px-3 py-2 text-xs font-black ${resultClass(match.result)}`}>
                    {resultLabel(match.result)}
                  </span>
                  <span className="text-3xl font-black">
                    {match.score?.player ?? 0} - {match.score?.opponent ?? 0}
                  </span>
                </div>
                <p className="mt-3 text-slate-400">{formatDate(match.analyzedAt)}</p>
                <p className="mt-1 break-all text-sm text-slate-600">{match.fileName}</p>
              </div>
              <div className={`min-w-28 rounded-2xl border p-4 text-center ${gradeClass(grade)}`}>
                <p className="text-xs font-bold uppercase">Coach Grade</p>
                <p className="text-5xl font-black">{grade}</p>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Performance" title="Combat" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Kills" value={match.analysis?.kills || 0} color="text-green-400" />
              <MetricCard label="Deaths" value={match.analysis?.deaths || 0} color="text-red-400" />
              <MetricCard label="K/D" value={Number(match.analysis?.kd || 0).toFixed(2)} color="text-cyan-400" />
              <MetricCard label="HS%" value={`${Number(match.analysis?.hsPercent || 0)}%`} color="text-purple-400" />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
              <SectionTitle eyebrow="First Contact" title="Opening Duels" />
              {opening ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MetricCard label="Opportunities" value={opening.opportunities} />
                  <MetricCard label="Win Rate" value={`${opening.winRate}%`} color="text-orange-400" />
                  <MetricCard label="Won" value={opening.won} color="text-green-400" />
                  <MetricCard label="Lost" value={opening.lost} color="text-red-400" />
                </div>
              ) : (
                <p className="mt-4 text-slate-500">Ingen opening-data i denne matchen.</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
              <SectionTitle eyebrow="Grenades" title="Utility" />
              {utility ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricCard label="Utility Score" value={scores.utility} color="text-cyan-400" />
                    <MetricCard label="Flash Effect" value={`${utility.stats.flashEffectRate}%`} />
                    <MetricCard label="Utility Thrown" value={utility.stats.totalUtilityThrown} />
                    <MetricCard label="Utility Damage" value={utility.stats.heDamage + utility.stats.molotovDamage} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">{utility.feedback.summary}</p>
                </>
              ) : (
                <p className="mt-4 text-slate-500">Ingen utility-data i denne matchen.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-500/20 bg-[#0c1426] p-6">
            <SectionTitle eyebrow="Late Round" title="Clutch Report" />
            {clutch ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {["1v1", "1v2", "1v3", "1v4", "1v5"].map((type) => {
                    const record = clutch.stats.byType[type];
                    return (
                      <div key={type} className="rounded-xl bg-[#08111f] p-4 text-center">
                        <p className="text-sm font-black text-cyan-400">{type}</p>
                        <p className="mt-2 text-2xl font-black">
                          {record?.won || 0}-{record?.lost || 0}
                        </p>
                        <p className="text-xs text-slate-500">{record?.winRate || 0}%</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <MetricCard label="Opportunities" value={clutch.stats.opportunities} />
                  <MetricCard label="Clutch WR" value={`${clutch.stats.winRate}%`} color="text-cyan-400" />
                  <MetricCard label="Largest Win" value={clutch.stats.largestClutchWon || "-"} color="text-orange-400" />
                </div>

                {clutch.situations.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {clutch.situations.map((situation) => (
                      <div
                        key={`${situation.round}-${situation.startTick}`}
                        className="flex items-center justify-between rounded-xl bg-[#08111f] p-4"
                      >
                        <div>
                          <p className="font-bold">Runde {situation.round} · {situation.type}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {situation.killsAfterStart} kills · {situation.headshots} headshots · tick {situation.startTick}
                          </p>
                        </div>
                        <span className={situation.result === "won" ? "font-black text-green-400" : "font-black text-red-400"}>
                          {situation.result === "won" ? "VUNNET" : "TAPT"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 text-slate-500">Ingen clutch-data. Analyser demoen med Clutch Coach V1.</p>
            )}
          </section>

          <section className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-[#0c1426] p-6">
            <SectionTitle eyebrow="AI Coach" title={match.aiCoach?.feedback.mainIssue || match.analysis?.focusArea || "Match Feedback"} />
            <p className="mt-4 leading-7 text-slate-300">
              {match.aiCoach?.feedback.summary || "Ingen AI-oppsummering tilgjengelig."}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-[#08111f] p-5">
                <p className="text-xs font-bold uppercase text-green-400">Strength</p>
                <p className="mt-2 text-slate-200">{match.aiCoach?.feedback.strength || "Ikke registrert"}</p>
              </div>
              <div className="rounded-xl bg-[#08111f] p-5">
                <p className="text-xs font-bold uppercase text-orange-400">Next Match Focus</p>
                <p className="mt-2 text-slate-200">{match.aiCoach?.feedback.nextMatchFocus || "Ikke registrert"}</p>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Benchmark" title="This Match vs Career Average" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ComparisonCard label="K/D" current={Number(match.analysis?.kd || 0)} career={averages.kd} suffix="" decimals={2} />
              <ComparisonCard label="HS%" current={Number(match.analysis?.hsPercent || 0)} career={averages.hs} suffix="%" />
              <ComparisonCard label="Opening WR" current={Number(opening?.winRate || 0)} career={averages.opening} suffix="%" />
              <ComparisonCard label="Utility Score" current={scores.utility} career={averages.utility} suffix="" />
              {scores.clutch !== null && averages.clutch !== null && (
                <ComparisonCard label="Clutch WR" current={scores.clutch} career={averages.clutch} suffix="%" />
              )}
              <ComparisonCard label="Overall Score" current={scores.overall} career={average([averages.opening, averages.utility, averages.clutch ?? averages.opening])} suffix="" />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-orange-400">{eyebrow}</p>
      <h3 className="mt-1 text-2xl font-black">{title}</h3>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-[#08111f] p-4">
      <p className="text-xs font-bold uppercase text-slate-600">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function ComparisonCard({
  label,
  current,
  career,
  suffix,
  decimals = 1,
}: {
  label: string;
  current: number;
  career: number;
  suffix: string;
  decimals?: number;
}) {
  const difference = current - career;
  const positive = difference >= 0;

  return (
    <div className="rounded-xl border border-[#182538] bg-[#0c1426] p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-bold">{label}</p>
        <span className={positive ? "text-green-400" : "text-red-400"}>
          {positive ? "+" : ""}{difference.toFixed(decimals)}{suffix}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase text-slate-600">This Match</p>
          <p className="mt-1 text-3xl font-black">{current.toFixed(decimals)}{suffix}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-600">Career Avg</p>
          <p className="mt-1 text-3xl font-black text-slate-400">{career.toFixed(decimals)}{suffix}</p>
        </div>
      </div>
    </div>
  );
}
