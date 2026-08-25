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

async function refresh() {
  const { today, total } = await window.statsAPI.snapshot();
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
}

document.querySelector('#reset').addEventListener('click', async () => {
  if (await window.statsAPI.reset()) refresh();
});
window.statsAPI.onChanged(refresh);
refresh();
