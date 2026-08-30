import { aliases, facts, records, solution } from "../src/content/game-data.js";
import { createInitialState, openRecord, search } from "../src/engine/game-engine.js";

const errors = [];
const ids = records.map((record) => record.id);
if (new Set(ids).size !== ids.length) errors.push("Record IDs must be unique.");

const referencedRecords = records.flatMap((record) => record.unlock.flat()).filter((item) => item.startsWith("READ:")).map((item) => item.slice(5));
referencedRecords.forEach((id) => { if (!ids.includes(id)) errors.push(`Unknown record reference: ${id}`); });

const normalizedAliases = new Map();
const normalize = (value) => value.toLowerCase().replace(/[\s，。！？、,.!?：:；;_-]/g, "");
Object.entries(aliases).forEach(([canonical, values]) => [canonical, ...values].forEach((value) => {
  const key = normalize(value);
  if (normalizedAliases.has(key) && normalizedAliases.get(key) !== canonical) errors.push(`Alias collision: ${value}`);
  normalizedAliases.set(key, canonical);
}));

let state = createInitialState();
let previousSignature = "";
for (let pass = 0; pass < 100; pass += 1) {
  state.unlocked.forEach((id) => { state = openRecord(state, id).state; });
  state.discovered.forEach((concept) => { state = search(state, concept).state; });
  const signature = `${state.unlocked.length}/${state.read.length}/${state.discovered.length}`;
  if (signature === previousSignature) break;
  previousSignature = signature;
}

const reachable = records.filter((record) => record.id !== "END-01").every((record) => state.unlocked.includes(record.id));
if (!reachable) errors.push(`Unreachable records: ${records.filter((record) => record.id !== "END-01" && !state.unlocked.includes(record.id)).map((record) => record.id).join(", ")}`);
facts.forEach((fact) => { if (!state.confirmedFacts.includes(fact.id)) errors.push(`Unreachable fact: ${fact.id}`); });
solution.requiredFacts.forEach((id) => { if (!facts.some((fact) => fact.id === id)) errors.push(`Solution references unknown fact: ${id}`); });

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Content valid: ${records.length} records, ${facts.length} facts, all investigation content reachable.`);
}
