export type TrainingExercise = {
  id: string;
  name: string;
  duration: number;
  completed: boolean;
  category: "aim" | "duel" | "utility" | "map-utility" | "clutch";
  reason: string;
  map?: string;
};

type RecommendationContext = {
  mainIssue?: string;
  utilityIssue?: string;
  clutchIssue?: string;
  map?: string;
};

const STORAGE_KEY = "cs2-coach-training";

const mapLabels: Record<string, string> = {
  dust2: "Dust 2",
  mirage: "Mirage",
  inferno: "Inferno",
  nuke: "Nuke",
  ancient: "Ancient",
  anubis: "Anubis",
  cache: "Cache",
};

const catalog: Record<string, Omit<TrainingExercise, "completed">> = {
  "aim-botz": {
    id: "aim-botz",
    name: "Aim Botz",
    duration: 15,
    category: "aim",
    reason: "Forbedre første kule og presisjon før opening-dueller.",
  },
  "hs-only-dm": {
    id: "hs-only-dm",
    name: "HS Only DM",
    duration: 20,
    category: "aim",
    reason: "Tren crosshair placement og kontrollert første kontakt.",
  },
  "recoil-trainer": {
    id: "recoil-trainer",
    name: "Recoil Trainer",
    duration: 10,
    category: "duel",
    reason: "Stabiliser spray etter opening kill og i flerdueller.",
  },
  "popflash-practice": {
    id: "popflash-practice",
    name: "Popflash Practice",
    duration: 15,
    category: "utility",
    reason: "Forbedre flash-timing og redusere flashes uten registrert effekt.",
  },
  "clutch-1v1-decisions": {
    id: "clutch-1v1-decisions",
    name: "1v1 Decision Training",
    duration: 15,
    category: "clutch",
    reason: "Tren lydbruk, tid, objektiv og valg av siste 1v1-duell.",
  },
  "clutch-isolation": {
    id: "clutch-isolation",
    name: "Clutch Isolation",
    duration: 20,
    category: "clutch",
    reason: "Tren på å gjøre 1v2 og 1v3 om til separate 1v1-dueller.",
  },
  "post-kill-repositioning": {
    id: "post-kill-repositioning",
    name: "Post-Kill Repositioning",
    duration: 15,
    category: "clutch",
    reason: "Tren reposisjonering etter hver clutch-kill for å unngå trade og dobbel eksponering.",
  },
  "utility-timing": {
    id: "utility-timing",
    name: "Utility Timing",
    duration: 15,
    category: "utility",
    reason: "Tren HE- og molotov-timing før kontakt og executes.",
  },
};

function normalizeMap(value?: string) {
  return String(value || "unknown").toLowerCase().replace(/^de_/, "");
}

function mapUtilityExercise(mapValue: string): Omit<TrainingExercise, "completed"> {
  const map = normalizeMap(mapValue);
  const label = mapLabels[map] || map.toUpperCase();

  return {
    id: `${map}-utility`,
    name: `${label} Utility Practice`,
    duration: 20,
    category: "map-utility",
    map,
    reason: `Øv smokes, flashes, HE og molotov på ${label}, fordi utility-analysen anbefalte kartspesifikk trening.`,
  };
}

function defaultPlan(): TrainingExercise[] {
  return ["aim-botz", "hs-only-dm", "recoil-trainer"].map((id) => ({
    ...catalog[id],
    completed: false,
  }));
}

export function getTrainingStatus(): TrainingExercise[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const plan = defaultPlan();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    return plan;
  }

  try {
    return JSON.parse(stored) as TrainingExercise[];
  } catch {
    const plan = defaultPlan();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    return plan;
  }
}

export function applyAiRecommendations(
  recommendationIds: string[],
  context: RecommendationContext = {}
): TrainingExercise[] {
  const previous = getTrainingStatus();
  const previousById = new Map(previous.map((exercise) => [exercise.id, exercise]));
  const normalizedMap = normalizeMap(context.map);
  const ids = [...new Set(recommendationIds)].filter(Boolean);

  if (ids.length === 0) return previous;

  const next = ids.map((id) => {
    const definition = id.endsWith("-utility") && !catalog[id]
      ? mapUtilityExercise(id.replace(/-utility$/, "") || normalizedMap)
      : catalog[id] || mapUtilityExercise(normalizedMap);
    const old = previousById.get(definition.id);

    return {
      ...definition,
      reason:
        definition.category === "map-utility" && context.utilityIssue
          ? `${definition.reason} Funn: ${context.utilityIssue}.`
          : definition.category === "clutch" && context.clutchIssue
            ? `${definition.reason} Funn: ${context.clutchIssue}.`
            : definition.reason,
      completed: old?.completed ?? false,
    };
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("training-plan-updated"));
  return next;
}

export function updateExerciseStatus(id: string, completed: boolean) {
  const updated = getTrainingStatus().map((exercise) =>
    exercise.id === id ? { ...exercise, completed } : exercise
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event("training-plan-updated"));
  return updated;
}

export function resetTrainingStatus() {
  const reset = getTrainingStatus().map((exercise) => ({
    ...exercise,
    completed: false,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
  window.dispatchEvent(new Event("training-plan-updated"));
  return reset;
}
