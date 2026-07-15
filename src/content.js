export const CLASSES = {
  assault: { name: '突击兵', code: 'ASSAULT', description: '伤害与射速提高，适合正面突破。', damage: 1.18, fireRate: 1.12, range: 1, startSquad: 0 },
  engineer: { name: '工程师', code: 'ENGINEER', description: '载具持续更久，自动修复护盾。', damage: 1, fireRate: 1, range: 1.08, vehicle: 1.5 },
  medic: { name: '医疗兵', code: 'MEDIC', description: '初始增援增加，并周期性补充兵力。', damage: 0.94, fireRate: 1, range: 1, startSquad: 12 },
  sniper: { name: '狙击手', code: 'SNIPER', description: '超远射程与高伤害，但射速较低。', damage: 1.48, fireRate: 0.76, range: 1.42, startSquad: -2 },
};

export const FORMATIONS = {
  balanced: { name: '标准楔形', description: '无修正，稳定应对所有场景。', damage: 1, loss: 1, spread: 1 },
  shield: { name: '盾墙阵', description: '接触损失 -30%，伤害 -10%。', damage: 0.9, loss: 0.7, spread: 0.8 },
  assault: { name: '突击纵队', description: '伤害 +22%，接触损失 +15%。', damage: 1.22, loss: 1.15, spread: 0.72 },
  scatter: { name: '散兵阵', description: '队形范围扩大，爆炸伤害降低。', damage: 1.04, loss: 0.88, spread: 1.35 },
};

export const RELICS = {
  overclock: { name: '红线超频器', description: '射速 +18%', stat: 'fireRate', value: 0.18 },
  longshot: { name: '鹰眼测距仪', description: '射程 +22%', stat: 'range', value: 0.22 },
  warhead: { name: '贫铀弹芯', description: '伤害 +20%', stat: 'damage', value: 0.2 },
  collector: { name: '黄金回收协议', description: '金币价值 +25%', stat: 'coin', value: 0.25 },
  battalion: { name: '战地征召令', description: '立即增加 20% 兵力', stat: 'squad', value: 0.2 },
  aegis: { name: '蜂巢护盾', description: '每次进入新地图获得护盾', stat: 'shield', value: 5 },
  cryocore: { name: '低温核心', description: '精英事件冻结敌人 3 秒', stat: 'freeze', value: 3 },
  executioner: { name: '处决模块', description: 'Boss 伤害 +30%', stat: 'bossDamage', value: 0.3 },
  twinbarrel: { name: '双联供弹器', description: '每次射击有 25% 额外弹丸', stat: 'multishot', value: 0.25 },
  salvage: { name: '废土契约', description: '受伤时掉落少量金币', stat: 'hurtCoin', value: 2 },
  vampire: { name: '再生血清', description: '每 25 次击杀补充 1 人', stat: 'lifesteal', value: 25 },
  phase: { name: '相位靴', description: '2D 跳跃高度 +20%', stat: 'jump', value: 0.2 },
};

export const PERKS = [
  { id: 'dmg10', name: '火力校准', description: '本局伤害 +15%', stat: 'damage', value: 0.15 },
  { id: 'rate12', name: '快速循环', description: '本局射速 +14%', stat: 'fireRate', value: 0.14 },
  { id: 'range18', name: '延伸枪管', description: '本局射程 +20%', stat: 'range', value: 0.2 },
  { id: 'squad20', name: '紧急征召', description: '立即增加 25% 兵力', stat: 'squad', value: 0.25 },
  { id: 'coin30', name: '搜刮优先', description: '本局金币收益 +30%', stat: 'coin', value: 0.3 },
  { id: 'shield', name: '应急屏障', description: '立即获得 10 秒护盾', stat: 'shield', value: 10 },
];

export const VEHICLES = {
  bike: { name: '荒原摩托', description: '高速穿越并自动吸附金币。', speed: 1.45, duration: 16, damage: 1.15 },
  apc: { name: '装甲运兵车', description: '免疫接触伤害并持续机枪扫射。', speed: 1.12, duration: 20, damage: 1.4 },
  guntruck: { name: '炮塔卡车', description: '降低速度但获得强力范围伤害。', speed: 0.92, duration: 22, damage: 1.85 },
};

export const BIOMES = {
  city: { name: '沦陷城市', at: 0, fog: 0x0b1017, sky: 0x070b10, weather: 'rain' },
  subway: { name: '地下铁网', at: 700, fog: 0x10130f, sky: 0x050706, weather: 'toxic' },
  wasteland: { name: '赤色废土', at: 1400, fog: 0x2b1711, sky: 0x140b08, weather: 'sand' },
  lab: { name: '零号实验室', at: 2200, fog: 0x0b1f24, sky: 0x061014, weather: 'storm' },
  fortress: { name: '终焉要塞', at: 3200, fog: 0x220b0e, sky: 0x0d0507, weather: 'bloodmoon' },
};

export const WEATHER = {
  clear: { name: '低云', enemySpeed: 1, damage: 1, coin: 1 },
  rain: { name: '酸雨', enemySpeed: 0.94, damage: 1, coin: 1.05 },
  sand: { name: '沙尘暴', enemySpeed: 1.06, damage: 0.95, coin: 1.15 },
  toxic: { name: '毒雾', enemySpeed: 1.08, damage: 1.08, coin: 1 },
  storm: { name: '雷暴', enemySpeed: 1, damage: 1.15, coin: 1.1 },
  bloodmoon: { name: '血月', enemySpeed: 1.2, damage: 1.2, coin: 1.35 },
};

export const SIDE_BOSSES = {
  brute: { name: '破墙兽', hp: 1.2, reward: 35, description: '撞碎障碍并制造冲击波。' },
  stalker: { name: '巨型追逐者', hp: 0.9, reward: 45, description: '从画面后方持续追赶。' },
  copter: { name: '感染直升机', hp: 0.75, reward: 55, description: '空投路障并进行扫射。' },
};

export const TERRAIN = ['高台', '断桥', '滑索', '移动升降机'];

export const SPECIAL_GATES = {
  gamble: { name: '赌博门', description: '50% 兵力翻倍，50% 损失 30%。' },
  clone: { name: '复制门', description: '复制当前武器并提高融合等级。' },
  sacrifice: { name: '献祭门', description: '损失 15% 兵力，永久提高本局伤害。' },
  time: { name: '时间门', description: '冻结全部敌人并触发金币狂热。' },
};

export const STORY_EVENTS = [
  { id: 'camp', title: '废弃幸存者营地', text: '营地里还有求救信号，但尸群正在靠近。', choices: [
    { label: '救援幸存者', effect: 'squad', value: 18 }, { label: '搜刮补给', effect: 'coins', value: 30 },
  ] },
  { id: 'trader', title: '黑市车队', text: '车队愿意出售试验弹药，代价是部分金币。', choices: [
    { label: '购买弹药', effect: 'damage', value: 0.2 }, { label: '拒绝交易', effect: 'shield', value: 8 },
  ] },
  { id: 'signal', title: '军事频道', text: '频道中同时出现撤离点与军械库坐标。', choices: [
    { label: '前往军械库', effect: 'weapon', value: 1 }, { label: '掩护撤离', effect: 'squad', value: 25 },
  ] },
];

export const CHAPTERS = [
  { id: 'c1', name: '第一章：城市余烬', biome: 'city', goal: 650, unlock: 0 },
  { id: 'c2', name: '第二章：地铁深处', biome: 'subway', goal: 900, unlock: 1 },
  { id: 'c3', name: '第三章：赤色废土', biome: 'wasteland', goal: 1200, unlock: 2 },
  { id: 'c4', name: '第四章：零号实验室', biome: 'lab', goal: 1500, unlock: 3 },
  { id: 'c5', name: '第五章：终焉要塞', biome: 'fortress', goal: 1900, unlock: 4 },
];

export const BASE_BUILDINGS = {
  hospital: { name: '战地医院', description: '初始兵力 +4/级', baseCost: 120, maxLevel: 10 },
  arsenal: { name: '军械库', description: '初始伤害 +4%/级', baseCost: 150, maxLevel: 10 },
  vault: { name: '地下金库', description: '金币收益 +5%/级', baseCost: 130, maxLevel: 10 },
  training: { name: '训练场', description: '射速 +3%/级', baseCost: 140, maxLevel: 10 },
};

export const ARMORY_ITEMS = {
  fieldkit: { name: '战地急救箱', type: 'consumable', cost: 45, description: '下局开场额外获得 15 人。' },
  armorplate: { name: '复合装甲板', type: 'consumable', cost: 55, description: '下局开场获得 12 秒护盾。' },
  shotgun: { name: '霰弹枪蓝图', type: 'blueprint', cost: 220, description: '解锁霰弹枪作为初始武器。' },
  minigun: { name: '加特林蓝图', type: 'blueprint', cost: 420, description: '解锁加特林作为初始武器。' },
  amber: { name: '琥珀装甲涂层', type: 'cosmetic', cost: 180, description: '解锁金色小队装甲主题。' },
  crimson: { name: '猩红装甲涂层', type: 'cosmetic', cost: 180, description: '解锁红色小队装甲主题。' },
};

export const ACHIEVEMENTS = {
  first100: { name: '走出安全区', description: '单局到达 100 米', stat: 'bestDistance', target: 100, reward: 30 },
  killer500: { name: '清道夫', description: '累计击杀 500 名感染者', stat: 'totalKills', target: 500, reward: 80 },
  millionaire: { name: '军团时代', description: '单局兵力达到 1,000,000', stat: 'maxSquad', target: 1_000_000, reward: 250 },
  coin1000: { name: '废土银行家', description: '累计获得 1,000 金币', stat: 'totalCoins', target: 1000, reward: 120 },
  boss10: { name: '巨兽猎人', description: '累计击败 10 个 Boss', stat: 'bossKills', target: 10, reward: 180 },
};

export function dailySeed(date = new Date()) {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { key, seed: hash >>> 0 };
}

export function pickWithSeed(list, seed, offset = 0) {
  const x = Math.sin(seed + offset * 999) * 10000;
  return list[Math.floor((x - Math.floor(x)) * list.length)];
}
