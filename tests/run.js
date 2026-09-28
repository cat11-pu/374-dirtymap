import assert from "node:assert";
import { markOf, takeOf } from "../dirty.js";
import { step, close } from "../dirtyrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { dirty: [], flushed: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "mark", page: 3 }],
  bad_page_code: "E_BAD_PAGE", dup_code: "E_DUP_DIRTY",
  clean_code: "E_CLEAN", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("markOf returns a list", () => {
  assert.ok(Array.isArray(markOf([], 1)));
});

check("takeOf returns a list", () => {
  assert.ok(Array.isArray(takeOf([1, 2])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
