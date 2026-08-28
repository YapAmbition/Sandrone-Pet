import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRAITS,
  boundedChange,
  applyTraitEvent,
  driftTraits,
  roamWeights,
  chooseWeighted,
  huntWillingness,
  decorateSpeech
} from '../src/renderer/temperament.mjs';

test('bounded changes resist sticking to either edge', () => {
  assert.equal(boundedChange(90, 10), 91);
  assert.equal(boundedChange(10, -10), 9);
  assert.equal(boundedChange(5, 20), 24);
  assert.equal(boundedChange(95, -20), 76);
});

test('time drift converges on healthy awake targets instead of zero or one hundred', () => {
  let traits = { vitality: 0, temper: 100, boredom: 100, pride: 100, closeness: 18 };
  for (let minute = 0; minute < 8 * 60; minute += 1) {
    traits = driftTraits(traits, { seconds: 60, sleeping: false, secondsSinceInteraction: 300 });
  }
  assert.ok(traits.vitality > 55 && traits.vitality < 70);
  assert.ok(traits.temper > 15 && traits.temper < 30);
  assert.ok(traits.boredom > 65 && traits.boredom < 75);
  assert.ok(traits.pride > 40 && traits.pride < 50);
});

test('each short-term trait changes the expected action pressure', () => {
  const lowVitality = roamWeights({ ...DEFAULT_TRAITS, vitality: 10 });
  const highVitality = roamWeights({ ...DEFAULT_TRAITS, vitality: 90 });
  assert.ok(highVitality.jump > lowVitality.jump);
  assert.ok(highVitality.walkLeft > lowVitality.walkLeft);
  assert.ok(lowVitality.idle > highVitality.idle);

  const calm = roamWeights({ ...DEFAULT_TRAITS, temper: 5 });
  const angry = roamWeights({ ...DEFAULT_TRAITS, temper: 90 });
  assert.ok(angry.hiss > calm.hiss);
  assert.ok(angry.wave < calm.wave);

  const occupied = roamWeights({ ...DEFAULT_TRAITS, boredom: 5 });
  const bored = roamWeights({ ...DEFAULT_TRAITS, boredom: 90 });
  assert.ok(bored.wave > occupied.wave);
  assert.ok(bored.walkRight > occupied.walkRight);

  const unsure = roamWeights({ ...DEFAULT_TRAITS, pride: 5 });
  const proud = roamWeights({ ...DEFAULT_TRAITS, pride: 90 });
  assert.ok(proud.jump > unsure.jump);

  const distant = roamWeights({ ...DEFAULT_TRAITS, closeness: 5 });
  const close = roamWeights({ ...DEFAULT_TRAITS, closeness: 90 });
  assert.ok(close.wave > distant.wave);
});

test('an eight-hour behavior simulation keeps short-term traits away from permanent extremes', () => {
  let seed = 0x5a17;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  let traits = { ...DEFAULT_TRAITS };
  const extremeTicks = { vitality: 0, temper: 0, boredom: 0, pride: 0 };
  const samples = 8 * 60 * 6;
  for (let index = 0; index < samples; index += 1) {
    const action = chooseWeighted(roamWeights(traits), random);
    const event = ({ walkLeft: 'walk', walkRight: 'walk', wave: 'wave', jump: 'jump', hiss: 'hiss' })[action];
    if (event) traits = applyTraitEvent(traits, event, Date.now());
    if (index % 43 === 0) traits = applyTraitEvent(traits, random() < 0.55 ? 'caught' : 'missed', Date.now());
    traits = driftTraits(traits, {
      seconds: 10,
      sleeping: index % 360 >= 330,
      secondsSinceInteraction: index % 18 < 6 ? 10 : 120
    });
    for (const key of Object.keys(extremeTicks)) {
      if (traits[key] < 10 || traits[key] > 90) extremeTicks[key] += 1;
    }
  }
  for (const count of Object.values(extremeTicks)) assert.ok(count / samples < 0.60);
});

test('closeness has a daily gain cap and affects willingness to play', () => {
  const now = new Date('2026-08-28T12:00:00+08:00').getTime();
  let traits = { ...DEFAULT_TRAITS };
  for (let index = 0; index < 100; index += 1) traits = applyTraitEvent(traits, 'friendly', now);
  assert.ok(traits.closeness - DEFAULT_TRAITS.closeness <= 2.001);
  assert.ok(huntWillingness({ ...DEFAULT_TRAITS, closeness: 90 }) >
    huntWillingness({ ...DEFAULT_TRAITS, closeness: 5 }));
});

test('event and traits select a matching tsundere emoticon without changing the base line', () => {
  const angry = decorateSpeech('哈?~~', 'hiss', { ...DEFAULT_TRAITS, temper: 90 }, {
    now: 100_000,
    lastEmojiAt: 0,
    random: () => 0
  });
  assert.equal(angry.text, '哈?~~ (￣ヘ￣)');
  assert.equal(angry.usedEmoji, true);

  const cooldown = decorateSpeech('多涅。', 'wave', { ...DEFAULT_TRAITS, closeness: 90, pride: 90 }, {
    now: 110_000,
    lastEmojiAt: 100_000,
    random: () => 0
  });
  assert.equal(cooldown.text, '多涅。');
  assert.equal(cooldown.usedEmoji, false);
});
