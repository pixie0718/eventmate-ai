import test from 'node:test';
import assert from 'node:assert/strict';
import { donutSegments, DONUT_RADIUS } from '../js/chart.js';

const lines = [
  { id: 'a', amount: 250 },
  { id: 'b', amount: 500 },
  { id: 'c', amount: 250 },
];

test('circumference of the donut circle is 100 so dashes are percentages', () => {
  assert.ok(Math.abs(2 * Math.PI * DONUT_RADIUS - 100) < 1e-9);
});

test('segment shares add up to 100 and follow the amounts', () => {
  const segs = donutSegments(lines);
  assert.deepEqual(
    segs.map((s) => s.share),
    [25, 50, 25],
  );
  assert.equal(
    segs.reduce((s, x) => s + x.share, 0),
    100,
  );
});

test("segments are laid end to end starting at 12 o'clock", () => {
  const segs = donutSegments(lines);
  assert.deepEqual(
    segs.map((s) => s.offset),
    [25, 0, -50],
  );
  assert.equal(segs[1].dash, '50 50');
});

test('a zero total does not produce NaN', () => {
  const segs = donutSegments([{ id: 'a', amount: 0 }]);
  assert.equal(segs[0].share, 0);
  assert.ok(Number.isFinite(segs[0].offset));
});

test('every segment has a colour index inside the palette', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, amount: 1 }));
  assert.ok(donutSegments(many).every((s) => s.colorIndex >= 0 && s.colorIndex < 8));
});
