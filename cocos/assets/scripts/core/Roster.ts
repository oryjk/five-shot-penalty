import type { DivisionInfo, KeeperProfile, PlayerProfile } from './Attributes';

export const MAX_LEVEL = 8;

export const DIVISIONS: readonly DivisionInfo[] = [
    {
        level: 1,
        name: '街头青训',
        badgeColor: '#9AA8B8',
        xpToPromote: 220,
        promoTarget: 3,
        baseMatchXp: 45,
        goalXp: 24,
    },
    {
        level: 2,
        name: '业余联赛',
        badgeColor: '#F49642',
        xpToPromote: 340,
        promoTarget: 3,
        baseMatchXp: 55,
        goalXp: 28,
    },
    {
        level: 3,
        name: '次级职业',
        badgeColor: '#F7D44C',
        xpToPromote: 480,
        promoTarget: 3,
        baseMatchXp: 65,
        goalXp: 32,
    },
    {
        level: 4,
        name: '顶级联赛',
        badgeColor: '#46E484',
        xpToPromote: 640,
        promoTarget: 3,
        baseMatchXp: 78,
        goalXp: 36,
    },
    {
        level: 5,
        name: '洲际杯赛',
        badgeColor: '#3BD2B9',
        xpToPromote: 820,
        promoTarget: 4,
        baseMatchXp: 90,
        goalXp: 42,
    },
    {
        level: 6,
        name: '冠军之夜',
        badgeColor: '#28E4FF',
        xpToPromote: 1050,
        promoTarget: 4,
        baseMatchXp: 105,
        goalXp: 48,
    },
    {
        level: 7,
        name: '巅峰决赛',
        badgeColor: '#C58BFF',
        xpToPromote: 1320,
        promoTarget: 4,
        baseMatchXp: 120,
        goalXp: 54,
    },
    {
        level: 8,
        name: '传奇殿堂',
        badgeColor: '#FF5C72',
        xpToPromote: 9999,
        promoTarget: 4,
        baseMatchXp: 140,
        goalXp: 60,
    },
];

export const PLAYERS: readonly PlayerProfile[] = [
    // Lv.1 街头青训
    {
        id: 'lin_chen',
        name: '林辰',
        shortName: '林辰',
        title: '青训全能前锋',
        position: 'CF',
        foot: 'R',
        number: 9,
        stars: 1,
        ovr: 63,
        unlockLevel: 1,
        jerseyPrimary: '#D64545',
        jerseyAccent: '#F5F5F0',
        stats: { finishing: 65, power: 64, curl: 60, composure: 64, deception: 62, weakFoot: 61 },
        skills: [],
    },
    {
        id: 'xu_hao',
        name: '许浩',
        shortName: '许浩',
        title: '灵巧左脚边锋',
        position: 'LWF',
        foot: 'L',
        number: 11,
        stars: 1,
        ovr: 64,
        unlockLevel: 1,
        jerseyPrimary: '#2563EB',
        jerseyAccent: '#DBEAFE',
        stats: { finishing: 63, power: 59, curl: 69, composure: 61, deception: 67, weakFoot: 56 },
        skills: [],
    },

    // Lv.2 业余联赛
    {
        id: 'diego_ruiz',
        name: '迪亚戈·鲁伊斯',
        shortName: '鲁伊斯',
        title: '草根重炮中锋',
        position: 'CF',
        foot: 'R',
        number: 19,
        stars: 2,
        ovr: 70,
        unlockLevel: 2,
        jerseyPrimary: '#EA580C',
        jerseyAccent: '#FFEDD5',
        stats: { finishing: 66, power: 79, curl: 61, composure: 68, deception: 63, weakFoot: 64 },
        skills: ['cannon'],
    },
    {
        id: 'kenji_sato',
        name: '佐藤健司',
        shortName: '佐藤健司',
        title: '细腻推射指挥官',
        position: 'AMF',
        foot: 'L',
        number: 10,
        stars: 2,
        ovr: 71,
        unlockLevel: 2,
        jerseyPrimary: '#1D4ED8',
        jerseyAccent: '#FDE047',
        stats: { finishing: 76, power: 64, curl: 73, composure: 72, deception: 74, weakFoot: 67 },
        skills: ['feint'],
    },

    // Lv.3 次级职业
    {
        id: 'marco_bellini',
        name: '马尔科·贝利尼',
        shortName: '贝利尼',
        title: '意式冷静点球手',
        position: 'SS',
        foot: 'R',
        number: 18,
        stars: 3,
        ovr: 76,
        unlockLevel: 3,
        jerseyPrimary: '#0284C7',
        jerseyAccent: '#F8FAFC',
        stats: { finishing: 79, power: 73, curl: 74, composure: 82, deception: 75, weakFoot: 72 },
        skills: ['clutch'],
    },
    {
        id: 'rafael_costa',
        name: '拉斐尔·科斯塔',
        shortName: '科斯塔',
        title: '桑巴弧线大师',
        position: 'RWF',
        foot: 'L',
        number: 7,
        stars: 3,
        ovr: 77,
        unlockLevel: 3,
        jerseyPrimary: '#EAB308',
        jerseyAccent: '#15803D',
        stats: { finishing: 75, power: 72, curl: 85, composure: 74, deception: 80, weakFoot: 68 },
        skills: ['banana'],
    },

    // Lv.4 顶级联赛
    {
        id: 'viktor_novak',
        name: '维克托·诺瓦克',
        shortName: '诺瓦克',
        title: '东欧重型锋霸',
        position: 'CF',
        foot: 'R',
        number: 9,
        stars: 3,
        ovr: 81,
        unlockLevel: 4,
        jerseyPrimary: '#B91C1C',
        jerseyAccent: '#FEF2F2',
        stats: { finishing: 80, power: 89, curl: 70, composure: 80, deception: 74, weakFoot: 78 },
        skills: ['cannon'],
    },
    {
        id: 'anton_panek',
        name: '安东·帕内克',
        shortName: '帕内克',
        title: '勺子艺术传人',
        position: 'AMF',
        foot: 'R',
        number: 8,
        stars: 4,
        ovr: 82,
        unlockLevel: 4,
        jerseyPrimary: '#7C3AED',
        jerseyAccent: '#EDE9FE',
        stats: { finishing: 83, power: 71, curl: 82, composure: 86, deception: 88, weakFoot: 79 },
        skills: ['panenka'],
    },

    // Lv.5 洲际杯赛
    {
        id: 'lucas_vermeer',
        name: '卢卡斯·费尔梅尔',
        shortName: '费尔梅尔',
        title: '双足死角机器',
        position: 'CF',
        foot: 'R',
        number: 14,
        stars: 4,
        ovr: 85,
        unlockLevel: 5,
        jerseyPrimary: '#F97316',
        jerseyAccent: '#1E293B',
        stats: { finishing: 89, power: 83, curl: 80, composure: 84, deception: 81, weakFoot: 91 },
        skills: ['corner'],
    },
    {
        id: 'mateo_silva',
        name: '马特奥·席尔瓦',
        shortName: '席尔瓦',
        title: '幻影节拍魔术师',
        position: 'RWF',
        foot: 'L',
        number: 10,
        stars: 4,
        ovr: 86,
        unlockLevel: 5,
        jerseyPrimary: '#0EA5E9',
        jerseyAccent: '#F8FAFC',
        stats: { finishing: 85, power: 78, curl: 91, composure: 84, deception: 91, weakFoot: 76 },
        skills: ['feint', 'banana'],
    },

    // Lv.6 冠军之夜
    {
        id: 'karl_brenner',
        name: '卡尔·布伦纳',
        shortName: '布伦纳',
        title: '日耳曼钢铁心脏',
        position: 'CF',
        foot: 'R',
        number: 9,
        stars: 4,
        ovr: 89,
        unlockLevel: 6,
        jerseyPrimary: '#E2E8F0',
        jerseyAccent: '#0F172A',
        stats: { finishing: 91, power: 88, curl: 81, composure: 94, deception: 84, weakFoot: 86 },
        skills: ['clutch', 'corner'],
    },
    {
        id: 'roberto_farias',
        name: '罗伯托·法里亚斯',
        shortName: '法里亚斯',
        title: '外脚背重炮传奇',
        position: 'LWF',
        foot: 'L',
        number: 6,
        stars: 5,
        ovr: 90,
        unlockLevel: 6,
        jerseyPrimary: '#FACC15',
        jerseyAccent: '#1D4ED8',
        stats: { finishing: 86, power: 96, curl: 93, composure: 87, deception: 83, weakFoot: 78 },
        skills: ['cannon', 'banana'],
    },

    // Lv.7 巅峰决赛
    {
        id: 'cristian_madeira',
        name: '克里斯·马德拉',
        shortName: '马德拉',
        title: '无解暴击战神',
        position: 'CF',
        foot: 'R',
        number: 7,
        stars: 5,
        ovr: 94,
        unlockLevel: 7,
        jerseyPrimary: '#DC2626',
        jerseyAccent: '#FBBF24',
        stats: { finishing: 94, power: 97, curl: 88, composure: 95, deception: 89, weakFoot: 92 },
        skills: ['cannon', 'clutch'],
    },
    {
        id: 'leo_lapa',
        name: '里奥·拉帕',
        shortName: '拉帕',
        title: '黄金左脚魔法师',
        position: 'RWF',
        foot: 'L',
        number: 10,
        stars: 5,
        ovr: 95,
        unlockLevel: 7,
        jerseyPrimary: '#38BDF8',
        jerseyAccent: '#FFFFFF',
        stats: { finishing: 96, power: 87, curl: 98, composure: 94, deception: 96, weakFoot: 84 },
        skills: ['banana', 'corner'],
    },

    // Lv.8 传奇殿堂
    {
        id: 'zined_royale',
        name: '齐内·罗亚尔',
        shortName: '罗亚尔',
        title: '决赛雕塑大师',
        position: 'AMF',
        foot: 'R',
        number: 5,
        stars: 5,
        ovr: 97,
        unlockLevel: 8,
        jerseyPrimary: '#1E3A8A',
        jerseyAccent: '#F8FAFC',
        stats: { finishing: 95, power: 90, curl: 95, composure: 99, deception: 97, weakFoot: 96 },
        skills: ['panenka', 'clutch'],
    },
    {
        id: 'pelegrino_oro',
        name: '贝利格里诺·奥罗',
        shortName: '奥罗',
        title: '殿堂永恒球王',
        position: 'SS',
        foot: 'R',
        number: 10,
        stars: 5,
        ovr: 99,
        unlockLevel: 8,
        jerseyPrimary: '#F59E0B',
        jerseyAccent: '#065F46',
        stats: { finishing: 99, power: 95, curl: 96, composure: 98, deception: 98, weakFoot: 97 },
        skills: ['corner', 'feint'],
    },
];

export const KEEPERS: readonly KeeperProfile[] = [
    {
        id: 'gk_lv1',
        level: 1,
        name: '张磊',
        title: '社区青训门将',
        ovr: 60,
        style: 'rookie',
        styleLabel: '新手反应型',
        weaknessHint: '弱点：黄金力度推射两侧角即可稳破',
        jerseyTint: '#FFF4E0',
        stats: { reflex: 58, reach: 60, anticipation: 56, intimidation: 50 },
    },
    {
        id: 'gk_lv2',
        level: 2,
        name: '米格尔·托雷斯',
        title: '业余联赛金手套',
        ovr: 68,
        style: 'balanced',
        styleLabel: '均衡防守型',
        weaknessHint: '弱点：避开中路，搓射或强力压死角',
        jerseyTint: '#E0F7FF',
        stats: { reflex: 68, reach: 67, anticipation: 66, intimidation: 60 },
    },
    {
        id: 'gk_lv3',
        level: 3,
        name: '汉斯·韦伯',
        title: '德乙门线铁闸',
        ovr: 75,
        style: 'anchor',
        styleLabel: '站桩稳健型',
        weaknessHint: '弱点：极少提前倒地(慎用勺子)，怕死角重炮与大弧线',
        jerseyTint: '#D8F5E3',
        stats: { reflex: 76, reach: 75, anticipation: 70, intimidation: 72 },
    },
    {
        id: 'gk_lv4',
        level: 4,
        name: '卢卡·莫雷蒂',
        title: '意甲赌徒飞侠',
        ovr: 81,
        style: 'gambler',
        styleLabel: '激进飞扑型',
        weaknessHint: '弱点：酷爱提前赌死角，怕变向假动作与中路勺子！',
        jerseyTint: '#FFE3EC',
        stats: { reflex: 79, reach: 83, anticipation: 84, intimidation: 76 },
    },
    {
        id: 'gk_lv5',
        level: 5,
        name: '蒂博·范德门',
        title: '洲际长臂门神',
        ovr: 86,
        style: 'balanced',
        styleLabel: '全能长臂型',
        weaknessHint: '弱点：臂展极大，需用香蕉球或顺逆足变化拉满死角',
        jerseyTint: '#E8E0FF',
        stats: { reflex: 85, reach: 90, anticipation: 83, intimidation: 82 },
    },
    {
        id: 'gk_lv6',
        level: 6,
        name: '埃米利亚诺·索萨',
        title: '欧冠读心专家',
        ovr: 90,
        style: 'reader',
        styleLabel: '读心记忆型',
        weaknessHint: '弱点：会记住你前几球方向！切忌连踢同侧，善用变向',
        jerseyTint: '#FFE5B4',
        stats: { reflex: 88, reach: 89, anticipation: 94, intimidation: 89 },
    },
    {
        id: 'gk_lv7',
        level: 7,
        name: '奥利弗·卡恩斯',
        title: '决赛狮王门神',
        ovr: 94,
        style: 'intimidator',
        styleLabel: '威慑压迫型',
        weaknessHint: '弱点：气场会干扰准星，需派高冷静/大心脏球员破局',
        jerseyTint: '#FFD0D0',
        stats: { reflex: 93, reach: 93, anticipation: 91, intimidation: 97 },
    },
    {
        id: 'gk_lv8',
        level: 8,
        name: '列夫·布冯尼',
        title: '传奇殿堂守护神',
        ovr: 97,
        style: 'legend',
        styleLabel: '传奇全知型',
        weaknessHint: '弱点：动态适应打法，唯有假动作 + 死角弧线/重炮可破',
        jerseyTint: '#D4FAFF',
        stats: { reflex: 97, reach: 96, anticipation: 97, intimidation: 96 },
    },
];

export function getDivision(level: number): DivisionInfo {
    const idx = Math.max(0, Math.min(DIVISIONS.length - 1, Math.floor(level) - 1));
    return DIVISIONS[idx];
}

export function getKeeperForLevel(level: number): KeeperProfile {
    const idx = Math.max(0, Math.min(KEEPERS.length - 1, Math.floor(level) - 1));
    return KEEPERS[idx];
}

export function getPlayerById(id: string): PlayerProfile {
    return PLAYERS.find(p => p.id === id) ?? PLAYERS[0];
}

export function getUnlockedPlayers(level: number): PlayerProfile[] {
    return PLAYERS.filter(p => p.unlockLevel <= level);
}

export function getLockedPlayers(level: number): PlayerProfile[] {
    return PLAYERS.filter(p => p.unlockLevel > level);
}

/** 推荐可供“单场传奇租借”钩子展示的未解锁高阶球星 */
export function getFeaturedLoanLegend(level: number): PlayerProfile {
    const locked = getLockedPlayers(level);
    if (locked.length === 0) return PLAYERS[PLAYERS.length - 1];
    // 优先展示比当前高 2~3 级的超级巨星（例如 Lv.1~5 展示 94~95 分巨星，视觉诱惑力最强）
    const preferred = locked.find(p => p.ovr >= 94) ?? locked[locked.length - 1];
    return preferred;
}

/** 根据已解锁球员生成推荐的 5 人点球大名单（按位置与特长排序：开局稳健 -> 弧线/重炮 -> 第5球大心脏） */
export function buildRecommendedSquad(level: number): string[] {
    const unlocked = getUnlockedPlayers(level).slice().sort((a, b) => b.ovr - a.ovr);
    if (unlocked.length === 0) return [PLAYERS[0].id, PLAYERS[0].id, PLAYERS[0].id, PLAYERS[0].id, PLAYERS[0].id];
    const topFive: PlayerProfile[] = [];
    for (let i = 0; i < 5; i++) {
        topFive.push(unlocked[i % unlocked.length]);
    }
    // 把冷静最高或带大心脏技能的放在第 5 球压轴
    topFive.sort((a, b) => {
        const scoreA = a.stats.composure + (a.skills.includes('clutch') ? 12 : 0);
        const scoreB = b.stats.composure + (b.skills.includes('clutch') ? 12 : 0);
        return scoreA - scoreB;
    });
    return topFive.map(p => p.id);
}
