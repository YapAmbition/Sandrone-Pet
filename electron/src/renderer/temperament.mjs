export const DEFAULT_TRAITS = Object.freeze({
  vitality: 68,
  temper: 22,
  boredom: 32,
  pride: 46,
  closeness: 18,
  closenessDay: '',
  closenessGainToday: 0
});

export function clampTrait(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function normalizeTraits(value = {}) {
  const normalized = (key) => {
    const number = Number(value[key]);
    return clampTrait(Number.isFinite(number) ? number : DEFAULT_TRAITS[key]);
  };
  return {
    vitality: normalized('vitality'),
    temper: normalized('temper'),
    boredom: normalized('boredom'),
    pride: normalized('pride'),
    closeness: normalized('closeness'),
    closenessDay: typeof value.closenessDay === 'string' ? value.closenessDay : '',
    closenessGainToday: Math.max(0, Number(value.closenessGainToday) || 0)
  };
}

export function boundedChange(value, delta) {
  const current = clampTrait(value);
  const amount = Number(delta) || 0;
  if (amount >= 0) return clampTrait(current + amount * (1 - current / 100));
  return clampTrait(current + amount * (current / 100));
}

export function applyTraitEvent(input, event, now = Date.now()) {
  const traits = normalizeTraits(input);
  const deltas = {
    walk: { vitality: -2, boredom: -1 },
    wave: { vitality: -1, boredom: -3 },
    jump: { vitality: -4, pride: 1 },
    hiss: { vitality: -1, temper: -5 },
    irritated: { temper: 10 },
    repeatedPoke: { temper: 14, boredom: -4 },
    drag: { temper: 12, pride: -4, boredom: -5 },
    caught: { vitality: -6, boredom: -10, pride: 12, temper: -4 },
    missed: { vitality: -5, boredom: -6, pride: -8, temper: 8 },
    gift: { boredom: -6, pride: 8 },
    giftTapped: { temper: 8, boredom: -2 },
    petted: { temper: -3, boredom: -7 },
    showOff: { pride: -3 },
    friendly: { boredom: -6 }
  }[event] || {};
  for (const [key, delta] of Object.entries(deltas)) traits[key] = boundedChange(traits[key], delta);

  if (['friendly', 'caught', 'gift', 'petted'].includes(event)) {
    const requested = event === 'friendly' ? 0.35 : event === 'petted' ? 0.25 : 0.2;
    traits.closeness = boundedChange(traits.closeness, requested);
  }
  return traits;
}

export function applyGiftEffect(input, identifier, now = Date.now()) {
  const traits = normalizeTraits(input);
  const deltas = {
    screw: { vitality: 18, boredom: 4 },
    feather: { pride: 16, vitality: -6 },
    gear: { boredom: -18, temper: -4 },
    ruby: { temper: 10, pride: -6 }
  }[identifier];
  if (!deltas) return traits;
  for (const [key, delta] of Object.entries(deltas)) traits[key] = boundedChange(traits[key], delta);
  traits.closeness = boundedChange(traits.closeness, 0.25);
  return traits;
}

function approach(value, target, ratePerSecond, seconds) {
  const factor = 1 - Math.exp(-Math.max(0, seconds) * ratePerSecond);
  return clampTrait(value + (target - value) * factor);
}

export function driftTraits(input, { seconds = 1, sleeping = false, secondsSinceInteraction = 0 } = {}) {
  const traits = normalizeTraits(input);
  if (sleeping) {
    traits.vitality = approach(traits.vitality, 90, 0.018, seconds);
    traits.temper = approach(traits.temper, 15, 0.010, seconds);
    return traits;
  }
  traits.vitality = approach(traits.vitality, 62, 0.0025, seconds);
  traits.temper = approach(traits.temper, 20, 0.0030, seconds);
  traits.pride = approach(traits.pride, 45, 0.0025, seconds);
  const boredomTarget = secondsSinceInteraction < 30 ? 20 : 70;
  traits.boredom = approach(traits.boredom, boredomTarget, 0.0090, seconds);
  return traits;
}

export function roamWeights(input, activityLevel = 'default') {
  const traits = normalizeTraits(input);
  const v = traits.vitality / 100;
  const a = traits.temper / 100;
  const b = traits.boredom / 100;
  const p = traits.pride / 100;
  const c = traits.closeness / 100;
  return {
    walkRight: 20 * (0.35 + 0.65 * v) * (0.55 + 0.45 * b),
    walkLeft: 20 * (0.35 + 0.65 * v) * (0.55 + 0.45 * b),
    wave: 15 * (0.25 + 0.45 * c + 0.30 * b) * (1 - 0.35 * a),
    jump: 10 * (0.15 + 0.85 * v) * (0.65 + 0.35 * p),
    hiss: 10 * (0.15 + 0.85 * a) * (0.75 + 0.25 * b)
  };
}

export function chooseWeighted(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => Number.isFinite(weight) && weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!entries.length || total <= 0) return 'idle';
  let roll = Math.max(0, Math.min(0.999999999, random())) * total;
  for (const [name, weight] of entries) {
    roll -= weight;
    if (roll < 0) return name;
  }
  return entries.at(-1)[0];
}

export function huntWillingness(input) {
  const traits = normalizeTraits(input);
  const v = traits.vitality / 100;
  const a = traits.temper / 100;
  const b = traits.boredom / 100;
  const c = traits.closeness / 100;
  return Math.max(0.12, Math.min(0.85, 0.10 + 0.40 * v + 0.25 * b + 0.15 * c - 0.25 * a));
}

function weightedCandidate(candidates, random) {
  return chooseWeighted(Object.fromEntries(candidates.map((candidate, index) => [index, candidate.score])), random);
}

export function decorateSpeech(base, event, input, options = {}) {
  const traits = normalizeTraits(input);
  const random = options.random || Math.random;

  const a = traits.temper / 100;
  const p = traits.pride / 100;
  const c = traits.closeness / 100;
  const candidates = [];
  if (['hiss', 'missed', 'drag', 'giftTapped'].includes(event)) {
    candidates.push({ score: Math.max(0.08, a), emoji: a > 0.68 ? '(￣ヘ￣)' : '( •̀ ᴖ •́ )' });
  }
  if (['proud', 'caught', 'giftProud'].includes(event)) {
    candidates.push({ score: Math.max(0.08, p), emoji: '(￣︶￣)✨' });
    candidates.push({ score: Math.max(0.05, c * p * 0.55), emoji: '(˘^˘)' });
  }
  if (event === 'wave') {
    candidates.push({ score: Math.max(0.05, c * (0.55 * p + 0.45 * (1 - a))), emoji: '(￣^￣)ノ' });
    candidates.push({ score: Math.max(0.02, c * (1 - a) * 0.16), emoji: '(⁄ ⁄•⁄-⁄•⁄ ⁄)' });
  }
  if (event === 'turnAway') {
    candidates.push({ score: Math.max(0.08, 0.65 * p + 0.35 * a), emoji: '(˘^˘)' });
  }
  if (event === 'dodge') {
    candidates.push({ score: Math.max(0.08, 0.70 * a + 0.30 * p), emoji: '(￣ヘ￣)' });
  }
  if (!candidates.length) return { text: base, usedEmoji: false };
  const strongest = Math.max(...candidates.map((candidate) => candidate.score));
  const eventBonus = ['hiss', 'missed', 'drag', 'caught'].includes(event) ? 0.10 : 0;
  const probability = Math.min(0.70, 0.05 + strongest * 0.55 + eventBonus);
  if (random() >= probability) return { text: base, usedEmoji: false };
  const selected = candidates[Number(weightedCandidate(candidates, random))] || candidates[0];
  return { text: `${base} ${selected.emoji}`, usedEmoji: true };
}
