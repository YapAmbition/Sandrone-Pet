const GIFTS = Object.freeze([
  Object.freeze({ id: 'screw', name: '黄铜发条钥匙', asset: 'winding-key.png', weight: 40,
    note: '被擦得亮晶晶的。多涅坚称只是顺手捡到。',
    effect: '⚡ 活力大幅↑ · 🧶 无聊微升\n🤍 亲近微升' }),
  Object.freeze({ id: 'feather', name: '黑金蝴蝶结', asset: 'black-gold-bow.png', weight: 30,
    note: '端庄又可爱，和某位傲娇淑女十分相配。',
    effect: '👑 得意大幅↑ · ⚡ 活力下降\n🤍 亲近微升' }),
  Object.freeze({ id: 'gear', name: '齿轮蔷薇', asset: 'clockwork-rose.png', weight: 22,
    note: '花瓣会在光下微微转动，她似乎很中意。',
    effect: '🧶 无聊大幅↓ · 💢 脾气下降\n🤍 亲近微升' }),
  Object.freeze({ id: 'ruby', name: '红宝石胸针', asset: 'ruby-brooch.png', weight: 8,
    note: '罕见的闪亮收藏。她展示时明显格外得意。',
    effect: '💢 脾气上升 · 👑 得意下降\n🤍 亲近微升' })
]);

module.exports = { GIFTS };
