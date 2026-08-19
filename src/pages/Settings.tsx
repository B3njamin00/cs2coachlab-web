import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToMatches,
  type FirestoreMatch,
} from "../services/matchService";
import { analyzeSuggestedRole } from "../services/roleAdvisor";
import { parseCfg } from "../services/cfgParser";
import { publishCommunityConfig, removeCommunityConfig } from "../services/communityService";
import {
  analyzeProgress,
  defaultProgressProfile,
  saveProgressProfile,
  subscribeToProgressProfile,
  type ProgressProfile,
} from "../services/progressService";
import {
  defaultUserSettings,
  saveUserSettings,
  subscribeToUserSettings,
  type PreferredRole,
  type UserSettings,
} from "../services/settingsService";

const roles: PreferredRole[] = [
  "Entry",
  "AWPer",
  "Support",
  "Lurker",
  "IGL",
  "Flex",
];

const trainingOptions: Array<15 | 30 | 60 | 90> = [15, 30, 60, 90];
const maxConfigCharacters = 100000;

function shortUid(uid: string) {
  if (uid.length <= 16) return uid;
  return `${uid.slice(0, 8)}...${uid.slice(-6)}`;
}

export default function Settings() {
  const { user, loading, logout } = useAuth();
  const [progress, setProgress] = useState<ProgressProfile>(defaultProgressProfile);
  const [draftProgress, setDraftProgress] = useState<ProgressProfile>(defaultProgressProfile);
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [draftSettings, setDraftSettings] = useState<UserSettings>(defaultUserSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);

  useEffect(() => {
    if (!user) {
      setProgress(defaultProgressProfile);
      setDraftProgress(defaultProgressProfile);
      setSettings(defaultUserSettings);
      setDraftSettings(defaultUserSettings);
      return;
    }

    const unsubscribeProgress = subscribeToProgressProfile(
      user.uid,
      (nextProgress) => {
        setProgress(nextProgress);
        setDraftProgress(nextProgress);
      },
      (error) => setErrorMessage(error.message)
    );

    const unsubscribeSettings = subscribeToUserSettings(
      user.uid,
      (nextSettings) => {
        setSettings(nextSettings);
        setDraftSettings(nextSettings);
      },
      (error) => setErrorMessage(error.message)
    );

    const unsubscribeMatches = subscribeToMatches(
      user.uid,
      setMatches,
      (error) => setErrorMessage(error.message)
    );
    return () => {
      unsubscribeProgress();
      unsubscribeSettings();
      unsubscribeMatches();
    };
  }, [user]);

  const edpi = useMemo(
    () => Math.round(Number(draftSettings.dpi || 0) * Number(draftSettings.sensitivity || 0)),
    [draftSettings.dpi, draftSettings.sensitivity]
  );

  const hasChanges = useMemo(
    () =>
      JSON.stringify(progress) !== JSON.stringify(draftProgress) ||
      JSON.stringify(settings) !== JSON.stringify(draftSettings),
    [progress, draftProgress, settings, draftSettings]
  );

  const roleRecommendation = useMemo(
    () => analyzeSuggestedRole(matches),
    [matches]
  );
  const progressAnalysis = useMemo(
    () => analyzeProgress(matches, draftProgress),
    [matches, draftProgress]
  );

  async function readConfigFile(file: File, type: "config" | "autoexec") {
    setErrorMessage("");
    const content = await file.text();

    if (content.length > maxConfigCharacters) {
      setErrorMessage(
        `Filen er for stor for Settings V1. Maks ${maxConfigCharacters.toLocaleString("nb-NO")} tegn.`
      );
      return;
    }

    const parsed = parseCfg(content);
    setDraftSettings((current) => ({
      ...current,
      ...(type === "config"
        ? { configFileName: file.name, configContent: content }
        : { autoexecFileName: file.name, autoexecContent: content }),
      sensitivity: parsed.sensitivity ?? current.sensitivity,
      zoomSensitivity: parsed.zoomSensitivity ?? current.zoomSensitivity,
    }));
  }

  async function saveAll() {
    if (!user) return;

    setIsSaving(true);
    setSavedMessage("");
    setErrorMessage("");

    try {
      await Promise.all([
        saveProgressProfile(user.uid, draftProgress),
        saveUserSettings(user.uid, draftSettings),
      ]);
      const sharedContent = draftSettings.autoexecContent || draftSettings.configContent;
      const sharedFileName = draftSettings.autoexecFileName || draftSettings.configFileName;
      if (draftSettings.publicConfig && sharedContent) {
        await publishCommunityConfig({
          ownerUid: user.uid,
          ownerName: user.displayName || user.email || "CS2 Player",
          role: draftSettings.preferredRole,
          skillElo: progressAnalysis.estimatedElo || 0,
          dpi: draftSettings.dpi,
          sensitivity: draftSettings.sensitivity,
          edpi: Math.round(draftSettings.dpi * draftSettings.sensitivity),
          zoomSensitivity: draftSettings.zoomSensitivity,
          crosshairShareCode: draftSettings.crosshairShareCode,
          fileName: sharedFileName,
          content: sharedContent,
        });
      } else {
        await removeCommunityConfig(user.uid).catch(() => undefined);
      }
      setSavedMessage("Innstillingene og community-valget ble lagret.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Kunne ikke lagre innstillingene."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function resetDrafts() {
    setDraftProgress(progress);
    setDraftSettings(settings);
    setSavedMessage("");
    setErrorMessage("");
  }

  if (loading) {
    return <div className="text-slate-400">Laster Settings...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8">
        <h1 className="text-4xl font-black">Logg inn for å åpne Settings</h1>
        <p className="mt-3 text-slate-300">
          Innstillingene lagres separat for hver Firebase-bruker.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
            Personalization
          </p>
          <h1 className="mt-2 text-5xl font-black tracking-tight">SETTINGS</h1>
          <p className="mt-2 text-slate-400">
            Konto, ELO-mål, spillerprofil og CS2-oppsett.
          </p>
        </div>

        <div className="flex gap-3">
          {hasChanges && (
            <button
              type="button"
              onClick={resetDrafts}
              className="rounded-xl border border-[#263754] px-5 py-3 text-slate-300"
            >
              Tilbakestill
            </button>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={isSaving || !hasChanges}
            className="rounded-xl bg-orange-500 px-6 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? "Lagrer..." : "Lagre Settings"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/50 bg-red-950/50 p-5 text-red-200">
          {errorMessage}
        </div>
      )}

      {savedMessage && (
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5 text-green-300">
          {savedMessage}
        </div>
      )}

      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <SectionHeading eyebrow="Firebase Account" title="Account" />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#08111f] p-5">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Google profile"
                className="h-16 w-16 rounded-full border border-orange-500/40 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-2xl font-black text-black">
                {(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-2xl font-black">{user.displayName || "Google-bruker"}</h3>
              <p className="mt-1 text-slate-400">{user.email}</p>
              <p className="mt-1 text-xs text-slate-600">UID: {shortUid(user.uid)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-red-500/50 px-5 py-3 font-bold text-red-400 hover:bg-red-500/10"
          >
            Logg ut
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-[#0c1426] p-6">
          <SectionHeading eyebrow="Road to Target" title="ELO Settings" />
          <p className="mt-3 text-slate-400">
            De samme verdiene brukes direkte på Progress-siden.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Nåværende ELO"
              value={draftProgress.currentElo}
              step={100}
              onChange={(value) =>
                setDraftProgress((current) => ({ ...current, currentElo: value }))
              }
            />
            <NumberField
              label="Ønsket ELO"
              value={draftProgress.targetElo}
              step={100}
              onChange={(value) =>
                setDraftProgress((current) => ({ ...current, targetElo: value }))
              }
            />
          </div>
          <div className="mt-5 rounded-xl bg-[#08111f] p-4">
            <p className="text-xs font-bold uppercase text-slate-600">ELO Gap</p>
            <p className="mt-2 text-3xl font-black text-orange-400">
              {Math.max(0, draftProgress.targetElo - draftProgress.currentElo).toLocaleString("nb-NO")}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <SectionHeading eyebrow="AI Profile" title="CS2 Role" />
          <p className="mt-3 text-slate-400">
            Rollen lagres nå og kan brukes av en senere Coach V2 til mer målrettede råd.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() =>
                  setDraftSettings((current) => ({ ...current, preferredRole: role }))
                }
                className={
                  draftSettings.preferredRole === role
                    ? "rounded-xl border border-orange-500 bg-orange-500 px-4 py-3 font-black text-black"
                    : "rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 font-bold text-slate-300 hover:border-orange-500/50"
                }
              >
                {role}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">AI Suggested Role</p>
                <h3 className="mt-2 text-3xl font-black text-cyan-400">{roleRecommendation.suggestedRole}</h3>
                <p className="mt-2 text-sm text-slate-400">Basert på {roleRecommendation.analyzedMatches} demoer</p>
              </div>
              <div className="rounded-xl bg-[#08111f] px-5 py-3 text-center">
                <p className="text-xs uppercase text-slate-500">Confidence</p>
                <p className="mt-1 text-3xl font-black text-cyan-400">{roleRecommendation.confidence}%</p>
              </div>
            </div>

            {!roleRecommendation.enoughData ? (
              <div className="mt-5 rounded-xl border border-yellow-500/25 bg-yellow-500/5 p-4 text-yellow-200">
                Minst {roleRecommendation.minimumMatches} analyserte matcher kreves før AI-en foreslår en spesialisert rolle.
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-2">
                  {roleRecommendation.reasons.map((reason) => (
                    <div key={reason} className="rounded-lg bg-[#08111f] px-4 py-3 text-sm text-slate-300">{reason}</div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {roleRecommendation.scores.map((score) => (
                    <div key={score.role} className="rounded-xl bg-[#08111f] p-3 text-center">
                      <p className="text-xs text-slate-500">{score.role}</p>
                      <p className="mt-1 text-xl font-black">{score.score}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              disabled={!roleRecommendation.enoughData}
              onClick={() => setDraftSettings((current) => ({ ...current, preferredRole: roleRecommendation.suggestedRole }))}
              className="mt-5 w-full rounded-xl border border-cyan-500 px-5 py-3 font-black text-cyan-400 transition hover:bg-cyan-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Bruk foreslått rolle
            </button>

            <details className="mt-4 text-sm text-slate-500">
              <summary className="cursor-pointer">Begrensninger i rolleforslaget</summary>
              <div className="mt-3 space-y-2">
                {roleRecommendation.limitations.map((limitation) => (
                  <p key={limitation}>{limitation}</p>
                ))}
              </div>
            </details>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <SectionHeading eyebrow="Training Plan" title="Daily Training Time" />
          <p className="mt-3 text-slate-400">
            Angir hvor lang treningsøkt AI-planene bør sikte mot senere.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {trainingOptions.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() =>
                  setDraftSettings((current) => ({
                    ...current,
                    trainingMinutes: minutes,
                  }))
                }
                className={
                  draftSettings.trainingMinutes === minutes
                    ? "rounded-xl border border-cyan-500 bg-cyan-500 px-4 py-4 font-black text-black"
                    : "rounded-xl border border-[#263754] bg-[#08111f] px-4 py-4 font-bold text-slate-300 hover:border-cyan-500/50"
                }
              >
                {minutes} min
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
          <SectionHeading eyebrow="Mouse" title="Sensitivity" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="DPI"
              value={draftSettings.dpi}
              step={50}
              onChange={(value) =>
                setDraftSettings((current) => ({ ...current, dpi: value }))
              }
            />
            <NumberField
              label="CS2 Sensitivity"
              value={draftSettings.sensitivity}
              step={0.01}
              onChange={(value) =>
                setDraftSettings((current) => ({
                  ...current,
                  sensitivity: value,
                }))
              }
            />
          </div>
          <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            <p className="text-xs font-bold uppercase text-cyan-400">Calculated eDPI</p>
            <p className="mt-2 text-4xl font-black text-cyan-400">{edpi}</p>
            <p className="mt-2 text-sm text-slate-500">DPI × CS2 sensitivity</p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <SectionHeading eyebrow="Crosshair" title="Share Code" />
        <p className="mt-3 text-slate-400">
          Settings V1 lagrer koden. Analyse og sammenligning kommer eventuelt i en senere versjon.
        </p>
        <input
          value={draftSettings.crosshairShareCode}
          onChange={(event) =>
            setDraftSettings((current) => ({
              ...current,
              crosshairShareCode: event.target.value,
            }))
          }
          placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"
          className="mt-5 w-full rounded-xl border border-[#263754] bg-[#08111f] px-4 py-4 font-mono text-slate-200 outline-none placeholder:text-slate-700 focus:border-orange-500"
        />
      </section>

      <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-6">
        <SectionHeading eyebrow="Community Hub" title="Del CFG offentlig" />
        <p className="mt-3 text-slate-400">Når dette er aktivert og Settings lagres, kan innloggede besøkende laste ned valgt autoexec.cfg eller config.cfg fra Community Hub.</p>
        <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl bg-[#08111f] p-5">
          <div><p className="font-black">Public Config</p><p className="mt-1 text-sm text-slate-500">Skill ELO, rolle, DPI, sens og CFG-innhold blir offentlig.</p></div>
          <input type="checkbox" checked={draftSettings.publicConfig} onChange={(event) => setDraftSettings((current) => ({ ...current, publicConfig: event.target.checked }))} className="h-6 w-6 accent-orange-500" />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#08111f] p-4"><p className="text-xs uppercase text-slate-600">Skill ELO</p><p className="mt-1 text-2xl font-black text-cyan-400">{progressAnalysis.estimatedElo?.toLocaleString("nb-NO") || "-"}</p></div>
          <div className="rounded-xl bg-[#08111f] p-4"><p className="text-xs uppercase text-slate-600">Shared File</p><p className="mt-1 font-black">{draftSettings.autoexecFileName || draftSettings.configFileName || "Ingen"}</p></div>
          <div className="rounded-xl bg-[#08111f] p-4"><p className="text-xs uppercase text-slate-600">Visibility</p><p className="mt-1 font-black">{draftSettings.publicConfig ? "Public" : "Private"}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#182538] bg-[#0c1426] p-6">
        <SectionHeading eyebrow="Configuration" title="CFG Files" />
        <p className="mt-3 max-w-3xl text-slate-400">
          Filen leses i nettleseren og tekstinnholdet lagres i Firestore-profilen. Settings V2 parser sensitivity og zoom sensitivity automatisk, men kjører ikke kommandoene.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <ConfigUploader
            title="config.cfg"
            fileName={draftSettings.configFileName}
            content={draftSettings.configContent}
            onFile={(file) => readConfigFile(file, "config")}
            onRemove={() =>
              setDraftSettings((current) => ({
                ...current,
                configFileName: "",
                configContent: "",
              }))
            }
          />
          <ConfigUploader
            title="autoexec.cfg"
            fileName={draftSettings.autoexecFileName}
            content={draftSettings.autoexecContent}
            onFile={(file) => readConfigFile(file, "autoexec")}
            onRemove={() =>
              setDraftSettings((current) => ({
                ...current,
                autoexecFileName: "",
                autoexecContent: "",
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
        <p className="text-sm font-bold uppercase tracking-wider text-yellow-400">
          Settings V1 Scope
        </p>
        <p className="mt-3 max-w-4xl leading-7 text-slate-300">
          Rolle, treningstid, crosshair, DPI, sensitivity og CFG lagres som profilinformasjon. Bare ELO-verdiene påvirker Progress-logikken i denne versjonen. Resten er klargjort for Coach V2.
        </p>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-black">{title}</h2>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-[#263754] bg-[#08111f] px-4 py-3 text-white outline-none focus:border-orange-500"
      />
    </label>
  );
}

function ConfigUploader({
  title,
  fileName,
  content,
  onFile,
  onRemove,
}: {
  title: string;
  fileName: string;
  content: string;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#263754] bg-[#08111f] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-black">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {fileName || "Ingen fil valgt"}
          </p>
        </div>
        {fileName && (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm font-bold text-red-400"
          >
            Fjern
          </button>
        )}
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-orange-500/50 px-4 py-5 text-center font-bold text-orange-400 hover:bg-orange-500/5">
        Velg CFG-fil
        <input
          type="file"
          accept=".cfg,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </label>

      {content && (
        <div className="mt-4 rounded-xl bg-[#0c1426] p-4">
          <p className="text-xs font-bold uppercase text-slate-600">Preview</p>
          <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">
            {content.slice(0, 1500)}
            {content.length > 1500 ? "\n..." : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
