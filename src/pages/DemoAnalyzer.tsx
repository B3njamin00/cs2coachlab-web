import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { applyAiRecommendations } from "../data/trainingStatus";
import { saveMatch, type FirestoreMatch } from "../services/matchService";

type Analysis = FirestoreMatch["analysis"];
type AiCoach = NonNullable<FirestoreMatch["aiCoach"]>;

type AnalyzeResponse = {
  players?: string[];
  analysis?: Analysis;
  aiCoach?: AiCoach;
  match?: {
    map: string;
    won: boolean;
    result: "win" | "loss" | "draw";
    score: {
      player: number;
      opponent: number;
    };
  };
  savedMatch?: FirestoreMatch;
  wasAlreadySaved?: boolean;
  error?: string;
};

export default function DemoAnalyzer() {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [aiCoach, setAiCoach] = useState<AiCoach | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  async function analyzeDemo() {
    if (!user) {
      setErrorMessage("Logg inn med Google før du analyserer en demo.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Velg en demo først.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage("");
    setSaveMessage("");

    try {
      const formData = new FormData();
      formData.append("demo", selectedFile);

      if (playerName) {
        formData.append("playerName", playerName);
      }

      const response = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let data: AnalyzeResponse;

      try {
        data = JSON.parse(responseText) as AnalyzeResponse;
      } catch {
        throw new Error(
          `API-et returnerte et ugyldig svar (${response.status}). Sjekk terminalen der server.mjs kjører.`
        );
      }

      if (!response.ok) {
        throw new Error(data.error || "Analysen feilet.");
      }

      if (data.players) {
        setPlayers(data.players);
      }

      if (data.analysis) {
        setAnalysis(data.analysis);
      }

      if (data.analysis && data.aiCoach && data.match && data.savedMatch) {
        setAiCoach(data.aiCoach);

        const cloudMatch: FirestoreMatch = {
          ...data.savedMatch,
          analysis: data.analysis,
          aiCoach: data.aiCoach,
          map: data.match.map,
          won: data.match.won,
          result: data.match.result,
          score: data.match.score,
        };

        console.log("Lagrer match i Firestore", {
          uid: user.uid,
          matchId: cloudMatch.id,
        });

        await saveMatch(user.uid, cloudMatch);

        console.log("Match lagret i Firestore", cloudMatch.id);

        applyAiRecommendations(data.aiCoach.feedback.recommendedExercises, {
          mainIssue: data.aiCoach.feedback.mainIssue,
          utilityIssue: data.aiCoach.utility?.feedback.mainIssue,
          map: data.aiCoach.utility?.map || data.match.map,
        });

        setSaveMessage(
          data.wasAlreadySaved
            ? "Kampen ble oppdatert i Firestore."
            : "Kampen ble lagret i Firestore og treningsplanen ble generert."
        );
      } else if (data.analysis) {
        throw new Error(
          "Analysen ble fullført, men API-svaret mangler savedMatch, match eller aiCoach."
        );
      }
    } catch (error) {
      console.error("Demoanalyse eller Firestore-lagring feilet:", error);
      setErrorMessage(error instanceof Error ? error.message : "Ukjent feil.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function chooseFile(file: File) {
    setSelectedFile(file);
    setPlayers([]);
    setPlayerName("");
    setAnalysis(null);
    setAiCoach(null);
    setErrorMessage("");
    setSaveMessage("");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-5xl font-black">Demo Analyzer</h1>
        <p className="mt-3 text-slate-400">
          Last opp en CS2-demo for opening duel-, utility- og treningsanalyse.
        </p>
      </div>

      {!user && (
        <div className="rounded-2xl border border-orange-500/50 bg-orange-950/40 p-6 text-orange-200">
          Logg inn med Google før du analyserer og lagrer demoer.
        </div>
      )}

      <label className="flex min-h-[250px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-500 bg-slate-900 p-8 text-center hover:bg-slate-800">
        <div className="text-6xl">📁</div>
        <h2 className="mt-4 text-2xl font-bold">Drag & Drop Demo</h2>
        <p className="mt-2 text-slate-400">
          Eller klikk for å velge en .dem-fil
        </p>
        <input
          type="file"
          accept=".dem"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) chooseFile(file);
          }}
        />
      </label>

      {selectedFile && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Valgt demo</h2>
          <p className="mt-4 break-all">📄 {selectedFile.name}</p>
          <p className="text-slate-400">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <button
            type="button"
            onClick={analyzeDemo}
            disabled={isAnalyzing || !user}
            className="mt-5 rounded-xl bg-cyan-500 px-6 py-3 font-bold text-slate-950 disabled:opacity-50"
          >
            {isAnalyzing
              ? "Analyserer..."
              : players.length
                ? "Oppdater spillerliste"
                : "Finn spillere"}
          </button>
        </div>
      )}

      {players.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Velg spiller</h2>
          <select
            value={playerName}
            onChange={(event) => {
              setPlayerName(event.target.value);
              setAnalysis(null);
              setAiCoach(null);
            }}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            <option value="">Velg spiller</option>
            {players.map((player) => (
              <option key={player} value={player}>
                {player}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={analyzeDemo}
            disabled={!playerName || isAnalyzing || !user}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-slate-950 disabled:opacity-50"
          >
            {isAnalyzing ? "Analyserer..." : "Analyser spiller"}
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/60 p-6 text-red-200">
          {errorMessage}
        </div>
      )}

      {analysis && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Match Report</h2>
              <p className="mt-1 text-slate-400">Analyse av {analysis.player}</p>
            </div>
            <div className="rounded-xl bg-cyan-500/10 px-5 py-3 text-center">
              <p className="text-xs uppercase text-cyan-300">Score</p>
              <p className="text-3xl font-black text-cyan-400">
                {analysis.coachScore}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Kills" value={analysis.kills} color="text-green-400" />
            <Stat label="Deaths" value={analysis.deaths} color="text-red-400" />
            <Stat label="K/D" value={analysis.kd} color="text-cyan-400" />
            <Stat
              label="HS%"
              value={`${analysis.hsPercent}%`}
              color="text-orange-400"
            />
          </div>
        </div>
      )}

      {aiCoach && (
        <div className="rounded-2xl border border-orange-500/30 bg-[#0c1426] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-orange-400">
                AI Coach
              </p>
              <h2 className="mt-2 text-3xl font-black">
                {aiCoach.feedback.mainIssue}
              </h2>
              {aiCoach.feedback.secondaryIssue && (
                <p className="mt-2 text-slate-400">
                  Sekundært: {aiCoach.feedback.secondaryIssue}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-orange-500/10 px-5 py-3 text-center">
              <p className="text-xs uppercase text-orange-300">Coach Grade</p>
              <p className="text-3xl font-black text-orange-400">
                {aiCoach.feedback.grade}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Stat label="Opening" value={aiCoach.openingDuels.opportunities} />
            <Stat
              label="Vunnet"
              value={aiCoach.openingDuels.won}
              color="text-green-400"
            />
            <Stat
              label="Tapt"
              value={aiCoach.openingDuels.lost}
              color="text-red-400"
            />
            <Stat
              label="Win rate"
              value={`${aiCoach.openingDuels.winRate}%`}
              color="text-orange-400"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-slate-900 p-5">
              <p className="text-sm uppercase text-slate-400">
                Coach-oppsummering
              </p>
              <p className="mt-3 text-slate-200">{aiCoach.feedback.summary}</p>
              <p className="mt-5 text-sm uppercase text-slate-400">
                Neste kamp
              </p>
              <p className="mt-2 font-bold text-orange-400">
                {aiCoach.feedback.nextMatchFocus}
              </p>
            </div>

            {aiCoach.utility && (
              <div className="rounded-xl bg-slate-900 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase text-slate-400">
                      Utility Coach · {aiCoach.utility.map}
                    </p>
                    <p className="mt-2 text-xl font-bold text-cyan-400">
                      {aiCoach.utility.feedback.mainIssue}
                    </p>
                  </div>
                  <p className="text-3xl font-black text-cyan-400">
                    {aiCoach.utility.feedback.grade}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <UtilityStat
                    label="Flashes"
                    value={aiCoach.utility.stats.flashesThrown}
                  />
                  <UtilityStat
                    label="Smokes"
                    value={aiCoach.utility.stats.smokesThrown}
                  />
                  <UtilityStat
                    label="HE"
                    value={aiCoach.utility.stats.heGrenadesThrown}
                  />
                  <UtilityStat
                    label="Molotov"
                    value={aiCoach.utility.stats.molotovsThrown}
                  />
                  <UtilityStat
                    label="Blind-events"
                    value={aiCoach.utility.stats.blindEventsCreated}
                  />
                  <UtilityStat
                    label="Util damage"
                    value={
                      aiCoach.utility.stats.heDamage +
                      aiCoach.utility.stats.molotovDamage
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl bg-slate-900 p-5">
            <p className="text-sm uppercase text-slate-400">
              Generert treningsplan
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {aiCoach.feedback.recommendedExercises.map((exercise) => (
                <span
                  key={exercise}
                  className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-400"
                >
                  {exercise}
                </span>
              ))}
            </div>
          </div>

          {saveMessage && (
            <div className="mt-6 text-green-300">{saveMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-800 p-4">
      <p className="text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function UtilityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#0c1426] p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
