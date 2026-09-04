import assert from "node:assert/strict";
import test from "node:test";
import { caseCatalog, isCaseUnlocked } from "../src/content/case-catalog.js";
import { createCaseEngine, normalize } from "../src/engine/game-engine.js";
import { createSave, LEGACY_SAVE_KEY, loadSave, resetCase, SAVE_KEY } from "../src/engine/save-store.js";
import { validateSolution } from "../src/engine/solution-engine.js";

const engines = new Map(caseCatalog.map((item) => [item.id, createCaseEngine(item)]));
const [case001, case002] = caseCatalog;

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

function completeReachability(engine) {
  let state = engine.createInitialState();
  let signature = "";
  for (let pass = 0; pass < 100; pass += 1) {
    for (const id of [...state.unlocked]) state = engine.openRecord(state, id).state;
    for (const concept of [...state.discovered]) state = engine.search(state, concept).state;
    const next = `${state.unlocked.length}/${state.read.length}/${state.discovered.length}/${state.confirmedFacts.length}`;
    if (next === signature) break;
    signature = next;
  }
  return state;
}

test("every case exposes its five documented starting records", () => {
  for (const engine of engines.values()) assert.deepEqual([...engine.startIds].sort(), ["CHAT-01", "FILE-01", "MAP-01", "REQ-01", "SYS-00"]);
});

test("aliases and punctuation resolve inside the active case only", () => {
  assert.equal(engines.get("case-001").resolveConcept("  扫地机！"), "小扫");
  assert.equal(engines.get("case-002").resolveConcept("六六"), "66");
  assert.equal(engines.get("case-001").resolveConcept("六六"), null);
  assert.equal(normalize("蓝色 纸箱。"), "蓝色纸箱");
});

test("collecting a concept unlocks records without counting as a search", () => {
  const engine = engines.get("case-002");
  const opened = engine.openRecord(engine.createInitialState(), "CHAT-01").state;
  const collected = engine.collectConcept(opened, "66");
  assert.equal(collected.collected, true);
  assert.ok(!collected.state.searched.includes("66"));
  assert.ok(collected.state.unlocked.includes("TEST-01"));
  assert.deepEqual(collected.newIds, ["TEST-01"]);

  const searched = engine.search(collected.state, "66");
  assert.ok(searched.state.searched.includes("66"));
  assert.ok(searched.results.some((item) => item.id === "TEST-01"));
});

test("all investigation records and required facts are reachable in every case", () => {
  for (const caseData of caseCatalog) {
    const state = completeReachability(engines.get(caseData.id));
    const expected = caseData.records.filter((item) => item.id !== "END-01").map((item) => item.id).sort();
    assert.deepEqual(state.unlocked.filter((id) => id !== "END-01").sort(), expected, caseData.id);
    assert.deepEqual(state.confirmedFacts.sort(), caseData.facts.map((item) => item.id).sort(), caseData.id);
  }
});

test("case states with identical record IDs remain isolated", () => {
  const save = createSave(engines);
  save.cases["case-001"] = engines.get("case-001").openRecord(save.cases["case-001"], "REQ-01").state;
  assert.ok(save.cases["case-001"].read.includes("REQ-01"));
  assert.ok(!save.cases["case-002"].read.includes("REQ-01"));
});

test("chapter two unlocks only after chapter one is solved", () => {
  const save = createSave(engines);
  assert.equal(isCaseUnlocked(case002, save.cases), false);
  save.cases["case-001"].solved = true;
  assert.equal(isCaseUnlocked(case002, save.cases), true);
});

test("legacy saves migrate chapter progress and global preferences", () => {
  const legacy = { ...engines.get("case-001").createInitialState(), version: 1, read: ["REQ-01"], searched: ["客厅"], settings: { fontScale: 1.25, reducedMotion: true }, tutorial: { automatic: false, seen: ["home"] } };
  delete legacy.collected;
  const storage = memoryStorage({ [LEGACY_SAVE_KEY]: JSON.stringify(legacy) });
  const loaded = loadSave(storage, engines);
  assert.ok(loaded.cases["case-001"].read.includes("REQ-01"));
  assert.deepEqual(loaded.cases["case-001"].collected, ["客厅"]);
  assert.deepEqual(loaded.preferences.settings, legacy.settings);
  assert.deepEqual(loaded.preferences.tutorial, legacy.tutorial);
  assert.equal("settings" in loaded.cases["case-001"], false);
  assert.equal("tutorial" in loaded.cases["case-001"], false);
  assert.ok(storage.values.has(SAVE_KEY));
  assert.ok(storage.values.has(LEGACY_SAVE_KEY));
});

test("resetting one chapter preserves other chapter progress and preferences", () => {
  const save = createSave(engines);
  save.preferences.settings.fontScale = 1.25;
  save.cases["case-001"].solved = true;
  save.cases["case-002"] = engines.get("case-002").openRecord(save.cases["case-002"], "REQ-01").state;
  const reset = resetCase(save, "case-002", engines.get("case-002"));
  assert.equal(reset.cases["case-001"].solved, true);
  assert.deepEqual(reset.cases["case-002"].read, []);
  assert.equal(reset.preferences.settings.fontScale, 1.25);
});

test("data-driven solutions ignore multiple-choice order but enforce event order", () => {
  const solution = case002.solution;
  const answer = Object.fromEntries(solution.questions.map((item) => [item.id, Array.isArray(item.answer) ? [...item.answer] : item.answer]));
  answer.eaters.reverse();
  assert.equal(validateSolution(solution, answer).correct, true);
  answer["event-order"].reverse();
  assert.equal(validateSolution(solution, answer).correct, false);
});

test("first chapter solution remains valid after conversion to questions", () => {
  const answer = Object.fromEntries(case001.solution.questions.map((item) => [item.id, Array.isArray(item.answer) ? [...item.answer] : item.answer]));
  assert.deepEqual(validateSolution(case001.solution, answer), { correct: true, errors: [] });
});
