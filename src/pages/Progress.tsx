import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToMatches, type FirestoreMatch } from "../services/matchService";
import { analyzeProgress, defaultProgressProfile, saveProgressProfile, subscribeToProgressProfile, type ProgressAnalysis, type ProgressProfile, type SkillProgress } from "../services/progressService";
import { getPremierTier } from "../data/eloTargets";

const emptyAnalysis: ProgressAnalysis = { matchCount: 0, analyzedWindow: 30, limitedData: true, skills: [], priorities: [], tasks: [], estimatedElo: null, largestGap: null };
const format = (value: number) => new Intl.NumberFormat("nb-NO").format(value);
const statusClass = (status: SkillProgress["status"]) => status === "ON TARGET" ? "text-green-400 bg-green-500/10" : status === "IMPROVING" ? "text-cyan-400 bg-cyan-500/10" : status === "HIGH PRIORITY" ? "text-red-400 bg-red-500/10" : status === "NEEDS WORK" ? "text-orange-400 bg-orange-500/10" : "text-slate-400 bg-slate-500/10";

export default function Progress() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ProgressProfile>(defaultProgressProfile);
  const [draft, setDraft] = useState<ProgressProfile>(defaultProgressProfile);
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);
  const [selected, setSelected] = useState<SkillProgress | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const a = subscribeToProgressProfile(user.uid, (next) => { setProfile(next); setDraft(next); }, (e) => setError(e.message));
    const b = subscribeToMatches(user.uid, setMatches, (e) => setError(e.message));
    return () => { a(); b(); };
  }, [user]);

  const analysis = useMemo(() => user ? analyzeProgress(matches, profile) : emptyAnalysis, [matches, profile, user]);
  const rankedSkills = analysis.skills.filter((skill) => skill.key !== "clutch");
  const clutchSkill = analysis.skills.find((skill) => skill.key === "clutch") || null;
  const progress = profile.targetElo ? Math.min(100, profile.currentElo / profile.targetElo * 100) : 0;
  async function saveGoal() {
    if (!user) return;
    setSaving(true);
    try { await saveProgressProfile(user.uid, draft); setEditing(false); } catch (e) { setError(e instanceof Error ? e.message : "Lagring feilet"); } finally { setSaving(false); }
  }
  if (loading) return <div className="text-slate-400">Laster Progress V2...</div>;
  if (!user) return <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8"><h1 className="text-4xl font-black">Logg inn for å se Progress V2</h1></div>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-[.25em] text-orange-400">Coach V2</p><h1 className="mt-2 text-5xl font-black">PROGRESS</h1><p className="mt-2 text-slate-400">Skill ELO beregnet fra opptil de siste {analysis.analyzedWindow} kampene.</p></div>
      <button onClick={() => setEditing(true)} className="rounded-xl border border-orange-500 px-5 py-3 font-bold text-orange-400">Endre ELO-mål</button>
    </header>
    {error && <div className="rounded-2xl border border-red-500/50 bg-red-950/50 p-5 text-red-200">{error}</div>}
    {editing && <section className="rounded-2xl border border-orange-500/30 bg-[#0c1426] p-6"><h2 className="text-2xl font-black">ELO Settings</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><EloInput label="Nåværende ELO" value={draft.currentElo} onChange={(value) => setDraft((p) => ({...p,currentElo:value}))}/><EloInput label="Mål-ELO" value={draft.targetElo} onChange={(value) => setDraft((p) => ({...p,targetElo:value}))}/></div><div className="mt-5 flex gap-3"><button onClick={saveGoal} className="rounded-xl bg-orange-500 px-5 py-3 font-black text-black">{saving ? "Lagrer..." : "Lagre"}</button><button onClick={() => {setDraft(profile);setEditing(false)}} className="rounded-xl border border-[#263754] px-5 py-3 text-slate-300">Avbryt</button></div></section>}

    <section className="rounded-3xl border border-orange-500/25 bg-gradient-to-br from-[#121d33] to-[#08111f] p-7">
      <div className="flex flex-wrap items-start justify-between gap-6"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-orange-400">Road to {format(profile.targetElo)} ELO</p><h2 className="mt-3 text-5xl font-black">{format(profile.currentElo)} <span className="text-2xl text-slate-500">/ {format(profile.targetElo)}</span></h2><p className="mt-3 text-slate-300">{format(Math.max(0,profile.targetElo-profile.currentElo))} ELO gjenstår.</p></div><div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 px-6 py-4 text-center"><p className="text-xs uppercase text-orange-300">Premier Progress</p><p className="mt-1 text-4xl font-black text-orange-400">{progress.toFixed(1)}%</p></div></div>
      <div className="mt-7 h-4 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-orange-500" style={{width:`${progress}%`}}/></div>
    </section>

    {analysis.limitedData && <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-5 text-cyan-200">Foreløpig modell basert på {analysis.matchCount} matcher. Minst 5 kreves, og 30 gir best sammenligningsgrunnlag.</div>}

    <section>
      <p className="text-sm font-bold uppercase tracking-wider text-purple-400">Ranked Skill ELO</p>
      <h2 className="mt-2 text-3xl font-black">Ferdighetene som bestemmer nivået ditt</h2>
      <p className="mt-2 text-slate-400">Samlet Skill ELO beregnes kun fra Aim, Opening, Utility og Impact.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rankedSkills.map((skill) => (
          <SkillCard key={skill.key} skill={skill} onClick={() => setSelected(skill)} />
        ))}
      </div>
    </section>

    {clutchSkill && (
      <section className="rounded-2xl border border-cyan-500/20 bg-[#0c1426] p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">Bonus Metric</p>
            <h2 className="mt-2 text-3xl font-black">Clutch Analysis</h2>
            <p className="mt-3 max-w-2xl text-slate-400">
              Clutch måles og vises separat fordi 1vX-situasjoner forekommer ujevnt. Clutch påvirker ikke samlet Skill ELO, Roadmap eller prioriterte AI Tasks.
            </p>
          </div>
          <SkillCard skill={clutchSkill} onClick={() => setSelected(clutchSkill)} />
        </div>
      </section>
    )}

    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><p className="text-sm font-bold uppercase text-orange-400">AI Coach Roadmap</p><h2 className="mt-2 text-3xl font-black">Største ELO-gap</h2><div className="mt-6 space-y-4">{analysis.priorities.slice(0,3).map((skill,index)=><button key={skill.key} onClick={()=>setSelected(skill)} className="w-full rounded-xl bg-[#08111f] p-5 text-left"><div className="flex justify-between gap-4"><div><p className="text-xl font-black"><span className="mr-3 text-orange-400">{index+1}</span>{skill.label}</p><p className="mt-2 text-sm text-slate-300">{skill.explanation}</p></div><div className="text-right"><p className="text-2xl font-black text-red-400">-{format(skill.eloGap)}</p><p className="text-xs text-slate-500">ELO gap</p></div></div></button>)}</div></section>
      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><p className="text-sm font-bold uppercase text-cyan-400">Performance Estimate</p><h2 className="mt-2 text-3xl font-black">Samlet Skill ELO</h2><p className="mt-6 text-5xl font-black text-cyan-400">{analysis.estimatedElo === null ? "-" : format(analysis.estimatedElo)}</p><p className="mt-3 text-slate-400">Produktestimat fra Aim, Opening, Utility og Impact. Clutch vises separat og påvirker ikke estimatet. Dette er ikke faktisk Premier-rating.</p>{analysis.largestGap && <div className="mt-6 rounded-xl bg-[#08111f] p-5"><p className="text-xs uppercase text-slate-500">Største flaskehals</p><p className="mt-2 text-2xl font-black text-orange-400">{analysis.largestGap.label}</p></div>}</section>
    </div>

    <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><p className="text-sm font-bold uppercase text-green-400">Current AI Tasks</p><div className="mt-5 grid gap-4 lg:grid-cols-3">{analysis.tasks.map((task)=><div key={task.id} className="rounded-xl bg-[#08111f] p-5"><div className="flex justify-between"><h3 className="font-black">{task.title}</h3><span className="text-orange-400">{task.priority}</span></div><p className="mt-3 text-sm text-slate-300">{task.description}</p><p className="mt-3 text-sm font-semibold text-green-400">{task.action}</p></div>)}</div></section>
    {selected && <SkillDetail skill={selected} onClose={()=>setSelected(null)}/>} 
  </div>;
}

function EloInput({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}) { return <label className="space-y-2"><span className="text-xs uppercase text-slate-500">{label}</span><input type="number" step="100" value={value} onChange={(e)=>onChange(Number(e.target.value))} className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3 text-white"/></label> }
function SkillCard({skill,onClick}:{skill:SkillProgress;onClick:()=>void}) { const tier=getPremierTier(skill.skillElo); return <button onClick={onClick} className={`group rounded-2xl border ${tier.borderClass} ${tier.backgroundClass} p-5 text-left transition hover:-translate-y-1`}><div className="flex justify-between"><h3 className="text-lg font-black">{skill.label}</h3><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${statusClass(skill.status)}`}>{skill.status}</span></div><p className={`mt-5 text-4xl font-black ${tier.textClass}`}>{format(skill.skillElo)}</p><p className="mt-1 text-xs uppercase text-slate-500">Plays like · {tier.name}</p><div className="mt-5 flex justify-between text-sm"><span className="text-slate-500">Råscore {skill.score}</span><span className="text-slate-400">Detaljer ›</span></div></button> }
function SkillDetail({skill,onClose}:{skill:SkillProgress;onClose:()=>void}) { const tier=getPremierTier(skill.skillElo); return <div className="fixed inset-0 z-50 flex justify-end bg-black/75" onMouseDown={(e)=>{if(e.currentTarget===e.target)onClose()}}><aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-[#263754] bg-[#08111f]"><header className="sticky top-0 flex justify-between border-b border-[#182538] bg-[#08111f]/95 p-6"><div><p className="text-sm font-bold uppercase text-orange-400">{skill.label} Analysis</p><h2 className={`mt-2 text-5xl font-black ${tier.textClass}`}>{format(skill.skillElo)} ELO</h2></div><button onClick={onClose} className="h-11 w-11 rounded-full border border-[#263754] text-2xl">×</button></header><div className="space-y-6 p-6"><section className={`rounded-2xl border ${tier.borderClass} ${tier.backgroundClass} p-6`}><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs uppercase text-slate-500">Skill ELO</p><p className={`mt-2 text-3xl font-black ${tier.textClass}`}>{format(skill.skillElo)}</p></div><div><p className="text-xs uppercase text-slate-500">Target</p><p className="mt-2 text-3xl font-black">{format(skill.targetElo)}</p></div><div><p className="text-xs uppercase text-slate-500">Gap</p><p className="mt-2 text-3xl font-black text-red-400">{format(skill.eloGap)}</p></div></div></section><section><p className="text-sm font-bold uppercase text-cyan-400">Stats fra alle tilgjengelige demoer</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{skill.detailStats.map((stat)=><div key={stat.label} className="rounded-xl bg-[#0c1426] p-5"><p className="text-xs uppercase text-slate-500">{stat.label}</p><p className="mt-2 text-3xl font-black">{stat.value}</p></div>)}</div></section><section className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-6"><p className="text-xs font-bold uppercase text-orange-400">AI Interpretation</p><p className="mt-3 leading-7 text-slate-300">{skill.explanation}</p><p className="mt-4 text-sm text-slate-500">Beregningen bruker {skill.dataPoints} gyldige datapunkter fra opptil 30 matcher.</p></section></div></aside></div> }
