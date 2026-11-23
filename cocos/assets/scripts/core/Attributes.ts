export type Foot = 'L' | 'R';
export type Position = 'CF' | 'SS' | 'AMF' | 'LWF' | 'RWF';

export type SkillId =
    | 'cannon'
    | 'banana'
    | 'clutch'
    | 'panenka'
    | 'feint'
    | 'corner';

export interface SkillDefinition {
    readonly id: SkillId;
    readonly name: string;
    readonly shortName: string;
    readonly description: string;
    readonly badgeColor: string;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
    cannon: {
        id: 'cannon',
        name: '重炮手',
        shortName: '重炮',
        description: '强力与红区打飞惩罚降低 35%，出球速度额外提升',
        badgeColor: '#FF6B5B',
    },
    banana: {
        id: 'banana',
        name: '弧线魔法师',
        shortName: '弧线',
        description: '搓射弧线幅度 +40%，显著干扰门将落点初判',
        badgeColor: '#38D9FF',
    },
    clutch: {
        id: 'clutch',
        name: '大心脏',
        shortName: '心脏',
        description: '第 5 球/突然死亡/晋级赛无视威慑，散布缩小 20%',
        badgeColor: '#F5C445',
    },
    panenka: {
        id: 'panenka',
        name: '勺子艺术家',
        shortName: '勺子',
        description: '轻挑中路踢出精准下坠吊射，骗倒门将经验加成',
        badgeColor: '#C58BFF',
    },
    feint: {
        id: 'feint',
        name: '节奏大师',
        shortName: '节奏',
        description: '变向滑动与停顿假动作更容易晃倒门将重心',
        badgeColor: '#4EE38A',
    },
    corner: {
        id: 'corner',
        name: '死角猎手',
        shortName: '死角',
        description: '瞄准贴近门柱与上角时，散布圆额外收敛 18%',
        badgeColor: '#FF9E44',
    },
};

export interface PlayerStats {
    readonly finishing: number;   // FIN 射门精度
    readonly power: number;       // KPW 脚下力量
    readonly curl: number;        // CRL 弧线控制
    readonly composure: number;   // CMP 冷静抗压
    readonly deception: number;   // DEC 欺骗技巧
    readonly weakFoot: number;    // WKF 逆足能力
}

export const STAT_KEYS: readonly (keyof PlayerStats)[] = [
    'finishing', 'power', 'curl', 'composure', 'deception', 'weakFoot',
];

export const STAT_LABELS: Record<keyof PlayerStats, { code: string; name: string }> = {
    finishing: { code: 'FIN', name: '射门精度' },
    power: { code: 'KPW', name: '脚下力量' },
    curl: { code: 'CRL', name: '弧线控制' },
    composure: { code: 'CMP', name: '冷静抗压' },
    deception: { code: 'DEC', name: '欺骗技巧' },
    weakFoot: { code: 'WKF', name: '逆足能力' },
};

export interface PlayerProfile {
    readonly id: string;
    readonly name: string;
    readonly shortName: string;
    readonly title: string;
    readonly position: Position;
    readonly foot: Foot;
    readonly number: number;
    readonly stars: 1 | 2 | 3 | 4 | 5;
    readonly ovr: number;
    readonly unlockLevel: number;
    readonly jerseyPrimary: string;
    readonly jerseyAccent: string;
    readonly stats: PlayerStats;
    readonly skills: readonly SkillId[];
}

export type KeeperStyle =
    | 'rookie'
    | 'balanced'
    | 'anchor'
    | 'gambler'
    | 'reader'
    | 'intimidator'
    | 'legend';

export interface KeeperStats {
    readonly reflex: number;        // 扑救反应
    readonly reach: number;         // 覆盖臂展
    readonly anticipation: number;  // 预判读招
    readonly intimidation: number;  // 门线威慑
}

export const KEEPER_STAT_LABELS: Record<keyof KeeperStats, string> = {
    reflex: '扑救反应',
    reach: '覆盖臂展',
    anticipation: '预判读招',
    intimidation: '门线威慑',
};

export interface KeeperProfile {
    readonly id: string;
    readonly level: number;
    readonly name: string;
    readonly title: string;
    readonly ovr: number;
    readonly style: KeeperStyle;
    readonly styleLabel: string;
    readonly weaknessHint: string;
    readonly jerseyTint: string;
    readonly stats: KeeperStats;
}

export interface DivisionInfo {
    readonly level: number;
    readonly name: string;
    readonly badgeColor: string;
    readonly xpToPromote: number;
    readonly promoTarget: number;
    readonly baseMatchXp: number;
    readonly goalXp: number;
}

/**
 * 经典实况足球（PES / eFootball）能力值色阶：
 * 95-99 传奇红金 / 90-94 顶级青蓝 / 80-89 球星翠绿 / 75-79 主力明黄 / 65-74 轮换橙色 / <65 新秀浅灰
 */
export function ratingColorHex(value: number): string {
    if (value >= 95) return '#FF5C72';
    if (value >= 90) return '#28E4FF';
    if (value >= 80) return '#46E484';
    if (value >= 75) return '#F7D44C';
    if (value >= 65) return '#F49642';
    return '#9AA8B8';
}

export function starText(stars: number): string {
    return '★'.repeat(Math.max(1, Math.min(5, Math.round(stars))));
}

export function hasSkill(player: PlayerProfile, skill: SkillId): boolean {
    return player.skills.includes(skill);
}

export const clamp = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));

export const lerp = (from: number, to: number, t: number): number =>
    from + (to - from) * t;

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
