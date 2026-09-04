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

  const engine = createCaseEngine(caseData);
  let state = engine.createInitialState();
  let previous = "";
  for (let pass = 0; pass < 100; pass += 1) {
    for (const id of [...state.unlocked]) state = engine.openRecord(state, id).state;
    for (const concept of [...state.discovered]) state = engine.search(state, concept).state;
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
