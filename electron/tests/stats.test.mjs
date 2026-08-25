import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PetStats } = require('../src/main/stats.cjs');

class MemoryStore {
  constructor() { this.data = {}; this.writes = 0; }
  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = structuredClone(value); this.writes += 1; }
}

test('companion time is persisted in ten-second batches', () => {
  const store = new MemoryStore();
  const stats = new PetStats(store);
  for (let index = 0; index < 9; index += 1) stats.add('companionSeconds', 1);
  assert.equal(store.writes, 0);
  stats.add('companionSeconds', 1);
  assert.equal(store.writes, 1);
  assert.equal(stats.snapshot().today.companionSeconds, 10);
});

test('reset clears both today and cumulative metrics', () => {
  const store = new MemoryStore();
  const stats = new PetStats(store);
  stats.add('hisses');
  stats.add('caught');
  stats.reset();
  assert.equal(stats.snapshot().today.hisses, 0);
  assert.equal(stats.snapshot().total.caught, 0);
});
