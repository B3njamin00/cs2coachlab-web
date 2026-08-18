import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrainingStatus, type TrainingExercise } from "../data/trainingStatus";

type MapWinData = { map: string; matches: number; wins: number; losses: number; draws: number; winRate: number };
type KeyMoment = { round: number; tick: number; type: "opening_kill" | "opening_death"; opponent: string; weapon: string; roundWon: boolean | null };
type AiCoach = {
  openingDuels: { opportunities: number; won: number; lost: number; winRate: number; teamWinsAfterOpeningKill: number; teamLossesAfterOpeningDeath: number };
  keyMoments: KeyMoment[];
  feedback: { grade: string; mainIssue: string; strength: string; summary: string; nextMatchFocus: string; recommendedExercises: string[] };
};
type RecentMatch = { id: string; fileName: string; analyzedAt: string; map?: string; result?: "win" | "loss" | "draw"; won?: boolean; analysis?: { kd?: number; hsPercent?: number }; aiCoach?: AiCoach };
type DashboardData = { totalMatches: number; averageKd: number; averageHsPercent: number; totalKills: number; totalDeaths: number; bestWeapon: string; weaponStats: Record<string, number>; latestCoachScore: string; latestFocusArea: string; latestAiCoach: AiCoach | null; recentMatches: RecentMatch[]; mapWins: MapWinData[] };

const emptyData: DashboardData = { totalMatches: 0, averageKd: 0, averageHsPercent: 0, totalKills: 0, totalDeaths: 0, bestWeapon: "Ingen", weaponStats: {}, latestCoachScore: "-", latestFocusArea: "-", latestAiCoach: null, recentMatches: [], mapWins: [] };
const maps = ["dust2", "mirage", "inferno", "nuke", "ancient", "anubis", "cache"];
const mapLabels: Record<string, string> = { dust2: "Dust 2", mirage: "Mirage", inferno: "Inferno", nuke: "Nuke", ancient: "Ancient", anubis: "Anubis", cache: "Cache" };
const weaponLabels: Record<string, string> = { ak47: "AK-47", m4a1_silencer: "M4A1-S", m4a1: "M4A4", glock: "Glock-18", fiveseven: "Five-SeveN", deagle: "Desert Eagle", usp_silencer: "USP-S", awp: "AWP" };
const weaponName = (name: string) => weaponLabels[name] || name.replaceAll("_", " ").toUpperCase();
const mapName = (name?: string) => name ? mapLabels[name.replace(/^de_/, "")] || name : "Ukjent kart";

function point(index: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / maps.length;
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

function Radar({ data }: { data: MapWinData[] }) {
  const center = 195, radius = 125;
  const values = maps.map((map) => data.find((item) => item.map === map)?.wins || 0);
  const max = Math.max(...values, 1);
  const polygon = values.map((value, index) => {
    const p = point(index, radius * value / max, center); return `${p.x},${p.y}`;
  }).join(" ");
  return <svg viewBox="0 0 390 390" className="w-full overflow-visible">
    {[.25,.5,.75,1].map((level) => <polygon key={level} points={maps.map((_, index) => { const p = point(index, radius * level, center); return `${p.x},${p.y}` }).join(" ")} fill="none" stroke="#24344d" />)}
    {maps.map((_, index) => { const p = point(index, radius, center); return <line key={index} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#24344d" /> })}
    <polygon points={polygon} fill="rgba(249,115,22,.35)" stroke="#f97316" strokeWidth="3" />
    {maps.map((map,index) => { const p = point(index, radius + 40, center); const wins = values[index]; return <g key={map}><text x={p.x} y={p.y-4} textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="700">{mapLabels[map]}</text><text x={p.x} y={p.y+14} textAnchor="middle" fill="#fb923c" fontSize="12">{wins} wins</text></g> })}
  </svg>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData);
  const [training, setTraining] = useState<TrainingExercise[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/api/dashboard").then((response) => response.json()).then((data) => setDashboard({ ...emptyData, ...data })).catch(console.error);
    setTraining(getTrainingStatus());
    const refresh = () => setTraining(getTrainingStatus());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const topWeapons = useMemo(() => Object.entries(dashboard.weaponStats).sort((a,b) => b[1]-a[1]).slice(0,3), [dashboard.weaponStats]);
  const maxWeapon = Math.max(...topWeapons.map(([,kills]) => kills), 1);
  const coach = dashboard.latestAiCoach;

  return <div className="space-y-6">
    <div className="flex items-start justify-between"><div><h1 className="text-5xl font-black">DASHBOARD</h1><p className="mt-2 text-slate-400">Oversikt over utviklingen din</p></div><button onClick={() => navigate("/demo-analyzer")} className="rounded-xl border border-orange-500 px-5 py-3 text-orange-400">Importer demo</button></div>

    <div className="grid gap-5 xl:grid-cols-5">
      {[["Matches Analyzed",dashboard.totalMatches,"text-white"],["Average K/D",dashboard.averageKd.toFixed(2),"text-cyan-400"],["Average HS%",`${dashboard.averageHsPercent}%`,"text-purple-400"],["Best Weapon",weaponName(dashboard.bestWeapon),"text-orange-400"],["AI Coach Grade",dashboard.latestCoachScore,"text-orange-400"]].map(([label,value,color]) => <div key={String(label)} className="rounded-2xl border border-[#182538] bg-[#0c1426] p-5"><p className="text-sm uppercase text-slate-400">{label}</p><h2 className={`mt-3 text-4xl font-black ${color}`}>{value}</h2></div>)}
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1.1fr]">
      <div className="rounded-2xl border border-orange-500/25 bg-[#0c1426] p-6">
        <p className="text-sm font-bold uppercase text-orange-400">AI Coach Focus</p>
        <h2 className="mt-3 text-4xl font-black text-orange-400">{coach?.feedback.mainIssue || dashboard.latestFocusArea}</h2>
        <p className="mt-5 text-slate-300">{coach?.feedback.summary || "Analyser en demo for AI-feedback."}</p>
        {coach && <><p className="mt-6 text-sm uppercase text-slate-400">Neste kamp</p><p className="mt-2 font-bold">{coach.feedback.nextMatchFocus}</p><div className="mt-6 grid grid-cols-3 gap-3"><div className="rounded-xl bg-slate-900 p-3"><p className="text-slate-400">Opening</p><p className="text-2xl font-bold">{coach.openingDuels.opportunities}</p></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-slate-400">Won</p><p className="text-2xl font-bold text-green-400">{coach.openingDuels.won}</p></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-slate-400">Lost</p><p className="text-2xl font-bold text-red-400">{coach.openingDuels.lost}</p></div></div></>}
        <div className="mt-6 space-y-3">{training.map((exercise) => <div key={exercise.id} className="flex justify-between"><span>{exercise.name}</span><span className={exercise.completed ? "text-green-400" : "text-red-400"}>{exercise.completed ? "FULLFØRT" : "IKKE FULLFØRT"}</span></div>)}</div>
        <button onClick={() => navigate("/exercises")} className="mt-7 rounded-xl border border-orange-500 px-5 py-3 text-orange-400">Start treningsøkt</button>
      </div>

      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><h2 className="text-3xl font-bold">Siste Kamper</h2><div className="mt-5 space-y-3">{dashboard.recentMatches.map((match) => <div key={match.id} className="flex justify-between rounded-xl bg-[#08111f] p-4"><div><p className="font-bold">{mapName(match.map)}</p><p className="text-sm text-slate-400">K/D {match.analysis?.kd || 0}</p></div><span className={match.result === "win" ? "font-bold text-green-400" : "font-bold text-red-400"}>{match.result === "win" ? "SEIER" : match.result === "draw" ? "UAVGJORT" : "TAP"}</span></div>)}</div></div>

      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><h2 className="text-3xl font-bold">Opening Duel Report</h2>{coach ? <div className="mt-5"><p className="text-5xl font-black text-orange-400">{coach.openingDuels.winRate}%</p><p className="mt-2 text-slate-400">opening win rate</p><p className="mt-6 font-bold text-green-400">{coach.feedback.strength}</p><div className="mt-5 space-y-2">{coach.keyMoments.slice(0,4).map((moment) => <div key={`${moment.round}-${moment.tick}`} className="flex justify-between rounded-lg bg-[#08111f] p-3"><span>Runde {moment.round}</span><span className={moment.type === "opening_kill" ? "text-green-400" : "text-red-400"}>{moment.type === "opening_kill" ? "KILL" : "DEATH"}</span></div>)}</div></div> : <p className="mt-5 text-slate-500">Ingen AI-analyse ennå.</p>}</div>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><h2 className="text-3xl font-bold">Weapon Performance</h2><div className="mt-5 space-y-5">{topWeapons.map(([weapon,kills]) => <div key={weapon}><div className="flex justify-between"><span>{weaponName(weapon)}</span><span>{kills} kills</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-orange-500" style={{width:`${kills/maxWeapon*100}%`}} /></div></div>)}</div></div>
      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><div className="flex justify-between"><div><h2 className="text-3xl font-bold">Map Strength</h2><p className="text-sm text-slate-400">Kun seire</p></div><span className="text-orange-400">{dashboard.mapWins.reduce((sum,map)=>sum+map.wins,0)} wins</span></div><Radar data={dashboard.mapWins} /></div>
      <div className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><h2 className="text-3xl font-bold">Siste Demoer</h2><div className="mt-5 space-y-3">{dashboard.recentMatches.map((match) => <div key={match.id} className="rounded-xl bg-[#08111f] p-4"><p className="truncate">{match.fileName}</p><p className="mt-2 text-sm text-cyan-400">{mapName(match.map)} · K/D {match.analysis?.kd || 0}</p></div>)}</div></div>
    </div>
  </div>;
}
