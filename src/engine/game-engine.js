export function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("zh-CN").replace(/[\s，。！？、,.!?：:；;“”‘’'"《》〈〉【】\[\]()（）_-]/g, "");
}

function buildConceptIndex(caseData) {
  const index = new Map();
  const concepts = new Set(caseData.records.flatMap((item) => item.concepts));
  Object.entries(caseData.aliases).forEach(([canonical, aliases]) => {
    concepts.add(canonical);
    [canonical, ...aliases].forEach((alias) => index.set(normalize(alias), canonical));
  });
  concepts.forEach((concept) => { if (!index.has(normalize(concept))) index.set(normalize(concept), concept); });
  return index;
}

export function createCaseEngine(caseData) {
  const conceptIndex = buildConceptIndex(caseData);
  const startIds = caseData.records.filter((item) => item.unlock.some((path) => path.includes("START"))).map((item) => item.id);

  const resolveConcept = (query) => {
    const normalized = normalize(query);
    if (!normalized) return null;
    if (conceptIndex.has(normalized)) return conceptIndex.get(normalized);
    return [...conceptIndex.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key))?.[1] ?? null;
  };
  const requirementMet = (requirement, state) => {
    if (requirement === "START") return true;
    if (requirement === "SOLVED") return state.solved;
    const separator = requirement.indexOf(":");
    const kind = requirement.slice(0, separator);
    const value = requirement.slice(separator + 1);
    if (kind === "READ") return state.read.includes(value);
    if (kind === "SEARCH") return state.collected.includes(value);
    if (kind === "FACT") return state.confirmedFacts.includes(value);
    return false;
  };
  const canUnlock = (item, state) => item.unlock.some((path) => path.every((requirement) => requirementMet(requirement, state)));
  const recompute = (state) => {
    const next = structuredClone(state);
    let changed = true;
    while (changed) {
      changed = false;
      caseData.facts.forEach((fact) => {
        const met = fact.requires.every((requirement) => requirement.startsWith("FACT:")
          ? next.confirmedFacts.includes(requirement.slice(5)) : next.read.includes(requirement));
        if (met && !next.confirmedFacts.includes(fact.id)) { next.confirmedFacts.push(fact.id); changed = true; }
      });
      caseData.records.forEach((item) => {
        if (!next.unlocked.includes(item.id) && canUnlock(item, next)) { next.unlocked.push(item.id); changed = true; }
      });
    }
    return next;
  };
  const createInitialState = () => ({
    contentVersion: caseData.contentVersion,
    unlocked: [...startIds], read: [], discovered: [], collected: [], searched: [], confirmedFacts: [],
    hints: {}, hintCount: 0, history: [], solved: false, startedAt: Date.now(), solvedAt: null,
  });
  const openRecord = (state, id) => {
    if (!state.unlocked.includes(id)) return { state, opened: null, newIds: [] };
    const item = caseData.records.find((entry) => entry.id === id);
    if (!item) return { state, opened: null, newIds: [] };
    const next = structuredClone(state);
    if (!next.read.includes(id)) next.read.push(id);
    item.concepts.forEach((concept) => { if (!next.discovered.includes(concept)) next.discovered.push(concept); });
    const previous = new Set(next.unlocked);
    const computed = recompute(next);
    return { state: computed, opened: item, newIds: computed.unlocked.filter((entry) => !previous.has(entry)) };
  };
  const collectConcept = (state, query) => {
    const concept = resolveConcept(query);
    if (!concept || state.collected.includes(concept)) return { state, concept, collected: false, newIds: [] };
    const next = structuredClone(state);
    if (!next.discovered.includes(concept)) next.discovered.push(concept);
    next.collected.push(concept);
    const previous = new Set(next.unlocked);
    const computed = recompute(next);
    return { state: computed, concept, collected: true, newIds: computed.unlocked.filter((entry) => !previous.has(entry)) };
  };
  const suggest = (query, state, limit = 4) => {
    const target = normalize(query);
    const distance = (a, b) => {
      const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
      for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return dp[a.length][b.length];
    };
    return [...new Set([...state.discovered, ...Object.keys(caseData.aliases)])]
      .sort((a, b) => distance(target, normalize(a)) - distance(target, normalize(b))).slice(0, limit);
  };
  const search = (state, query) => {
    const concept = resolveConcept(query);
    if (!concept) return { state, concept: null, results: [], newIds: [], suggestions: suggest(query, state) };
    const next = structuredClone(state);
    if (!next.searched.includes(concept)) next.searched.push(concept);
    if (!next.discovered.includes(concept)) next.discovered.push(concept);
    if (!next.collected.includes(concept)) next.collected.push(concept);
    const previous = new Set(next.unlocked);
    const computed = recompute(next);
    const results = caseData.records.filter((item) => computed.unlocked.includes(item.id)
      && item.concepts.some((entry) => entry === concept || normalize(entry).includes(normalize(concept))));
    return { state: computed, concept, results, newIds: computed.unlocked.filter((entry) => !previous.has(entry)), suggestions: [] };
  };
  return { caseData, startIds, createInitialState, resolveConcept, canUnlock, recompute, openRecord, collectConcept, search, suggest };
}
