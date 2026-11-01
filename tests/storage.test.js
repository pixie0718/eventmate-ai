// The saved state is best-effort: broken or blocked storage must never break the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save } from '../js/ui/storage.js';

const withStorage = (stub, fn) => {
  const saved = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: saved, configurable: true });
  }
};
const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};
const blocked = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

test('save then load round-trips the state', () => {
  withStorage(memory(), () => {
    save({ input: { name: 'A' }, checked: { t1: true } });
    assert.deepEqual(load(), { input: { name: 'A' }, checked: { t1: true } });
  });
});

test('load returns an empty state when nothing is saved or the data is corrupt', () => {
  withStorage(memory(), () => assert.deepEqual(load(), {}));
  const corrupt = { getItem: () => '{not json', setItem() {} };
  withStorage(corrupt, () => assert.deepEqual(load(), {}));
});

test('blocked storage is ignored instead of throwing', () => {
  withStorage(blocked, () => {
    assert.deepEqual(load(), {});
    assert.doesNotThrow(() => save({ input: {} }));
  });
});
