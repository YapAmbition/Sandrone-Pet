function duration(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours) return `${hours} 小时 ${remaining} 分钟`;
  if (minutes) return `${minutes} 分钟`;
  return '不到 1 分钟';
}

function count(value) { return `${Math.floor(value || 0)} 次`; }
function averageInterval(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} 秒`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} 分钟`;
  return `${(minutes / 60).toFixed(1)} 小时`;
}
function set(id, value) { document.querySelector(`#${id}`).textContent = value; }
function setTrait(name, value) {
  const amount = Math.max(0, Math.min(100, Number(value) || 0));
  document.querySelectorAll(`#trait-${name}, #gift-trait-${name}`).forEach((bar) => {
    bar.style.width = `${amount}%`;
    bar.parentElement.setAttribute('aria-label', `${Math.round(amount)}%`);
  });
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
  const totalFound = snapshot.gifts?.totalFound || counts;
  const total = giftTotal(counts);
  const lifetimeTotal = giftTotal(totalFound);
  const discovered = definitions.filter((gift) => (Number(totalFound[gift.id]) || 0) > 0 || firstFound[gift.id]).length;
  set('gift-summary', `已发现 ${discovered} / ${definitions.length} · 当前持有 ${total} 件`);
  document.querySelector('#gift-sparkle').hidden = lifetimeTotal <= (Number(snapshot.seenGiftCount) || 0);
  const grid = document.querySelector('#gift-grid');
  grid.replaceChildren(...definitions.map((gift) => {
    const countValue = Number(counts[gift.id]) || 0;
    const wasDiscovered = (Number(totalFound[gift.id]) || 0) > 0 || Boolean(firstFound[gift.id]);
    const card = document.createElement('article');
    card.className = 'gift-card';
    const visual = document.createElement(wasDiscovered ? 'img' : 'span');
    if (wasDiscovered) {
      visual.src = gift.imageUrl;
      visual.alt = gift.name;
    } else {
      visual.className = 'gift-placeholder';
      visual.textContent = '？';
    }
    const title = document.createElement('h3');
    title.textContent = wasDiscovered ? gift.name : '尚未发现';
    const count = document.createElement('p');
    count.className = 'gift-count';
    count.textContent = wasDiscovered ? `持有 ${countValue} 件` : '—';
    const detail = document.createElement('div');
    detail.className = 'gift-detail';
    const date = document.createElement('span');
    date.className = 'gift-date';
    date.textContent = `首次发现：${wasDiscovered ? giftDate(firstFound[gift.id]) : '—'}`;
    const note = document.createElement('p');
    note.className = 'gift-note';
    note.textContent = wasDiscovered ? gift.note : '多涅还没有找到它。';
    const effect = document.createElement('p');
    effect.className = 'gift-effect';
    effect.textContent = wasDiscovered ? gift.effect : '效果：—';
    const give = document.createElement('button');
    give.className = 'gift-give';
    give.textContent = '送她这个';
    give.disabled = countValue < 1;
    give.addEventListener('click', async () => {
      give.disabled = true;
      if (await window.statsAPI.giveGift(gift.id)) await refresh();
      else give.disabled = countValue < 1;
    });
    detail.append(date, note, effect, give);
    card.append(visual, title, count, detail);
    return card;
  }));
}

async function refresh() {
  const snapshot = await window.statsAPI.snapshot();
  const { today, total } = snapshot;
  set('today-companion', duration(today.companionSeconds));
  set('today-petting', `接受 ${today.pettingAccepted || 0} · 拒绝 ${today.pettingRejected || 0}`);
  set('today-pounce', `抓到 ${today.caught} · 扑空 ${today.missed}`);
  set('today-hisses', count(today.hisses));
  set('today-sleeps', count(today.sleeps));
  const todayPettings = Number(today.pettings || 0);
  const todayPounces = Number(today.caught || 0) + Number(today.missed || 0);
  set('today-permission-rate', todayPettings > 0 ?
    `${(100 * Number(today.pettingAccepted || 0) / todayPettings).toFixed(1)}%` : '暂无记录');
  set('today-pounce-accuracy', todayPounces > 0 ?
    `${(100 * Number(today.caught || 0) / todayPounces).toFixed(1)}%` : '暂无记录');
  set('today-guided-average', Number(today.guidedWalks || 0) > 0 ?
    `${(Number(today.guidedBodyLengths || 0) / Number(today.guidedWalks)).toFixed(1)} 身位` : '暂无记录');
  set('total-companion', duration(total.companionSeconds));
  set('total-petting', count(total.pettings));
  set('total-permission', `接受 ${total.pettingAccepted || 0} · 拒绝 ${total.pettingRejected || 0}`);
  set('total-pounce', `抓 ${total.caught || 0} · 空 ${total.missed || 0}`);
  set('total-guided', `${total.guidedWalks || 0} 次 · ${Number(total.guidedBodyLengths || 0).toFixed(1)} 身位`);
  set('total-hisses', count(total.hisses));
  set('total-sleeps', count(total.sleeps));
  set('total-interactions', count(total.interactions));
  set('total-found-gifts', `${giftTotal(snapshot.gifts?.totalFound || snapshot.gifts?.counts)} 件`);
  const giftDefinitions = snapshot.giftDefinitions || [];
  const firstFound = snapshot.gifts?.firstFound || {};
  const foundCounts = snapshot.gifts?.totalFound || snapshot.gifts?.counts || {};
  const discoveredKinds = giftDefinitions.filter((gift) =>
    (Number(foundCounts[gift.id]) || 0) > 0 || firstFound[gift.id]).length;
  set('total-gift-kinds', `${discoveredKinds} / ${giftDefinitions.length}`);
  const companionSeconds = Number(total.companionSeconds || 0);
  const interactions = Number(total.interactions || 0);
  const interactionsPerHour = companionSeconds >= 60 ? 3600 * interactions / companionSeconds : 0;
  const pettingPermission = total.pettings > 0 ? 100 * Number(total.pettingAccepted || 0) / total.pettings : 0;
  const totalPounces = Number(total.caught || 0) + Number(total.missed || 0);
  const pounceAccuracy = totalPounces > 0 ? 100 * Number(total.caught || 0) / totalPounces : 0;
  set('total-companion-equivalent', companionSeconds >= 60 ? `平均每小时互动 ${interactionsPerHour.toFixed(1)} 次` : '记录时间不足');
  set('total-petting-equivalent', total.pettings > 0 ? `最长连续摸头 ${total.bestPettingStreak || 0} 次` : '暂无摸头记录');
  set('total-permission-equivalent', total.pettings > 0 ? `摸头默许率 ${pettingPermission.toFixed(1)}%` : '暂无摸头记录');
  set('total-pounce-equivalent', totalPounces > 0 ? `扑击命中率 ${pounceAccuracy.toFixed(1)}%` : '暂无扑击记录');
  set('total-guided-equivalent', Number(total.guidedWalks || 0) > 0 ?
    `平均每次 ${(Number(total.guidedBodyLengths || 0) / Number(total.guidedWalks)).toFixed(1)} 个身位` : '暂无跟随记录');
  const hisses = Number(total.hisses || 0);
  let hissFrequency = '暂无哈气频率';
  if (hisses > 0 && interactions > 0) {
    const interactionsPerHiss = interactions / hisses;
    hissFrequency = interactionsPerHiss >= 1 ? `平均每 ${interactionsPerHiss.toFixed(1)} 次互动哈气一次` :
      `平均每次互动哈气 ${(1 / interactionsPerHiss).toFixed(1)} 次`;
  }
  set('total-hisses-equivalent', hissFrequency);
  const sleeps = Number(total.sleeps || 0);
  set('total-sleeps-equivalent', sleeps > 0 && companionSeconds > 0 ?
    `平均每 ${averageInterval(companionSeconds / sleeps)} 睡一次` : '暂无睡眠频率');
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
  const memory = page === 'memory';
  set('avatar', gifts ? '🎁' : memory ? '📖' : '🐾');
  set('page-title', gifts ? '多涅的小箱子' : memory ? '从相遇到现在' : '多涅小记');
  set('page-subtitle', gifts ? '她坚称这些东西不是送给你的' :
    memory ? '从累计记录里整理出的行为数据' : '悄悄记下和你待在一起的日子');
  document.querySelector('#avatar').classList.toggle('gift-avatar', gifts);
  if (gifts) {
    window.statsAPI.markGiftsSeen();
    document.querySelector('#gift-sparkle').hidden = true;
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectPage(tab.dataset.page));
});

const traitHelpDialog = document.querySelector('#trait-help-dialog');
document.querySelectorAll('.trait-help-button').forEach((button) => {
  button.addEventListener('click', () => traitHelpDialog.showModal());
});
document.querySelector('#trait-help-close').addEventListener('click', () => traitHelpDialog.close());
traitHelpDialog.addEventListener('click', (event) => {
  if (event.target === traitHelpDialog) traitHelpDialog.close();
});

document.querySelector('#reset').addEventListener('click', async () => {
  if (await window.statsAPI.reset()) refresh();
});
window.statsAPI.onChanged(refresh);
refresh()
  .then(() => window.statsAPI.rendererReady())
  .catch((error) => console.error('Unable to render stats window', error));
