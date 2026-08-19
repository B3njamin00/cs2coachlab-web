export type ParsedCfg = {
  sensitivity?: number;
  zoomSensitivity?: number;
  crosshair: Record<string, string>;
  viewmodel: Record<string, string>;
  binds: Record<string, string>;
};

function commands(content: string) {
  const values = new Map<string, string>();
  const binds: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const bind = line.match(/^bind\s+"?([^"\s]+)"?\s+"([^"]+)"/i);
    if (bind) { binds[bind[1]] = bind[2]; continue; }
    const match = line.match(/^([a-zA-Z0-9_]+)\s+"?([^";]+)"?/);
    if (match) values.set(match[1].toLowerCase(), match[2].trim());
  }
  return { values, binds };
}

export function parseCfg(content: string): ParsedCfg {
  const { values, binds } = commands(content);
  const pick = (prefix: string) => Object.fromEntries([...values.entries()].filter(([key]) => key.startsWith(prefix)));
  const numeric = (key: string) => {
    const value = values.get(key);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    sensitivity: numeric("sensitivity"),
    zoomSensitivity: numeric("zoom_sensitivity_ratio"),
    crosshair: pick("cl_crosshair"),
    viewmodel: pick("viewmodel_"),
    binds,
  };
}
