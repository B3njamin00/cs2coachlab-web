import { useEffect, useState } from "react";
import {
  getTrainingStatus,
  updateExerciseStatus,
  resetTrainingStatus,
  type TrainingExercise,
} from "../data/trainingStatus";

export default function Exercises() {
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);

  useEffect(() => {
    const refresh = () => setExercises(getTrainingStatus());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("training-plan-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("training-plan-updated", refresh);
    };
  }, []);

  const completedCount = exercises.filter((exercise) => exercise.completed).length;
  const progress = exercises.length
    ? (completedCount / exercises.length) * 100
    : 0;
  const mapExercises = exercises.filter(
    (exercise) => exercise.category === "map-utility"
  );
  const clutchExercises = exercises.filter(
    (exercise) => exercise.category === "clutch"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black tracking-tight text-white">
            EXERCISES
          </h1>
          <p className="mt-2 text-slate-400">
            Treningsplan generert fra siste demoanalyse
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExercises(resetTrainingStatus())}
          className="rounded-xl border border-red-500 px-5 py-3 font-semibold text-red-400 transition hover:bg-red-500 hover:text-white"
        >
          Nullstill status
        </button>
      </div>

      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <p className="text-sm font-bold uppercase tracking-wider text-orange-400">
          AI-anbefalt treningsplan
        </p>
        <h2 className="mt-3 text-3xl font-bold">
          {exercises.length} prioriterte øvelser
        </h2>
        <p className="mt-3 max-w-3xl text-slate-300">
          Planen oppdateres når en ny demo analyseres. Fullført-status beholdes
          dersom samme øvelse anbefales igjen.
        </p>
      </div>

      {mapExercises.length > 0 && (
        <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Map Utility Focus
          </p>
          <p className="mt-3 text-slate-300">
            {mapExercises.map((exercise) => exercise.name).join(", ")}
          </p>
        </div>
      )}

      {clutchExercises.length > 0 && (
        <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-orange-400">Clutch Focus</p>
          <p className="mt-3 text-slate-300">{clutchExercises.map((exercise) => exercise.name).join(", ")}</p>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        {exercises.map((exercise) => (
          <div
            key={exercise.id}
            className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  {exercise.category.replace("-", " ")}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{exercise.name}</h3>
                <p className="mt-2 text-slate-400">
                  Anbefalt tid: {exercise.duration} min
                </p>
              </div>
              <span
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  exercise.completed
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {exercise.completed ? "FULLFØRT" : "IKKE FULLFØRT"}
              </span>
            </div>

            <p className="mt-6 min-h-20 text-sm leading-6 text-slate-300">
              {exercise.reason}
            </p>

            <button
              type="button"
              disabled={exercise.completed}
              onClick={() =>
                setExercises(updateExerciseStatus(exercise.id, true))
              }
              className={`mt-6 w-full rounded-xl py-3 font-semibold transition ${
                exercise.completed
                  ? "cursor-default bg-green-500 text-black"
                  : "border border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-black"
              }`}
            >
              {exercise.completed ? "Fullført" : "Fullfør øvelse"}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <h2 className="text-3xl font-bold">Daglig Fremgang</h2>
        <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-orange-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-4 text-slate-400">
          {completedCount} av {exercises.length} øvelser fullført
        </p>
      </div>
    </div>
  );
}
