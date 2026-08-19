import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getTrainingStatus,
  type TrainingExercise,
} from "../data/trainingStatus";
import {
  createDashboardData,
  subscribeToMatches,
  type DashboardData,
} from "../services/matchService";

const emptyData: DashboardData = {
  totalMatches: 0,
  averageKd: 0,
  averageHsPercent: 0,
  totalKills: 0,
  totalDeaths: 0,
  bestWeapon: "Ingen",
  weaponStats: {},
  latestCoachScore: "-",
  latestFocusArea: "-",
  latestAiCoach: null,
  recentMatches: [],
  mapWins: [],
};

const maps = [
  "dust2",
  "mirage",
  "inferno",
  "nuke",
  "ancient",
  "anubis",
  "cache",
];

const mapLabels: Record<string, string> = {
  dust2: "Dust 2",
  mirage: "Mirage",
  inferno: "Inferno",
  nuke: "Nuke",
  ancient: "Ancient",
  anubis: "Anubis",
  cache: "Cache",
};

const weaponLabels: Record<string, string> = {
  ak47: "AK-47",
  m4a1_silencer: "M4A1-S",
  m4a1: "M4A4",
  glock: "Glock-18",
  fiveseven: "Five-SeveN",
  deagle: "Desert Eagle",
  usp_silencer: "USP-S",
  awp: "AWP",
};

function weaponName(name: string) {
  return weaponLabels[name] || name.replaceAll("_", " ").toUpperCase();
}

function mapName(name?: string) {
  if (!name) return "Ukjent kart";
  const normalized = name.toLowerCase().replace(/^de_/, "");
  return mapLabels[normalized] || normalized.toUpperCase();
}

function point(index: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / maps.length;

  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}

function Radar({ data }: { data: DashboardData["mapWins"] }) {
  const center = 195;
  const radius = 125;

  const values = maps.map(
    (map) => data.find((item) => item.map === map)?.wins || 0
  );

  const maximum = Math.max(...values, 1);

  const polygon = values
    .map((value, index) => {
      const chartPoint = point(index, (radius * value) / maximum, center);
      return `${chartPoint.x},${chartPoint.y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 390 390" className="w-full overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          points={maps
            .map((_, index) => {
              const chartPoint = point(index, radius * level, center);
              return `${chartPoint.x},${chartPoint.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#24344d"
        />
      ))}

      {maps.map((_, index) => {
        const chartPoint = point(index, radius, center);

        return (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={chartPoint.x}
            y2={chartPoint.y}
            stroke="#24344d"
          />
        );
      })}

      <polygon
        points={polygon}
        fill="rgba(249,115,22,.35)"
        stroke="#f97316"
        strokeWidth="3"
      />

      {maps.map((map, index) => {
        const chartPoint = point(index, radius + 40, center);
        const wins = values[index];

        return (
          <g key={map}>
            <text
              x={chartPoint.x}
              y={chartPoint.y - 4}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="13"
              fontWeight="700"
            >
              {mapLabels[map]}
            </text>
            <text
              x={chartPoint.x}
              y={chartPoint.y + 14}
              textAnchor="middle"
              fill="#fb923c"
              fontSize="12"
            >
              {wins} wins
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData);
  const [training, setTraining] = useState<TrainingExercise[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setTraining([]);
      return;
    }

    const refreshTraining = () => setTraining(getTrainingStatus());

    refreshTraining();
    window.addEventListener("focus", refreshTraining);
    window.addEventListener("storage", refreshTraining);
    window.addEventListener("training-plan-updated", refreshTraining);

    return () => {
      window.removeEventListener("focus", refreshTraining);
      window.removeEventListener("storage", refreshTraining);
      window.removeEventListener("training-plan-updated", refreshTraining);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDashboard(emptyData);
      setErrorMessage("");
      setIsLoadingMatches(false);
      return;
    }

    setIsLoadingMatches(true);
    setErrorMessage("");

    const unsubscribe = subscribeToMatches(
      user.uid,
      (matches) => {
        setDashboard(createDashboardData(matches));
        setIsLoadingMatches(false);
      },
      (error) => {
        console.error("Kunne ikke hente matcher fra Firestore:", error);
        setDashboard(emptyData);
        setErrorMessage(error.message);
        setIsLoadingMatches(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const topWeapons = useMemo(
    () =>
      Object.entries(dashboard.weaponStats)
        .sort((first, second) => Number(second[1]) - Number(first[1]))
        .slice(0, 3),
    [dashboard.weaponStats]
  );

  const maxWeapon = Math.max(
    ...topWeapons.map(([, kills]) => Number(kills)),
    1
  );

  const coach = dashboard.latestAiCoach;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-8 text-slate-300">
        Laster Firebase-bruker...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-5xl font-black">DASHBOARD</h1>
          <p className="mt-2 text-slate-400">
            Logg inn for å se ditt personlige dashboard
          </p>
        </div>

        <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-8">
          <h2 className="text-3xl font-black text-orange-400">
            Ingen bruker er logget inn
          </h2>
          <p className="mt-4 max-w-2xl text-slate-300">
            Logg inn med Google i sidebaren. Dashboardet henter kun matcher fra
            Firestore-kontoen til den innloggede brukeren.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h1 className="text-5xl font-black">DASHBOARD</h1>
          <p className="mt-2 text-slate-400">
            Firestore-data for {user.displayName || user.email}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/demo-analyzer")}
          className="rounded-xl border border-orange-500 px-5 py-3 text-orange-400 transition hover:bg-orange-500 hover:text-black"
        >
          Importer demo
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/60 p-5 text-red-200">
          Kunne ikke hente Firestore-data: {errorMessage}
        </div>
      )}

      {isLoadingMatches && (
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5 text-slate-300">
          Henter matcher fra Firestore...
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        {[
          ["Matches Analyzed", dashboard.totalMatches, "text-white"],
          ["Average K/D", dashboard.averageKd.toFixed(2), "text-cyan-400"],
          [
            "Average HS%",
            `${dashboard.averageHsPercent}%`,
            "text-purple-400",
          ],
          [
            "Best Weapon",
            weaponName(dashboard.bestWeapon),
            "text-orange-400",
          ],
          [
            "AI Coach Grade",
            dashboard.latestCoachScore,
            "text-orange-400",
          ],
        ].map(([label, value, color]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5"
          >
            <p className="text-sm uppercase text-slate-400">{label}</p>
            <h2 className={`mt-3 text-4xl font-black ${color}`}>{value}</h2>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1.1fr]">
        <div className="rounded-2xl border border-orange-500/25 bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase text-orange-400">
            AI Coach Focus
          </p>
          <h2 className="mt-3 text-4xl font-black text-orange-400">
            {coach?.feedback.mainIssue || dashboard.latestFocusArea}
          </h2>
          <p className="mt-5 text-slate-300">
            {coach?.feedback.summary || "Analyser en demo for AI-feedback."}
          </p>

          {coach && (
            <>
              <p className="mt-6 text-sm uppercase text-slate-400">
                Neste kamp
              </p>
              <p className="mt-2 font-bold">
                {coach.feedback.nextMatchFocus}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <MiniStat
                  label="Opening"
                  value={coach.openingDuels.opportunities}
                />
                <MiniStat
                  label="Won"
                  value={coach.openingDuels.won}
                  color="text-green-400"
                />
                <MiniStat
                  label="Lost"
                  value={coach.openingDuels.lost}
                  color="text-red-400"
                />
              </div>
            </>
          )}

          <div className="mt-6 space-y-3">
            {training.length === 0 ? (
              <p className="text-slate-500">Ingen lokal treningsplan ennå.</p>
            ) : (
              training.map((exercise) => (
                <div
                  key={exercise.id}
                  className="flex justify-between gap-4"
                >
                  <span>{exercise.name}</span>
                  <span
                    className={
                      exercise.completed ? "text-green-400" : "text-red-400"
                    }
                  >
                    {exercise.completed ? "FULLFØRT" : "IKKE FULLFØRT"}
                  </span>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate("/exercises")}
            className="mt-7 rounded-xl border border-orange-500 px-5 py-3 text-orange-400"
          >
            Start treningsøkt
          </button>
        </div>

        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <h2 className="text-3xl font-bold">Siste Kamper</h2>

          <div className="mt-5 space-y-3">
            {dashboard.recentMatches.length === 0 ? (
              <p className="text-slate-500">Ingen Firestore-matcher ennå.</p>
            ) : (
              dashboard.recentMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex justify-between gap-4 rounded-xl bg-[#08111f] p-4"
                >
                  <div>
                    <p className="font-bold">{mapName(match.map)}</p>
                    <p className="text-sm text-slate-400">
                      K/D {match.analysis?.kd || 0}
                    </p>
                  </div>
                  <span
                    className={
                      match.result === "win"
                        ? "font-bold text-green-400"
                        : match.result === "draw"
                          ? "font-bold text-yellow-400"
                          : "font-bold text-red-400"
                    }
                  >
                    {match.result === "win"
                      ? "SEIER"
                      : match.result === "draw"
                        ? "UAVGJORT"
                        : "TAP"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <h2 className="text-3xl font-bold">Opening Duel Report</h2>

          {coach ? (
            <div className="mt-5">
              <p className="text-5xl font-black text-orange-400">
                {coach.openingDuels.winRate}%
              </p>
              <p className="mt-2 text-slate-400">opening win rate</p>
              <p className="mt-6 font-bold text-green-400">
                {coach.feedback.strength}
              </p>

              <div className="mt-5 space-y-2">
                {coach.keyMoments.slice(0, 4).map((moment) => (
                  <div
                    key={`${moment.round}-${moment.tick}`}
                    className="flex justify-between rounded-lg bg-[#08111f] p-3"
                  >
                    <span>Runde {moment.round}</span>
                    <span
                      className={
                        moment.type === "opening_kill"
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {moment.type === "opening_kill" ? "KILL" : "DEATH"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-slate-500">Ingen AI-analyse ennå.</p>
          )}
        </div>
      </div>

      {coach?.clutch && (
        <div className="rounded-2xl border border-cyan-500/25 bg-[#0c1426] p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">Clutch Coach</p>
              <h2 className="mt-2 text-3xl font-black">{coach.clutch.feedback.mainIssue}</h2>
              <p className="mt-3 text-slate-300">{coach.clutch.feedback.summary}</p>
            </div>
            <div className="rounded-xl bg-cyan-500/10 px-5 py-3 text-center">
              <p className="text-xs uppercase text-cyan-300">Clutch Grade</p>
              <p className="text-3xl font-black text-cyan-400">{coach.clutch.feedback.grade}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Muligheter" value={coach.clutch.stats.opportunities} />
            <MiniStat label="Vunnet" value={coach.clutch.stats.won} color="text-green-400" />
            <MiniStat label="Tapt" value={coach.clutch.stats.lost} color="text-red-400" />
            <MiniStat label="Win rate" value={coach.clutch.stats.winRate} color="text-cyan-400" />
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-slate-400">Største seier</p><p className="text-2xl font-bold text-orange-400">{coach.clutch.stats.largestClutchWon || "-"}</p></div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {coach.clutch.situations.slice(0, 6).map((situation) => (
              <div key={`${situation.round}-${situation.startTick}`} className="flex items-center justify-between rounded-xl bg-[#08111f] p-4">
                <div><p className="font-bold">Runde {situation.round} · {situation.type}</p><p className="mt-1 text-sm text-slate-400">{situation.killsAfterStart} kills · {situation.headshots} headshots</p></div>
                <span className={situation.result === "won" ? "font-black text-green-400" : "font-black text-red-400"}>{situation.result === "won" ? "VUNNET" : "TAPT"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <h2 className="text-3xl font-bold">Weapon Performance</h2>

          <div className="mt-5 space-y-5">
            {topWeapons.length === 0 ? (
              <p className="text-slate-500">Ingen våpendata ennå.</p>
            ) : (
              topWeapons.map(([weapon, kills]) => (
                <div key={weapon}>
                  <div className="flex justify-between">
                    <span>{weaponName(weapon)}</span>
                    <span>{kills} kills</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-orange-500"
                      style={{
                        width: `${(Number(kills) / maxWeapon) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <div className="flex justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Map Strength</h2>
              <p className="text-sm text-slate-400">Kun seire</p>
            </div>
            <span className="text-orange-400">
              {dashboard.mapWins.reduce((sum, map) => sum + map.wins, 0)} wins
            </span>
          </div>
          <Radar data={dashboard.mapWins} />
        </div>

        <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <h2 className="text-3xl font-bold">Siste Demoer</h2>

          <div className="mt-5 space-y-3">
            {dashboard.recentMatches.length === 0 ? (
              <p className="text-slate-500">Ingen Firestore-demoer ennå.</p>
            ) : (
              dashboard.recentMatches.map((match) => (
                <div key={match.id} className="rounded-xl bg-[#08111f] p-4">
                  <p className="truncate">{match.fileName}</p>
                  <p className="mt-2 text-sm text-cyan-400">
                    {mapName(match.map)} · K/D {match.analysis?.kd || 0}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <p className="text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
