import { test } from "node:test";
import assert from "node:assert/strict";
import { legTime, walk, walkAt, WALK } from "./live.ts";

test("Spot walks smoothly, dwells at stops, and takes the stairs at a leg's midpoint", () => {
  const w = walk([{ x: 0, y: 0, floor: 1 }, { x: 10, y: 0, floor: 1 }, { x: 10, y: 20, floor: 2 }]);
  const leg = 10 / WALK.speed;
  assert.deepEqual(walkAt(w, leg / 2).pt, { x: 5, y: 0, floor: 1 });
  assert.equal(walkAt(w, leg / 2).dwelling, undefined);
  assert.equal(walkAt(w, leg + 0.1).dwelling, 1); // checking the floor at stop 1
  const half = leg + WALK.dwell + 10 / WALK.speed; // at the stairs, still floor 1
  assert.equal(walkAt(w, half).pt.floor, 1);
  assert.equal(walkAt(w, half + WALK.stairs + 0.01).pt.floor, 2);
  assert.equal(walkAt(w, 999).reached, 2);
  assert.ok(legTime(w, 2, 0.5) > leg + WALK.dwell);
});
