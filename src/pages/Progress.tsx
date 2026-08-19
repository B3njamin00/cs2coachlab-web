import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getMatches,
  subscribeToMatches,
  type FirestoreMatch,
} from "../services/matchService";
import {
  analyzeProgress,
  defaultProgressProfile,
  saveProgressProfile,
  subscribeToProgressProfile,
  type ProgressAnalysis,
  type ProgressProfile,
  type SkillProgress,
} from "../services/progressService";

const emptyAnalysis: ProgressAnalysis = {
  matchCount: 0,
  limitedData: true,
  skills: [],
  priorities: [],
  tasks: [],
  trends: [],
  estimatedElo: null,
  largestGap: null,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO").format(value);
}

function statusColor(status: SkillProgress["status"]) {
  if (status === "ON TARGET") return "text-green-400 bg-green-500/10";
  if (status === "IMPROVING") return "text-cyan-400 bg-cyan-500/10";
  if (status === "HIGH PRIORITY") return "text-red-400 bg-red-500/10";
  if (status === "NEEDS WORK") return "text-orange-400 bg-orange-500/10";
  return "text-slate-400 bg-slate-500/10";
}

export default function Progress() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ProgressProfile>(defaultProgressProfile);
  const [draftProfile, setDraftProfile] = useState<ProgressProfile>(defaultProgressProfile);
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setMatches([]);
      setProfile(defaultProgressProfile);
      setDraftProfile(defaultProgressProfile);
      return;
    }

    const unsubscribeProfile = subscribeToProgressProfile(
      user.uid,
      (nextProfile) => {
        setProfile(nextProfile);
        setDraftProfile(nextProfile);
      },
      (error) => setErrorMessage(error.message)
    );

    const unsubscribeMatches = subscribeToMatches(
      user.uid,
      setMatches,
      (error) => setErrorMessage(error.message)
    );

    return () => {
      unsubscribeProfile();
      unsubscribeMatches();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getMatches(user.uid).catch((error: unknown) => {
      if (error instanceof Error) setErrorMessage(error.message);
    });
  }, [user]);

  const analysis = useMemo(
    () => user ? analyzeProgress(matches, profile) : emptyAnalysis,
    [matches, profile, user]
  );

  const eloProgress = profile.targetElo > 0
    ? Math.min(100, (profile.currentElo / profile.targetElo) * 100)
    : 0;
  const remainingElo = Math.max(0, profile.targetElo - profile.currentElo);

  async function saveGoal() {
    if (!user) return;
    setIsSaving(true);
    setErrorMessage("");

    try {
      await saveProgressProfile(user.uid, draftProfile);
      setIsEditingGoal(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Kunne ikke lagre ELO-målet.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return <div className="text-slate-400">Laster progresjon...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8">
        <h1 className="text-4xl font-black">Logg inn for å se progresjonen din</h1>
        <p className="mt-3 text-slate-300">
          Progress bruker kun kampene til den innloggede Firebase-brukeren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black tracking-tight">PROGRESS</h1>
          <p className="mt-2 text-slate-400">
            AI-roadmap basert på dine siste {Math.min(10, analysis.matchCount)} matcher
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsEditingGoal(true)}
          className="rounded-xl border border-orange-500 px-5 py-3 font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
        >
          Endre ELO-mål
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/50 p-5 text-red-200">
          {errorMessage}
        </div>
      )}

      {isEditingGoal && (
        <div className="rounded-2xl border border-orange-500/30 bg-[#0c1426] p-6">
          <h2 className="text-2xl font-black">Oppdater ELO-mål</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm uppercase text-slate-400">Nåværende ELO</span>
              <input
                type="number"
                min="0"
                step="100"
                value={draftProfile.currentElo}
                onChange={(event) => setDraftProfile((current) => ({
                  ...current,
                  currentElo: Number(event.target.value),
                }))}
                className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3 text-white outline-none focus:border-orange-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm uppercase text-slate-400">Ønsket ELO</span>
              <input
                type="number"
                min="0"
                step="100"
                value={draftProfile.targetElo}
                onChange={(event) => setDraftProfile((current) => ({
                  ...current,
                  targetElo: Number(event.target.value),
                }))}
                className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3 text-white outline-none focus:border-orange-500"
              />
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={saveGoal}
              disabled={isSaving}
              className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-black disabled:opacity-50"
            >
              {isSaving ? "Lagrer..." : "Lagre mål"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftProfile(profile);
                setIsEditingGoal(false);
              }}
              className="rounded-xl border border-[#263754] px-5 py-3 text-slate-300"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-orange-500/25 bg-gradient-to-br from-[#121d33] via-[#0c1426] to-[#08111f] p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-400">
              Road to {formatNumber(profile.targetElo)} ELO
            </p>
            <h2 className="mt-3 text-5xl font-black">
              {formatNumber(profile.currentElo)}
              <span className="ml-3 text-2xl text-slate-500">/ {formatNumber(profile.targetElo)}</span>
            </h2>
            <p className="mt-3 text-slate-300">
              {remainingElo > 0
                ? `${formatNumber(remainingElo)} ELO gjenstår til målet.`
                : "ELO-målet er nådd. Sett et nytt mål når du er klar."}
            </p>
          </div>
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 px-6 py-4 text-center">
            <p className="text-sm uppercase text-orange-300">ELO Progress</p>
            <p className="mt-1 text-4xl font-black text-orange-400">{eloProgress.toFixed(1)}%</p>
          </div>
        </div>
        <div className="mt-7 h-4 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all"
            style={{ width: `${eloProgress}%` }}
          />
        </div>
      </section>

      {analysis.limitedData && (
        <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-5 text-cyan-200">
          Begrenset datagrunnlag. Analysen er basert på {analysis.matchCount} matcher. Minst 5 matcher kreves før estimert prestasjons-ELO vises.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-orange-400">AI Coach Roadmap</p>
          <h2 className="mt-2 text-3xl font-black">
            Veien til {formatNumber(profile.targetElo)} ELO
          </h2>
          <div className="mt-6 space-y-4">
            {analysis.priorities.length === 0 ? (
              <p className="text-slate-400">Analyser flere matcher for å bygge en prioritert roadmap.</p>
            ) : (
              analysis.priorities.slice(0, 3).map((skill, index) => (
                <div key={skill.key} className="rounded-xl bg-[#08111f] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <span className="text-3xl font-black text-orange-400">{index + 1}</span>
                      <div>
                        <h3 className="text-xl font-bold">{skill.label}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{skill.explanation}</p>
                      </div>
                    </div>
                    <span className={`rounded-lg px-3 py-2 text-xs font-bold ${statusColor(skill.status)}`}>
                      {skill.status}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between text-sm text-slate-400">
                    <span>Score {skill.score}</span>
                    <span>Mål {skill.target}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.min(100, (skill.score / Math.max(1, skill.target)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">AI Prediction</p>
          <h2 className="mt-2 text-3xl font-black">Estimert prestasjonsnivå</h2>
          {analysis.estimatedElo === null ? (
            <div className="mt-6 rounded-xl bg-[#08111f] p-5 text-slate-300">
              Ikke nok data for et pålitelig estimat. Analyser minst 5 matcher.
            </div>
          ) : (
            <>
              <p className="mt-6 text-5xl font-black text-cyan-400">
                {formatNumber(analysis.estimatedElo)} ELO
              </p>
              <p className="mt-3 text-slate-400">
                Estimat basert på tilgjengelige kampdata. Dette er ikke faktisk eller garantert Premier-rating.
              </p>
            </>
          )}
          <div className="mt-6 rounded-xl bg-[#08111f] p-5">
            <p className="text-sm uppercase text-slate-500">Største prestasjonsgap</p>
            <p className="mt-2 text-2xl font-bold text-orange-400">
              {analysis.largestGap?.label || "Ikke nok data"}
            </p>
            {analysis.largestGap && (
              <p className="mt-2 text-slate-300">
                {analysis.largestGap.gap} poeng under målet for {formatNumber(profile.targetElo)} ELO.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <p className="text-sm font-bold uppercase tracking-wider text-purple-400">Skill Scorecard</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {analysis.skills.map((skill) => (
            <div key={skill.key} className="rounded-xl bg-[#08111f] p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold">{skill.label}</h3>
                <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${statusColor(skill.status)}`}>
                  {skill.status}
                </span>
              </div>
              <p className="mt-4 text-4xl font-black">{skill.score}</p>
              <p className="mt-1 text-sm text-slate-500">Target {skill.target}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${skill.score >= skill.target ? "bg-green-500" : "bg-orange-500"}`}
                  style={{ width: `${Math.min(100, skill.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-green-400">Current AI Tasks</p>
          <div className="mt-5 space-y-4">
            {analysis.tasks.length === 0 ? (
              <p className="text-slate-400">Ingen oppgaver generert ennå.</p>
            ) : (
              analysis.tasks.map((task) => (
                <div key={task.id} className="rounded-xl bg-[#08111f] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold">{task.title}</h3>
                    <span className={task.priority === "HIGH" ? "text-red-400" : task.priority === "MEDIUM" ? "text-orange-400" : "text-cyan-400"}>
                      {task.priority}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{task.description}</p>
                  <p className="mt-3 text-sm font-semibold text-green-400">{task.action}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-blue-400">Last 10 Matches</p>
          <h2 className="mt-2 text-2xl font-black">Trendoversikt</h2>
          <div className="mt-6 space-y-4">
            {analysis.trends.length === 0 ? (
              <p className="text-slate-400">Ingen matcher tilgjengelig.</p>
            ) : (
              analysis.trends.map((trend, index) => (
                <div key={`${trend.label}-${index}`} className="grid grid-cols-[34px_repeat(5,1fr)] items-center gap-3 rounded-xl bg-[#08111f] p-3 text-center text-sm">
                  <span className="text-slate-500">{index + 1}</span>
                  <TrendValue label="K/D" value={trend.kd.toFixed(2)} />
                  <TrendValue label="HS" value={`${trend.hs}%`} />
                  <TrendValue label="Opening" value={trend.opening} />
                  <TrendValue label="Utility" value={trend.utility} />
                  <TrendValue label="Clutch" value={trend.clutch} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TrendValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-600">{label}</p>
      <p className="mt-1 font-bold text-slate-200">{value}</p>
    </div>
  );
}
