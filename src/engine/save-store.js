export const SAVE_KEY = "cat-help-save-v2";
export const LEGACY_SAVE_KEY = "cat-help-save";
export const SCHEMA_VERSION = 2;

export const createPreferences = () => ({ settings: { fontScale: 1, reducedMotion: false }, tutorial: { automatic: true, seen: [] } });

function sanitizePreferences(source = {}) {
  const defaults = createPreferences();
  const tutorial = source.tutorial && typeof source.tutorial === "object" ? source.tutorial : {};
  return {
    settings: { ...defaults.settings, ...(source.settings && typeof source.settings === "object" ? source.settings : {}) },
    tutorial: {
      automatic: typeof tutorial.automatic === "boolean" ? tutorial.automatic : defaults.tutorial.automatic,
      seen: Array.isArray(tutorial.seen) ? tutorial.seen.filter((item) => typeof item === "string") : [],
    },
  };
}

function sanitizeCaseState(value, engine) {
  const initial = engine.createInitialState();
  if (!value || value.contentVersion !== engine.caseData.contentVersion) return initial;
  const next = Object.fromEntries(Object.keys(initial).map((key) => [key, value[key] ?? initial[key]]));
  for (const key of ["unlocked", "read", "discovered", "collected", "searched", "confirmedFacts", "history"]) {
    next[key] = Array.isArray(value[key]) ? value[key].filter((item) => typeof item === "string") : initial[key];
  }
  return engine.recompute(next);
}

export function createSave(engines) {
  return { schemaVersion: SCHEMA_VERSION, activeCaseId: "case-001", preferences: createPreferences(), cases: Object.fromEntries([...engines].map(([id, engine]) => [id, engine.createInitialState()])) };
}

export function loadSave(storage, engines) {
  const fresh = createSave(engines);
  try {
    const parsed = JSON.parse(storage.getItem(SAVE_KEY));
    if (parsed?.schemaVersion === SCHEMA_VERSION) {
      const cases = Object.fromEntries([...engines].map(([id, engine]) => [id, sanitizeCaseState(parsed.cases?.[id], engine)]));
      return { ...fresh, ...parsed, activeCaseId: engines.has(parsed.activeCaseId) ? parsed.activeCaseId : fresh.activeCaseId, preferences: sanitizePreferences(parsed.preferences), cases };
    }
    const legacy = JSON.parse(storage.getItem(LEGACY_SAVE_KEY));
    if (!legacy) return fresh;
    const firstEngine = engines.get("case-001");
    const migrated = {
      ...fresh,
      preferences: sanitizePreferences({ settings: legacy.settings, tutorial: legacy.tutorial }),
      cases: { ...fresh.cases, "case-001": sanitizeCaseState({ ...legacy, contentVersion: firstEngine.caseData.contentVersion, collected: Array.isArray(legacy.collected) ? legacy.collected : legacy.searched }, firstEngine) },
    };
    storage.setItem(SAVE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch { return fresh; }
}

export const saveGame = (storage, save) => storage.setItem(SAVE_KEY, JSON.stringify(save));
export function resetCase(save, caseId, engine) {
  const next = structuredClone(save);
  next.cases[caseId] = engine.createInitialState();
  return next;
}
