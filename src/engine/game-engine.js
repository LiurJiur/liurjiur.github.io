import { DATA_VERSION, aliases, facts, records } from "../content/game-data.js";

export const START_IDS = records.filter((item) => item.unlock.some((path) => path.includes("START"))).map((item) => item.id);

export function createInitialState() {
  return {
    version: DATA_VERSION,
    unlocked: [...START_IDS],
    read: [],
    discovered: [],
    searched: [],
    confirmedFacts: [],
    hints: {},
    hintCount: 0,
    history: [],
    solved: false,
    startedAt: Date.now(),
    settings: { fontScale: 1, reducedMotion: false },
    tutorial: { automatic: true, seen: [] },
  };
}

export function shouldShowTutorial(state, topic) {
  return state.tutorial.automatic && !state.tutorial.seen.includes(topic);
}

export function markTutorialSeen(state, topic) {
  if (state.tutorial.seen.includes(topic)) return state;
  const next = structuredClone(state);
  next.tutorial.seen.push(topic);
  return next;
}

export function resetTutorialProgress(state) {
  const next = structuredClone(state);
  next.tutorial.seen = [];
  return next;
}

export function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("zh-CN").replace(/[\s，。！？、,.!?：:；;“”‘’'"《》〈〉【】\[\]()（）_-]/g, "");
}

const conceptIndex = (() => {
  const map = new Map();
  const allConcepts = new Set(records.flatMap((item) => item.concepts));
  Object.entries(aliases).forEach(([canonical, items]) => {
    allConcepts.add(canonical);
    [canonical, ...items].forEach((alias) => map.set(normalize(alias), canonical));
  });
  allConcepts.forEach((concept) => {
    if (!map.has(normalize(concept))) map.set(normalize(concept), concept);
  });
  return map;
})();

export function resolveConcept(query) {
  const normalized = normalize(query);
  if (!normalized) return null;
  if (conceptIndex.has(normalized)) return conceptIndex.get(normalized);
  const partial = [...conceptIndex.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key));
  return partial?.[1] ?? null;
}

function requirementMet(requirement, state) {
  if (requirement === "START") return true;
  if (requirement === "SOLVED") return state.solved;
  const separator = requirement.indexOf(":");
  const kind = requirement.slice(0, separator);
  const value = requirement.slice(separator + 1);
  if (kind === "READ") return state.read.includes(value);
  if (kind === "SEARCH") return state.searched.includes(value);
  if (kind === "FACT") return state.confirmedFacts.includes(value);
  return false;
}

export function canUnlock(item, state) {
  return item.unlock.some((path) => path.every((requirement) => requirementMet(requirement, state)));
}

function deriveFacts(state) {
  return facts.filter((fact) => fact.requires.every((requirement) => {
    if (requirement.startsWith("FACT:")) return state.confirmedFacts.includes(requirement.slice(5));
    return state.read.includes(requirement);
  })).map((fact) => fact.id);
}

export function recompute(state) {
  const next = structuredClone(state);
  let changed = true;
  while (changed) {
    changed = false;
    const derived = deriveFacts(next);
    derived.forEach((id) => {
      if (!next.confirmedFacts.includes(id)) {
        next.confirmedFacts.push(id);
        changed = true;
      }
    });
    records.forEach((item) => {
      if (!next.unlocked.includes(item.id) && canUnlock(item, next)) {
        next.unlocked.push(item.id);
        changed = true;
      }
    });
  }
  return next;
}

export function openRecord(state, id) {
  if (!state.unlocked.includes(id)) return { state, opened: null, newIds: [] };
  const item = records.find((entry) => entry.id === id);
  if (!item) return { state, opened: null, newIds: [] };
  const next = structuredClone(state);
  if (!next.read.includes(id)) next.read.push(id);
  item.concepts.forEach((concept) => {
    if (!next.discovered.includes(concept)) next.discovered.push(concept);
  });
  const previous = new Set(next.unlocked);
  const computed = recompute(next);
  return { state: computed, opened: item, newIds: computed.unlocked.filter((entry) => !previous.has(entry)) };
}

export function collectConcept(state, query) {
  const concept = resolveConcept(query);
  if (!concept || state.discovered.includes(concept)) return { state, concept, collected: false };
  const next = structuredClone(state);
  next.discovered.push(concept);
  return { state: next, concept, collected: true };
}

export function search(state, query) {
  const concept = resolveConcept(query);
  if (!concept) return { state, concept: null, results: [], newIds: [], suggestions: suggest(query, state) };
  const next = structuredClone(state);
  if (!next.searched.includes(concept)) next.searched.push(concept);
  if (!next.discovered.includes(concept)) next.discovered.push(concept);
  const previous = new Set(next.unlocked);
  const computed = recompute(next);
  const results = records.filter((item) => computed.unlocked.includes(item.id) && item.concepts.some((entry) => entry === concept || normalize(entry).includes(normalize(concept))));
  return { state: computed, concept, results, newIds: computed.unlocked.filter((entry) => !previous.has(entry)), suggestions: [] };
}

export function suggest(query, state, limit = 4) {
  const target = normalize(query);
  const choices = [...new Set([...state.discovered, ...Object.keys(aliases)])];
  const distance = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
  };
  return choices.sort((a, b) => distance(target, normalize(a)) - distance(target, normalize(b))).slice(0, limit);
}

export function loadState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem("cat-help-save"));
    if (!parsed || parsed.version !== DATA_VERSION) return createInitialState();
    const initial = createInitialState();
    const parsedTutorial = parsed.tutorial && typeof parsed.tutorial === "object" ? parsed.tutorial : {};
    return recompute({
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...parsed.settings },
      tutorial: {
        automatic: typeof parsedTutorial.automatic === "boolean" ? parsedTutorial.automatic : initial.tutorial.automatic,
        seen: Array.isArray(parsedTutorial.seen) ? parsedTutorial.seen.filter((topic) => typeof topic === "string") : [],
      },
    });
  } catch {
    return createInitialState();
  }
}

export function saveState(storage, state) {
  storage.setItem("cat-help-save", JSON.stringify(state));
}

export function validateSolution(answer, solution) {
  const errors = [];
  if (answer.lastPlayer !== solution.lastPlayer) errors.push("最后玩球的猫与 20:07 的目击记录不符。");
  if (answer.firstTaker !== solution.firstTaker) errors.push("第一个主动拿球的角色无法解释 20:17 后的路线。");
  const selectedLiars = [...(answer.liars ?? [])].sort().join("|");
  if (selectedLiars !== [...solution.liars].sort().join("|")) errors.push("证词冲突者没有同时满足“秘密”和“客观记录反驳”。");
  if (answer.carrier !== solution.carrier) errors.push("带走球的对象无法解释 20:33 的第二次铃声。");
  if (answer.location !== solution.location) errors.push("最终位置与返航记录或收纳结构不符。");
  if ((answer.order ?? []).join("|") !== solution.order.join("|")) errors.push("事件顺序仍有矛盾，请重新比较时间戳。");
  return { correct: errors.length === 0, errors };
}
