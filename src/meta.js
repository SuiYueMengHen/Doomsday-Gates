import { BASE_BUILDINGS, dailySeed } from './content.js';

const STORAGE_KEY = 'dg_meta_v1';

export const UPGRADE_DEFS = {
  range: {
    label: '弹道延伸',
    code: 'RANGE',
    description: '所有武器射程 +12%',
    baseCost: 80,
    maxLevel: 12,
  },
  damage: {
    label: '高能弹药',
    code: 'DAMAGE',
    description: '所有伤害 +10%',
    baseCost: 110,
    maxLevel: 15,
  },
  fireRate: {
    label: '自动装填',
    code: 'FIRE RATE',
    description: '射击频率 +8%',
    baseCost: 100,
    maxLevel: 12,
  },
  magnet: {
    label: '磁力回收器',
    code: 'MAGNET',
    description: '金币拾取半径 +0.7m',
    baseCost: 70,
    maxLevel: 10,
  },
  startingSquad: {
    label: '先遣编制',
    code: 'SQUAD',
    description: '初始兵力 +5',
    baseCost: 140,
    maxLevel: 20,
  },
  coinBonus: {
    label: '战场回收',
    code: 'SALVAGE',
    description: '金币价值 +10%',
    baseCost: 90,
    maxLevel: 15,
  },
};

const defaultMeta = () => ({
  version: 2,
  coins: 0,
  upgrades: Object.fromEntries(Object.keys(UPGRADE_DEFS).map((key) => [key, 0])),
  settings: {
    muted: false,
    screenShake: true,
    quality: 'high',
  },
  classId: 'assault',
  formationId: 'balanced',
  selectedChapter: 'endless',
  unlockedChapter: 0,
  relics: [],
  inventory: { fieldkit: 0, armorplate: 0 },
  blueprints: ['rifle'],
  cosmetics: [],
  equippedCosmetic: 'default',
  base: Object.fromEntries(Object.keys(BASE_BUILDINGS).map((key) => [key, 0])),
  achievements: {},
  daily: { key: dailySeed().key, completed: false, best: 0 },
  tutorialDone: false,
  stats: { totalKills: 0, totalCoins: 0, bossKills: 0, bestDistance: 0, maxSquad: 0 },
  leaderboard: [],
});

export function loadMeta() {
  const defaults = defaultMeta();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...defaults,
      ...saved,
      upgrades: { ...defaults.upgrades, ...(saved.upgrades || {}) },
      settings: { ...defaults.settings, ...(saved.settings || {}) },
      inventory: { ...defaults.inventory, ...(saved.inventory || {}) },
      base: { ...defaults.base, ...(saved.base || {}) },
      achievements: { ...defaults.achievements, ...(saved.achievements || {}) },
      stats: { ...defaults.stats, ...(saved.stats || {}) },
      daily: saved.daily?.key === defaults.daily.key ? { ...defaults.daily, ...saved.daily } : defaults.daily,
      relics: Array.isArray(saved.relics) ? saved.relics : [],
      blueprints: Array.isArray(saved.blueprints) ? saved.blueprints : ['rifle'],
      cosmetics: Array.isArray(saved.cosmetics) ? saved.cosmetics : [],
      leaderboard: Array.isArray(saved.leaderboard) ? saved.leaderboard.slice(0, 20) : [],
    };
  } catch {
    return defaults;
  }
}

export function saveMeta(meta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export function upgradeCost(key, level) {
  const def = UPGRADE_DEFS[key];
  return Math.round(def.baseCost * Math.pow(1.62, level));
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return 'MAX';
  const n = Math.max(0, Math.floor(value));
  if (n < 10_000) return n.toLocaleString('zh-CN');
  const units = [
    [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
  ];
  const [scale, suffix] = units.find(([scale]) => n >= scale) || [1, ''];
  const scaled = n / scale;
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}${suffix}`;
}

export function addSquad(current, amount) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(current + amount)));
}
