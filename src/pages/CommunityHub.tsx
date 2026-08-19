import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { parseCfg } from "../services/cfgParser";
import {
  deleteProConfig,
  downloadCfg,
  PRO_CONFIG_ADMIN_EMAIL,
  saveProConfig,
  subscribeToCommunityConfigs,
  subscribeToProConfigs,
  type CommunityConfig,
  type ProConfig,
} from "../services/communityService";
import type { PreferredRole } from "../services/settingsService";

const roles: PreferredRole[] = ["Entry", "AWPer", "Support", "Lurker", "IGL", "Flex"];

type ProDraft = {
  id: string | null;
  playerName: string;
  team: string;
  role: PreferredRole;
  sourceLabel: string;
  sourceUrl: string;
  dpi: number;
  sensitivity: number;
  zoomSensitivity: number | null;
  crosshairShareCode: string;
  fileName: string;
  content: string;
};

const emptyDraft: ProDraft = {
  id: null,
  playerName: "",
  team: "",
  role: "Flex",
  sourceLabel: "",
  sourceUrl: "",
  dpi: 800,
  sensitivity: 1,
  zoomSensitivity: null,
  crosshairShareCode: "",
  fileName: "",
  content: "",
};

export default function CommunityHub() {
  const { user } = useAuth();
  const [communityConfigs, setCommunityConfigs] = useState<CommunityConfig[]>([]);
  const [proConfigs, setProConfigs] = useState<ProConfig[]>([]);
  const [role, setRole] = useState("all");
  const [minimumElo, setMinimumElo] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProDraft>(emptyDraft);

  const isProAdmin = user?.email?.toLowerCase() === PRO_CONFIG_ADMIN_EMAIL;

  useEffect(() => {
    const unsubscribeCommunity = subscribeToCommunityConfigs(
      setCommunityConfigs,
      (event: Error) => setError(event.message)
    );
    const unsubscribePro = subscribeToProConfigs(
      setProConfigs,
      (event: Error) => setError(event.message)
    );
    return () => {
      unsubscribeCommunity();
      unsubscribePro();
    };
  }, []);

  const filteredCommunity = useMemo(
    () =>
      communityConfigs.filter(
        (config) =>
          (role === "all" || config.role === role) &&
          config.skillElo >= minimumElo
      ),
    [communityConfigs, role, minimumElo]
  );

  const filteredPros = useMemo(
    () =>
      proConfigs.filter((config) => role === "all" || config.role === role),
    [proConfigs, role]
  );

  async function readProCfg(file: File) {
    setError("");
    const content = await file.text();
    if (content.length > 100000) {
      setError("CFG-filen kan ikke være større enn 100 000 tegn.");
      return;
    }
    const parsed = parseCfg(content);
    setDraft((current) => ({
      ...current,
      fileName: file.name,
      content,
      sensitivity: parsed.sensitivity ?? current.sensitivity,
      zoomSensitivity: parsed.zoomSensitivity ?? current.zoomSensitivity,
    }));
  }

  function startEdit(config: ProConfig) {
    setDraft({
      id: config.id,
      playerName: config.playerName,
      team: config.team,
      role: config.role,
      sourceLabel: config.sourceLabel,
      sourceUrl: config.sourceUrl,
      dpi: config.dpi,
      sensitivity: config.sensitivity,
      zoomSensitivity: config.zoomSensitivity,
      crosshairShareCode: config.crosshairShareCode,
      fileName: config.fileName,
      content: config.content,
    });
    setShowEditor(true);
    setError("");
    setSuccess("");
  }

  async function saveDraft() {
    if (!user || !isProAdmin) return;
    if (!draft.playerName.trim() || !draft.fileName || !draft.content) {
      setError("Spillernavn og CFG-fil må fylles ut.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveProConfig(draft.id, {
        playerName: draft.playerName.trim(),
        team: draft.team.trim(),
        role: draft.role,
        sourceLabel: draft.sourceLabel.trim(),
        sourceUrl: draft.sourceUrl.trim(),
        dpi: Math.max(1, Math.round(draft.dpi)),
        sensitivity: Math.max(0.01, draft.sensitivity),
        edpi: Math.round(draft.dpi * draft.sensitivity),
        zoomSensitivity: draft.zoomSensitivity,
        crosshairShareCode: draft.crosshairShareCode.trim(),
        fileName: draft.fileName,
        content: draft.content,
        createdByUid: user.uid,
        createdByEmail: user.email || "",
      });
      setSuccess(`${draft.playerName} sin config ble lagret.`);
      setDraft(emptyDraft);
      setShowEditor(false);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Pro-config kunne ikke lagres.");
    } finally {
      setSaving(false);
    }
  }

  async function removePro(config: ProConfig) {
    if (!isProAdmin) return;
    try {
      await deleteProConfig(config.id);
      setSuccess(`${config.playerName} sin config ble slettet.`);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Pro-config kunne ikke slettes.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.25em] text-orange-400">Shared Setups</p>
          <h1 className="mt-2 text-5xl font-black">COMMUNITY HUB</h1>
          <p className="mt-2 text-slate-400">Pro-oppsett og offentlige CFG-filer fra communityet.</p>
        </div>
        {isProAdmin && (
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft);
              setShowEditor((current) => !current);
            }}
            className="rounded-xl bg-orange-500 px-5 py-3 font-black text-black"
          >
            {showEditor ? "Lukk editor" : "Legg til Pro Config"}
          </button>
        )}
      </header>

      {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-red-300">{error}</div>}
      {success && <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5 text-green-300">{success}</div>}

      {isProAdmin && showEditor && (
        <section className="rounded-2xl border border-orange-500/30 bg-[#0c1426] p-6">
          <p className="text-sm font-bold uppercase text-orange-400">Admin only</p>
          <h2 className="mt-2 text-3xl font-black">{draft.id ? "Rediger Pro Config" : "Ny Pro Config"}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <TextField label="Spillernavn" value={draft.playerName} onChange={(value) => setDraft((current) => ({ ...current, playerName: value }))} />
            <TextField label="Lag" value={draft.team} onChange={(value) => setDraft((current) => ({ ...current, team: value }))} />
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase text-slate-500">Rolle</span>
              <select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as PreferredRole }))} className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3">
                {roles.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <TextField label="Kildenavn" value={draft.sourceLabel} onChange={(value) => setDraft((current) => ({ ...current, sourceLabel: value }))} />
            <TextField label="Kildelenke" value={draft.sourceUrl} onChange={(value) => setDraft((current) => ({ ...current, sourceUrl: value }))} />
            <NumberField label="DPI" value={draft.dpi} step={50} onChange={(value) => setDraft((current) => ({ ...current, dpi: value }))} />
            <NumberField label="Sensitivity" value={draft.sensitivity} step={0.01} onChange={(value) => setDraft((current) => ({ ...current, sensitivity: value }))} />
            <TextField label="Crosshair-kode" value={draft.crosshairShareCode} onChange={(value) => setDraft((current) => ({ ...current, crosshairShareCode: value }))} />
          </div>
          <label className="mt-5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-orange-500/50 p-5 font-bold text-orange-400">
            {draft.fileName || "Velg pro CFG-fil"}
            <input type="file" accept=".cfg,text/plain" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readProCfg(file);
              event.target.value = "";
            }} />
          </label>
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={saving} onClick={saveDraft} className="rounded-xl bg-orange-500 px-5 py-3 font-black text-black disabled:opacity-40">{saving ? "Lagrer..." : "Lagre Pro Config"}</button>
            <button type="button" onClick={() => { setDraft(emptyDraft); setShowEditor(false); }} className="rounded-xl border border-[#263754] px-5 py-3 text-slate-300">Avbryt</button>
          </div>
        </section>
      )}

      <section className="grid gap-4 rounded-2xl border border-[#182538] bg-[#0c1426] p-5 md:grid-cols-2">
        <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-xl border border-[#263754] bg-[#08111f] p-3">
          <option value="all">Alle roller</option>
          {roles.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={minimumElo} onChange={(event) => setMinimumElo(Number(event.target.value))} className="rounded-xl border border-[#263754] bg-[#08111f] p-3">
          <option value="0">Alle Skill ELO</option>
          {[10000, 15000, 20000, 25000, 30000].map((elo) => <option key={elo} value={elo}>{elo.toLocaleString("nb-NO")}+</option>)}
        </select>
      </section>

      <ConfigSection title="PRO CONFIGS" description="Configer lagt inn og vedlikeholdt av administratoren.">
        {filteredPros.map((config) => (
          <ConfigCard
            key={config.id}
            title={config.playerName}
            subtitle={[config.team, config.role].filter(Boolean).join(" · ")}
            dpi={config.dpi}
            sensitivity={config.sensitivity}
            edpi={config.edpi}
            fileName={config.fileName}
            content={config.content}
            crosshair={config.crosshairShareCode}
            sourceLabel={config.sourceLabel}
            sourceUrl={config.sourceUrl}
            isAdmin={isProAdmin}
            onEdit={() => startEdit(config)}
            onDelete={() => void removePro(config)}
          />
        ))}
        {!filteredPros.length && <EmptyState text="Ingen pro-configs passer filteret." />}
      </ConfigSection>

      <ConfigSection title="COMMUNITY CONFIGS" description="Offentlige configer som brukerne selv har valgt å dele.">
        {filteredCommunity.map((config) => (
          <ConfigCard
            key={config.id}
            title={config.ownerName}
            subtitle={config.role}
            dpi={config.dpi}
            sensitivity={config.sensitivity}
            edpi={config.edpi}
            skillElo={config.skillElo}
            fileName={config.fileName}
            content={config.content}
            crosshair={config.crosshairShareCode}
          />
        ))}
        {!filteredCommunity.length && <EmptyState text="Ingen community-configs passer filteret." />}
      </ConfigSection>
    </div>
  );
}

function ConfigSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section><p className="text-sm font-bold uppercase tracking-wider text-orange-400">{title}</p><p className="mt-2 text-slate-400">{description}</p><div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
}

function ConfigCard({ title, subtitle, dpi, sensitivity, edpi, skillElo, fileName, content, crosshair, sourceLabel, sourceUrl, isAdmin, onEdit, onDelete }: { title: string; subtitle: string; dpi: number; sensitivity: number; edpi: number; skillElo?: number; fileName: string; content: string; crosshair: string; sourceLabel?: string; sourceUrl?: string; isAdmin?: boolean; onEdit?: () => void; onDelete?: () => void }) {
  return <article className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6"><div className="flex justify-between gap-4"><div><h2 className="text-2xl font-black">{title}</h2><p className="mt-1 text-orange-400">{subtitle}</p></div>{skillElo !== undefined && <p className="text-2xl font-black text-cyan-400">{skillElo.toLocaleString("nb-NO")}</p>}</div><div className="mt-5 grid grid-cols-3 gap-3"><Metric label="DPI" value={dpi} /><Metric label="Sens" value={sensitivity} /><Metric label="eDPI" value={edpi} /></div>{sourceLabel && <p className="mt-4 text-sm text-slate-500">Kilde: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{sourceLabel}</a> : sourceLabel}</p>}{crosshair && <button onClick={() => void navigator.clipboard.writeText(crosshair)} className="mt-4 w-full rounded-xl border border-purple-500/40 p-3 text-purple-300">Kopier crosshair-kode</button>}<button onClick={() => downloadCfg(fileName, content)} className="mt-3 w-full rounded-xl bg-orange-500 p-3 font-black text-black">Last ned {fileName || "CFG"}</button>{isAdmin && <div className="mt-3 grid grid-cols-2 gap-3"><button onClick={onEdit} className="rounded-xl border border-cyan-500/40 p-3 text-cyan-300">Rediger</button><button onClick={onDelete} className="rounded-xl border border-red-500/40 p-3 text-red-300">Slett</button></div>}</article>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-[#08111f] p-3 text-center"><p className="text-[10px] uppercase text-slate-600">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
function EmptyState({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[#263754] p-8 text-center text-slate-500">{text}</div>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="space-y-2"><span className="text-xs font-bold uppercase text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3" /></label>; }
function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) { return <label className="space-y-2"><span className="text-xs font-bold uppercase text-slate-500">{label}</span><input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-[#263754] bg-[#08111f] p-3" /></label>; }
