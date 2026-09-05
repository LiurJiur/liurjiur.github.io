import { caseCatalog } from "../src/content/case-catalog.js";
import { createCaseEngine, normalize } from "../src/engine/game-engine.js";

const errors = [];
for (const caseData of caseCatalog) {
  const prefix = `[${caseData.id}]`;
  const recordIds = caseData.records.map((item) => item.id);
  const factIds = caseData.facts.map((item) => item.id);
  const eventIds = caseData.eventCards.map((item) => item.id);
  const questionIds = caseData.solution.questions.map((item) => item.id);
  for (const [label, ids] of [["record", recordIds], ["fact", factIds], ["event", eventIds], ["question", questionIds]]) if (new Set(ids).size !== ids.length) errors.push(`${prefix} Duplicate ${label} IDs.`);
  for (const requirement of caseData.records.flatMap((item) => item.unlock.flat())) {
    if (requirement.startsWith("READ:") && !recordIds.includes(requirement.slice(5))) errors.push(`${prefix} Unknown record reference: ${requirement}`);
    if (requirement.startsWith("FACT:") && !factIds.includes(requirement.slice(5))) errors.push(`${prefix} Unknown fact reference: ${requirement}`);
  }
  for (const fact of caseData.facts) for (const requirement of fact.requires) {
    const id = requirement.startsWith("FACT:") ? requirement.slice(5) : requirement;
    if (requirement.startsWith("FACT:") ? !factIds.includes(id) : !recordIds.includes(id)) errors.push(`${prefix} Unknown fact requirement: ${requirement}`);
  }
  const aliasOwners = new Map();
  for (const [canonical, values] of Object.entries(caseData.aliases)) for (const value of [canonical, ...values]) {
    const key = normalize(value);
    if (aliasOwners.has(key) && aliasOwners.get(key) !== canonical) errors.push(`${prefix} Alias collision: ${value}`);
    aliasOwners.set(key, canonical);
  }
  for (const question of caseData.solution.questions) {
    const answer = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (answer.some((item) => !question.options.includes(item))) errors.push(`${prefix} Question ${question.id} answer is not an option.`);
    if (question.type === "order" && question.options.some((id) => !eventIds.includes(id))) errors.push(`${prefix} Question ${question.id} references an unknown event.`);
  }
  for (const id of caseData.solution.requiredFacts) if (!factIds.includes(id)) errors.push(`${prefix} Solution references unknown fact: ${id}`);
  for (const item of caseData.records.filter((record) => record.puzzle)) {
    if (!item.puzzle.answer) errors.push(`${prefix} Puzzle ${item.id} has no answer.`);
    for (const id of item.puzzle.unlocks ?? []) if (!recordIds.includes(id)) errors.push(`${prefix} Puzzle ${item.id} unlocks an unknown record: ${id}`);
    const type = item.puzzle.type ?? "symbol-code";
    if (!["symbol-code", "order", "code", "choice"].includes(type)) errors.push(`${prefix} Puzzle ${item.id} has an unknown type: ${type}`);
    if (caseData.id === "case-003" && item.puzzle.hints?.length !== 3) errors.push(`${prefix} Puzzle ${item.id} must have three hints.`);
    if (type === "order") {
      const itemIds = item.puzzle.items?.map((entry) => entry.id) ?? [];
      if (new Set(itemIds).size !== itemIds.length || [...itemIds].sort().join("") !== [...String(item.puzzle.answer ?? "")].sort().join("")) errors.push(`${prefix} Puzzle ${item.id} answer must cover every order item once.`);
      if ([...(item.puzzle.initial ?? [])].sort().join("") !== [...itemIds].sort().join("")) errors.push(`${prefix} Puzzle ${item.id} initial order must cover every item once.`);
      if (item.puzzle.items?.some((entry) => !entry.text)) errors.push(`${prefix} Puzzle ${item.id} order item lacks a text equivalent.`);
    }
    if (type === "code") {
      if (!/^\d{4}$/.test(item.puzzle.answer)) errors.push(`${prefix} Puzzle ${item.id} code must contain four digits.`);
      if (caseData.id === "case-003" && item.puzzle.directions?.some((direction) => typeof direction !== "string")) errors.push(`${prefix} Puzzle ${item.id} direction lacks a text equivalent.`);
    }
    if (type === "choice") {
      if (!item.puzzle.options?.some((option) => option.value === item.puzzle.answer)) errors.push(`${prefix} Puzzle ${item.id} answer is not a route option.`);
      if (item.puzzle.options?.some((option) => !option.text || !option.detail)) errors.push(`${prefix} Puzzle ${item.id} route option lacks a text equivalent.`);
    }
  }

  const engine = createCaseEngine(caseData);
  let state = engine.createInitialState();
  let previous = "";
  for (let pass = 0; pass < 100; pass += 1) {
    for (const id of [...state.unlocked]) state = engine.openRecord(state, id).state;
    for (const concept of [...state.discovered]) state = engine.search(state, concept).state;
    for (const item of caseData.records.filter((record) => record.puzzle && state.read.includes(record.id))) state = engine.search(state, item.puzzle.answer).state;
    const signature = `${state.unlocked.length}/${state.read.length}/${state.discovered.length}/${state.confirmedFacts.length}`;
    if (signature === previous) break;
    previous = signature;
  }
  const unreachable = caseData.records.filter((item) => item.id !== "END-01" && !state.unlocked.includes(item.id));
  if (unreachable.length) errors.push(`${prefix} Unreachable records: ${unreachable.map((item) => item.id).join(", ")}`);
  for (const id of caseData.solution.requiredFacts) if (!state.confirmedFacts.includes(id)) errors.push(`${prefix} Unreachable required fact: ${id}`);
}

if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`Content valid: ${caseCatalog.length} cases; all IDs, references, answers and investigation paths verified.`);
