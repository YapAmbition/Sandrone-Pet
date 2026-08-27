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

test('gift counts and first discovery date are persisted', () => {
  const store = new MemoryStore();
  const stats = new PetStats(store);
  const discovered = new Date('2026-08-27T12:00:00.000Z');
  stats.recordGift('screw', discovered);
  stats.recordGift('screw', new Date('2026-08-28T12:00:00.000Z'));
  const snapshot = stats.snapshot();
  assert.equal(snapshot.gifts.counts.screw, 2);
  assert.equal(snapshot.gifts.firstFound.screw, discovered.toISOString());
  assert.equal(store.data.stats.gifts.counts.screw, 2);
});

test('reset also clears the gift box', () => {
  const store = new MemoryStore();
  const stats = new PetStats(store);
  stats.recordGift('ruby');
  stats.reset();
  assert.deepEqual(stats.snapshot().gifts, { counts: {}, firstFound: {} });
});
