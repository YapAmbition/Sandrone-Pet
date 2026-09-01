const EMPTY_METRICS = Object.freeze({
  companionSeconds: 0,
  interactions: 0,
  caught: 0,
  missed: 0,
  hisses: 0,
  sleeps: 0,
  pettings: 0,
  pettingAccepted: 0,
  pettingRejected: 0,
  bestPettingStreak: 0,
  guidedWalks: 0,
  guidedBodyLengths: 0
});

const DEFAULT_TRAITS = Object.freeze({
  vitality: 68, temper: 22, boredom: 32, pride: 46, closeness: 18,
  closenessDay: '', closenessGainToday: 0
});

function normalizeTraits(value = {}) {
  const result = { ...DEFAULT_TRAITS, ...value };
  for (const key of ['vitality', 'temper', 'boredom', 'pride', 'closeness']) {
    const number = Number(result[key]);
    result[key] = Math.max(0, Math.min(100, Number.isFinite(number) ? number : DEFAULT_TRAITS[key]));
  }
  result.closenessDay = typeof result.closenessDay === 'string' ? result.closenessDay : '';
  result.closenessGainToday = Math.max(0, Number(result.closenessGainToday) || 0);
  return result;
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class PetStats {
  constructor(store) {
    this.store = store;
    const stored = store.get('stats') || {};
    this.data = {
      dayKey: stored.dayKey || localDayKey(),
      today: { ...EMPTY_METRICS, ...(stored.today || {}) },
      total: { ...EMPTY_METRICS, ...(stored.total || {}) },
      gifts: {
        counts: { ...(stored.gifts?.counts || {}) },
        firstFound: { ...(stored.gifts?.firstFound || {}) },
        totalFound: { ...(stored.gifts?.totalFound || stored.gifts?.counts || {}) }
      },
      traits: normalizeTraits(stored.traits)
    };
    this.todayPettingStreak = Math.max(0, Number(stored.todayPettingStreak) || 0);
    this.totalPettingStreak = Math.max(0, Number(stored.totalPettingStreak) || 0);
    this.pendingCompanionSeconds = 0;
    this.ensureCurrentDay();
  }

  ensureCurrentDay() {
    const today = localDayKey();
    if (this.data.dayKey === today) return;
    this.data.dayKey = today;
    this.data.today = { ...EMPTY_METRICS };
    this.todayPettingStreak = 0;
    this.save();
  }

  add(metric, amount = 1) {
    if (!(metric in EMPTY_METRICS) || !Number.isFinite(amount) || amount <= 0) return;
    this.ensureCurrentDay();
    this.data.today[metric] += amount;
    this.data.total[metric] += amount;
    if (metric === 'companionSeconds') {
      this.pendingCompanionSeconds += amount;
      if (this.pendingCompanionSeconds >= 10) this.save();
    } else {
      this.save();
    }
  }

  recordPetting(accepted) {
    this.ensureCurrentDay();
    this.data.today.pettings += 1;
    this.data.total.pettings += 1;
    if (accepted) {
      this.data.today.pettingAccepted += 1;
      this.data.total.pettingAccepted += 1;
      this.todayPettingStreak += 1;
      this.totalPettingStreak += 1;
      this.data.today.bestPettingStreak = Math.max(this.data.today.bestPettingStreak, this.todayPettingStreak);
      this.data.total.bestPettingStreak = Math.max(this.data.total.bestPettingStreak, this.totalPettingStreak);
    } else {
      this.data.today.pettingRejected += 1;
      this.data.total.pettingRejected += 1;
      this.todayPettingStreak = 0;
      this.totalPettingStreak = 0;
    }
    this.save();
  }

  recordGuidedWalk(bodyLengths) {
    const amount = Number(bodyLengths);
    if (!Number.isFinite(amount) || amount < 0.35) return;
    this.ensureCurrentDay();
    this.data.today.guidedWalks += 1;
    this.data.total.guidedWalks += 1;
    this.data.today.guidedBodyLengths += amount;
    this.data.total.guidedBodyLengths += amount;
    this.save();
  }

  recordGift(identifier, date = new Date()) {
    if (typeof identifier !== 'string' || !identifier) return;
    const counts = this.data.gifts.counts;
    counts[identifier] = Math.max(0, Number(counts[identifier]) || 0) + 1;
    const totalFound = this.data.gifts.totalFound;
    totalFound[identifier] = Math.max(0, Number(totalFound[identifier]) || 0) + 1;
    if (!this.data.gifts.firstFound[identifier]) {
      this.data.gifts.firstFound[identifier] = date.toISOString();
    }
    this.save();
  }

  consumeGift(identifier) {
    if (typeof identifier !== 'string' || !identifier) return false;
    const counts = this.data.gifts.counts;
    const current = Math.max(0, Number(counts[identifier]) || 0);
    if (current < 1) return false;
    counts[identifier] = current - 1;
    this.save();
    return true;
  }

  setTraits(value) {
    this.data.traits = normalizeTraits(value);
    this.save();
  }

  snapshot() {
    this.ensureCurrentDay();
    return structuredClone(this.data);
  }

  reset() {
    this.data = {
      dayKey: localDayKey(),
      today: { ...EMPTY_METRICS },
      total: { ...EMPTY_METRICS },
      gifts: { counts: {}, firstFound: {}, totalFound: {} },
      traits: normalizeTraits()
    };
    this.pendingCompanionSeconds = 0;
    this.todayPettingStreak = 0;
    this.totalPettingStreak = 0;
    this.save();
  }

  save() {
    this.pendingCompanionSeconds = 0;
    this.store.set('stats', {
      ...this.data,
      todayPettingStreak: this.todayPettingStreak,
      totalPettingStreak: this.totalPettingStreak
    });
  }
}

module.exports = { PetStats, localDayKey };
