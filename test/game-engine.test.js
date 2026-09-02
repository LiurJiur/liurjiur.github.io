import assert from "node:assert/strict";
import test from "node:test";
import { facts, records, solution } from "../src/content/game-data.js";
import { collectConcept, createInitialState, loadState, markTutorialSeen, normalize, openRecord, resetTutorialProgress, resolveConcept, search, shouldShowTutorial, validateSolution } from "../src/engine/game-engine.js";

test("initial state exposes the five documented starting records", () => {
  const state = createInitialState();
  assert.deepEqual(state.unlocked.sort(), ["CHAT-01", "FILE-01", "MAP-01", "REQ-01", "SYS-00"]);
});

test("tutorial topics are shown once and can be reset", () => {
  const initial = createInitialState();
  assert.equal(shouldShowTutorial(initial, "home"), true);
  const seen = markTutorialSeen(initial, "home");
  assert.equal(shouldShowTutorial(seen, "home"), false);
  assert.equal(shouldShowTutorial(initial, "home"), true, "the original state stays immutable");
  assert.equal(shouldShowTutorial(resetTutorialProgress(seen), "home"), true);
});

test("old saves receive tutorial defaults", () => {
  const oldSave = createInitialState();
  delete oldSave.tutorial;
  const storage = { getItem: () => JSON.stringify(oldSave) };
  const loaded = loadState(storage);
  assert.deepEqual(loaded.tutorial, { automatic: true, seen: [] });
});

test("old saves only treat previously searched concepts as collected", () => {
  const oldSave = { ...createInitialState(), discovered: ["客厅", "小酒"], searched: ["客厅"] };
  delete oldSave.collected;
  const storage = { getItem: () => JSON.stringify(oldSave) };
  assert.deepEqual(loadState(storage).collected, ["客厅"]);
});

test("invalid tutorial save fields are sanitized", () => {
  const saved = { ...createInitialState(), tutorial: { automatic: "yes", seen: ["home", null, 3] } };
  const storage = { getItem: () => JSON.stringify(saved) };
  assert.deepEqual(loadState(storage).tutorial, { automatic: true, seen: ["home"] });
});

test("aliases and punctuation normalize to canonical concepts", () => {
  assert.equal(resolveConcept("  扫地机！"), "小扫");
  assert.equal(resolveConcept("八点三十三"), "20:33");
  assert.equal(normalize("蓝色 纸箱。"), "蓝色纸箱");
});

test("reading and searching unlock the客厅 branch", () => {
  let state = createInitialState();
  state = openRecord(state, "REQ-01").state;
  const result = search(state, "客厅");
  assert.equal(result.concept, "客厅");
  assert.ok(result.state.collected.includes("客厅"));
  assert.ok(result.state.unlocked.includes("REC-01"));
  assert.ok(result.state.unlocked.includes("TEST-02"));
});

test("collecting a concept does not count as searching it", () => {
  const state = openRecord(createInitialState(), "CHAT-01").state;
  assert.ok(state.discovered.includes("小酒"));
  assert.ok(!state.collected.includes("小酒"));
  const firstClick = collectConcept(state, "小酒");
  assert.equal(firstClick.collected, true);
  assert.equal(firstClick.concept, "小酒");
  assert.ok(firstClick.state.collected.includes("小酒"));
  assert.ok(!firstClick.state.searched.includes("小酒"));
  assert.deepEqual(firstClick.state.unlocked, state.unlocked);

  const secondClick = collectConcept(firstClick.state, "小酒");
  assert.equal(secondClick.collected, false);
  assert.equal(secondClick.state, firstClick.state);
});

test("all non-ending records and facts are reachable from discovered concepts", () => {
  let state = createInitialState();
  let signature = "";
  for (let pass = 0; pass < 100; pass += 1) {
    for (const id of [...state.unlocked]) state = openRecord(state, id).state;
    for (const concept of [...state.discovered]) state = search(state, concept).state;
    const nextSignature = `${state.unlocked.length}/${state.read.length}/${state.discovered.length}`;
    if (signature === nextSignature) break;
    signature = nextSignature;
  }
  const expected = records.filter((record) => record.id !== "END-01").map((record) => record.id).sort();
  assert.deepEqual(state.unlocked.filter((id) => id !== "END-01").sort(), expected);
  assert.deepEqual(state.confirmedFacts.sort(), facts.map((fact) => fact.id).sort());
});

test("final deduction reports contradictions without clearing answers", () => {
  const wrong = validateSolution({
    lastPlayer: "铁胆", firstTaker: "小流儿", liars: ["铁胆"], carrier: "小流儿",
    location: "蓝色纸箱", order: [...solution.order].reverse(),
  }, solution);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.errors.length, 5);
});

test("canonical final deduction succeeds", () => {
  const answer = {
    lastPlayer: solution.lastPlayer, firstTaker: solution.firstTaker, liars: [...solution.liars],
    carrier: solution.carrier, location: solution.location, order: [...solution.order],
  };
  assert.deepEqual(validateSolution(answer, solution), { correct: true, errors: [] });
});
