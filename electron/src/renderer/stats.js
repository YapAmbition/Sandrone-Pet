function duration(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours) return `${hours} 小时 ${remaining} 分钟`;
  if (minutes) return `${minutes} 分钟`;
  return '不到 1 分钟';
}

function count(value) { return `${Math.floor(value || 0)} 次`; }
function set(id, value) { document.querySelector(`#${id}`).textContent = value; }
function setTrait(name, value) {
  const bar = document.querySelector(`#trait-${name}`);
  const amount = Math.max(0, Math.min(100, Number(value) || 0));
  bar.style.width = `${amount}%`;
  bar.parentElement.setAttribute('aria-label', `${Math.round(amount)}%`);
}

function giftTotal(counts) {
  return Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function giftDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderGifts(snapshot) {
  const definitions = snapshot.giftDefinitions || [];
  const counts = snapshot.gifts?.counts || {};
  const firstFound = snapshot.gifts?.firstFound || {};
  const total = giftTotal(counts);
  const discovered = definitions.filter((gift) => (Number(counts[gift.id]) || 0) > 0).length;
  set('gift-summary', `已发现 ${discovered} / ${definitions.length} · 共收藏 ${total} 件`);
  document.querySelector('#gift-sparkle').hidden = total <= (Number(snapshot.seenGiftCount) || 0);
  const grid = document.querySelector('#gift-grid');
  grid.replaceChildren(...definitions.map((gift) => {
    const countValue = Number(counts[gift.id]) || 0;
    const card = document.createElement('article');
    card.className = 'gift-card';
    const visual = document.createElement(countValue ? 'img' : 'span');
    if (countValue) {
      visual.src = gift.imageUrl;
      visual.alt = gift.name;
    } else {
      visual.className = 'gift-placeholder';
      visual.textContent = '？';
    }
    const title = document.createElement('h3');
    title.textContent = countValue ? gift.name : '尚未发现';
    const count = document.createElement('p');
    count.className = 'gift-count';
    count.textContent = countValue ? `收藏 ${countValue} 件` : '—';
    const detail = document.createElement('div');
    detail.className = 'gift-detail';
    const date = document.createElement('span');
    date.className = 'gift-date';
    date.textContent = `首次发现：${countValue ? giftDate(firstFound[gift.id]) : '—'}`;
    const note = document.createElement('p');
    note.className = 'gift-note';
    note.textContent = countValue ? gift.note : '多涅还没有找到它。';
    detail.append(date, note);
    card.append(visual, title, count, detail);
    return card;
  }));
}

async function refresh() {
  const snapshot = await window.statsAPI.snapshot();
  const { today, total } = snapshot;
  set('today-companion', duration(today.companionSeconds));
  set('today-interactions', count(today.interactions));
  set('today-pounce', `抓到 ${today.caught} · 扑空 ${today.missed}`);
  set('today-hisses', count(today.hisses));
  set('today-sleeps', count(today.sleeps));
  set('total-companion', duration(total.companionSeconds));
  set('total-interactions', count(total.interactions));
  set('total-caught', count(total.caught));
  set('total-missed', count(total.missed));
  set('total-hisses', count(total.hisses));
  set('total-sleeps', count(total.sleeps));
  const traits = snapshot.traits || {};
  setTrait('vitality', traits.vitality);
  setTrait('temper', traits.temper);
  setTrait('boredom', traits.boredom);
  setTrait('pride', traits.pride);
  setTrait('closeness', traits.closeness);
  renderGifts(snapshot);
}

function selectPage(page) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.page === page));
  document.querySelectorAll('.page').forEach((element) => element.classList.toggle('active', element.id === `${page}-page`));
  const gifts = page === 'gifts';
  set('avatar', gifts ? '🎁' : '🐾');
  set('page-title', gifts ? '多涅的小箱子' : '多涅小记');
  set('page-subtitle', gifts ? '她坚称这些东西不是送给你的' : '悄悄记下和你待在一起的日子');
  document.querySelector('#avatar').classList.toggle('gift-avatar', gifts);
  if (gifts) {
    window.statsAPI.markGiftsSeen();
    document.querySelector('#gift-sparkle').hidden = true;
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectPage(tab.dataset.page));
});

document.querySelector('#reset').addEventListener('click', async () => {
  if (await window.statsAPI.reset()) refresh();
});
window.statsAPI.onChanged(refresh);
refresh()
  .then(() => window.statsAPI.rendererReady())
  .catch((error) => console.error('Unable to render stats window', error));
