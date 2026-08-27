const EMPTY_METRICS = Object.freeze({
  companionSeconds: 0,
  interactions: 0,
  caught: 0,
  missed: 0,
  hisses: 0,
  sleeps: 0
});

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
        firstFound: { ...(stored.gifts?.firstFound || {}) }
      }
    };
    this.pendingCompanionSeconds = 0;
    this.ensureCurrentDay();
  }

  ensureCurrentDay() {
    const today = localDayKey();
    if (this.data.dayKey === today) return;
    this.data.dayKey = today;
    this.data.today = { ...EMPTY_METRICS };
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

  recordGift(identifier, date = new Date()) {
    if (typeof identifier !== 'string' || !identifier) return;
    const counts = this.data.gifts.counts;
    counts[identifier] = Math.max(0, Number(counts[identifier]) || 0) + 1;
    if (!this.data.gifts.firstFound[identifier]) {
      this.data.gifts.firstFound[identifier] = date.toISOString();
    }
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
      gifts: { counts: {}, firstFound: {} }
    };
    this.pendingCompanionSeconds = 0;
    this.save();
  }

  save() {
    this.pendingCompanionSeconds = 0;
    this.store.set('stats', this.data);
  }
}

module.exports = { PetStats, localDayKey };
