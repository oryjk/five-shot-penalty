import { clamp } from './Attributes';
import type { PlayerProfile } from './Attributes';
import type { ResolvedShot } from './KeeperAI';
import {
    buildRecommendedSquad,
    getDivision,
    getPlayerById,
    getUnlockedPlayers,
    MAX_LEVEL,
    PLAYERS,
} from './Roster';

export type LineupMode = 'squad' | 'solo';
export type MatchMode = 'career' | 'promotion' | 'daily';

export interface PlayerProgress {
    level: number;
    xp: number;
    promoReady: boolean;
    totalMatches: number;
    totalShots: number;
    totalGoals: number;
    bestRoundGoals: number;
    topSpeedKmh: number;
    panenkaGoals: number;
    topBinsGoals: number;
    winStreak: number;
    lineupMode: LineupMode;
    squadIds: string[];     // 长度为 5 的主罚名单
    soloPlayerId: string;   // 单人包办模式主力
    dailyDate: string;      // YYYY-MM-DD
    dailyBestGoals: number;
    dailyTriesUsed: number;
    muted: boolean;
}

export interface MatchXpBreakdown {
    readonly baseXp: number;
    readonly goalXp: number;
    readonly styleBonusXp: number;
    readonly perfectBonusXp: number;
    readonly totalXp: number;
    readonly highlights: readonly string[];
}

export interface SettlementResult {
    readonly breakdown: MatchXpBreakdown;
    readonly promoted: boolean;
    readonly newLevel: number;
    readonly newlyUnlocked: readonly PlayerProfile[];
    readonly triggeredPromoReady: boolean;
    readonly wouldTriggerPromoIfDoubled: boolean;
    readonly isEligibleForDoubleXp: boolean;
    readonly isEligibleForScoutLegendHook: boolean;
}

export function todayKey(now = new Date()): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function createDefaultProgress(now = new Date()): PlayerProgress {
    const squad = buildRecommendedSquad(1);
    return {
        level: 1,
        xp: 0,
        promoReady: false,
        totalMatches: 0,
        totalShots: 0,
        totalGoals: 0,
        bestRoundGoals: 0,
        topSpeedKmh: 0,
        panenkaGoals: 0,
        topBinsGoals: 0,
        winStreak: 0,
        lineupMode: 'squad',
        squadIds: squad,
        soloPlayerId: squad[0],
        dailyDate: todayKey(now),
        dailyBestGoals: 0,
        dailyTriesUsed: 0,
        muted: false,
    };
}

export function sanitizeProgress(raw: Partial<PlayerProgress> | null | undefined, now = new Date()): PlayerProgress {
    const base = createDefaultProgress(now);
    if (!raw || typeof raw !== 'object') return base;
    const level = clamp(Math.floor(Number(raw.level) || 1), 1, MAX_LEVEL);
    const unlockedIds = new Set(getUnlockedPlayers(level).map(p => p.id));
    const fallbackSquad = buildRecommendedSquad(level);

    const squadIds = Array.isArray(raw.squadIds) && raw.squadIds.length === 5
        ? raw.squadIds.map((id, i) => (typeof id === 'string' && unlockedIds.has(id) ? id : fallbackSquad[i]))
        : fallbackSquad;

    const soloPlayerId = typeof raw.soloPlayerId === 'string' && unlockedIds.has(raw.soloPlayerId)
        ? raw.soloPlayerId
        : fallbackSquad[4];

    const division = getDivision(level);
    const xp = clamp(Math.floor(Number(raw.xp) || 0), 0, level >= MAX_LEVEL ? 999999 : division.xpToPromote);
    const promoReady = level < MAX_LEVEL && (Boolean(raw.promoReady) || xp >= division.xpToPromote);

    const today = todayKey(now);
    const sameDay = raw.dailyDate === today;

    return {
        level,
        xp,
        promoReady,
        totalMatches: Math.max(0, Math.floor(Number(raw.totalMatches) || 0)),
        totalShots: Math.max(0, Math.floor(Number(raw.totalShots) || 0)),
        totalGoals: Math.max(0, Math.floor(Number(raw.totalGoals) || 0)),
        bestRoundGoals: clamp(Math.floor(Number(raw.bestRoundGoals) || 0), 0, 5),
        topSpeedKmh: Math.max(0, Math.floor(Number(raw.topSpeedKmh) || 0)),
        panenkaGoals: Math.max(0, Math.floor(Number(raw.panenkaGoals) || 0)),
        topBinsGoals: Math.max(0, Math.floor(Number(raw.topBinsGoals) || 0)),
        winStreak: Math.max(0, Math.floor(Number(raw.winStreak) || 0)),
        lineupMode: raw.lineupMode === 'solo' ? 'solo' : 'squad',
        squadIds,
        soloPlayerId,
        dailyDate: today,
        dailyBestGoals: sameDay ? clamp(Math.floor(Number(raw.dailyBestGoals) || 0), 0, 5) : 0,
        dailyTriesUsed: sameDay ? Math.max(0, Math.floor(Number(raw.dailyTriesUsed) || 0)) : 0,
        muted: Boolean(raw.muted),
    };
}

export function isNewbieProtected(progress: PlayerProgress): boolean {
    return progress.totalMatches < 1;
}

export function isPlayerUnlocked(progress: PlayerProgress, playerId: string): boolean {
    return getPlayerById(playerId).unlockLevel <= progress.level;
}

export function getMatchLineup(progress: PlayerProgress, loanedPlayerId: string | null = null): PlayerProfile[] {
    if (loanedPlayerId) {
        const legend = getPlayerById(loanedPlayerId);
        if (progress.lineupMode === 'solo') {
            return [legend, legend, legend, legend, legend];
        }
        // 5人阵容模式下，租借传奇担任 1/3/5 号核心位，让玩家整局充分爽到顶级手感
        const base = progress.squadIds.map(id => getPlayerById(id));
        return [legend, base[1], legend, base[3], legend];
    }
    if (progress.lineupMode === 'solo') {
        const solo = getPlayerById(progress.soloPlayerId);
        return [solo, solo, solo, solo, solo];
    }
    return progress.squadIds.map(id => getPlayerById(id));
}

export function calculateMatchXp(
    level: number,
    shots: readonly ResolvedShot[],
    mode: MatchMode,
    wonPromotion: boolean
): MatchXpBreakdown {
    const division = getDivision(level);
    const goals = shots.filter(s => s.outcome === 'goal').length;
    const baseXp = division.baseMatchXp;
    const goalXp = goals * division.goalXp;

    let styleBonusXp = 0;
    const highlights: string[] = [];
    let topBinsCount = 0;
    let panenkaCount = 0;
    let bananaCount = 0;
    let fooledCount = 0;

    for (const s of shots) {
        if (s.outcome !== 'goal') continue;
        if (s.verdictTag === 'panenka_goal') {
            panenkaCount++;
            styleBonusXp += 28;
        } else if (s.isTopBins || s.verdictTag === 'post_in') {
            topBinsCount++;
            styleBonusXp += 22;
        } else if (s.verdictTag === 'banana_goal') {
            bananaCount++;
            styleBonusXp += 18;
        } else if (s.fooledKeeper) {
            fooledCount++;
            styleBonusXp += 14;
        }
    }

    if (panenkaCount > 0) highlights.push(`勺子破门×${panenkaCount}`);
    if (topBinsCount > 0) highlights.push(`死角球×${topBinsCount}`);
    if (bananaCount > 0) highlights.push(`香蕉球×${bananaCount}`);
    if (fooledCount > 0) highlights.push(`骗倒门将×${fooledCount}`);

    const regulationGoals = shots.slice(0, 5).filter(s => s.outcome === 'goal').length;
    const perfectBonusXp = regulationGoals === 5 ? Math.round(division.goalXp * 2.5) : 0;
    if (perfectBonusXp > 0) highlights.unshift('5/5 满贯翻倍奖励');

    let modeMult = 1;
    if (mode === 'daily') modeMult = 1.25;
    else if (wonPromotion) modeMult = 1.2;

    const totalXp = Math.round((baseXp + goalXp + styleBonusXp + perfectBonusXp) * modeMult);
    return { baseXp, goalXp, styleBonusXp, perfectBonusXp, totalXp, highlights };
}

/** 结算一局比赛并更新玩家档案 */
export function settleMatch(
    progress: PlayerProgress,
    shots: readonly ResolvedShot[],
    mode: MatchMode,
    wonPromotion: boolean,
    now = new Date()
): SettlementResult {
    const prevLevel = progress.level;
    const division = getDivision(prevLevel);
    const regulationGoals = shots.slice(0, 5).filter(s => s.outcome === 'goal').length;
    const allGoals = shots.filter(s => s.outcome === 'goal').length;

    const breakdown = calculateMatchXp(prevLevel, shots, mode, wonPromotion);

    progress.totalMatches += 1;
    progress.totalShots += shots.length;
    progress.totalGoals += allGoals;
    if (regulationGoals > progress.bestRoundGoals) progress.bestRoundGoals = regulationGoals;

    for (const s of shots) {
        if (s.speedKmh > progress.topSpeedKmh) progress.topSpeedKmh = s.speedKmh;
        if (s.outcome === 'goal' && s.verdictTag === 'panenka_goal') progress.panenkaGoals += 1;
        if (s.outcome === 'goal' && (s.isTopBins || s.verdictTag === 'post_in')) progress.topBinsGoals += 1;
    }

    if (regulationGoals >= division.promoTarget || wonPromotion) {
        progress.winStreak += 1;
    } else {
        progress.winStreak = 0;
    }

    if (mode === 'daily') {
        const today = todayKey(now);
        if (progress.dailyDate !== today) {
            progress.dailyDate = today;
            progress.dailyBestGoals = 0;
            progress.dailyTriesUsed = 0;
        }
        progress.dailyTriesUsed += 1;
        if (regulationGoals > progress.dailyBestGoals) progress.dailyBestGoals = regulationGoals;
    }

    let promoted = false;
    let newlyUnlocked: PlayerProfile[] = [];
    let triggeredPromoReady = false;
    let wouldTriggerPromoIfDoubled = false;

    if (mode === 'promotion' && wonPromotion && prevLevel < MAX_LEVEL) {
        promoted = true;
        progress.level = prevLevel + 1;
        progress.xp = 0;
        progress.promoReady = false;
        newlyUnlocked = PLAYERS.filter(p => p.unlockLevel === progress.level);
        // 升级后自动优化推荐阵容，让玩家立刻体验到新球员
        const nextRecommended = buildRecommendedSquad(progress.level);
        progress.squadIds = nextRecommended;
        progress.soloPlayerId = newlyUnlocked[newlyUnlocked.length - 1]?.id ?? nextRecommended[4];
    } else if (prevLevel < MAX_LEVEL) {
        const wasPromoReady = progress.promoReady;
        // 5/5 完美大满贯直接补满当前段位经验，立刻触发晋级战，避免卡在 337/340 这种尴尬体验！
        if (regulationGoals === 5) {
            progress.xp = division.xpToPromote;
        } else {
            progress.xp = Math.min(division.xpToPromote, progress.xp + breakdown.totalXp);
        }
        if (progress.xp >= division.xpToPromote) {
            progress.promoReady = true;
            triggeredPromoReady = !wasPromoReady;
        } else if (progress.xp + breakdown.totalXp >= division.xpToPromote) {
            wouldTriggerPromoIfDoubled = true;
        }
    } else {
        // Lv.8 传奇殿堂累计声望
        progress.xp += breakdown.totalXp;
    }

    const remainingToPromo = prevLevel < MAX_LEVEL ? Math.max(0, division.xpToPromote - progress.xp) : 999;

    // S3 双倍 XP 钩子：只在尚未拥有晋级资格且翻倍能真正省下整场努力时展示
    const isEligibleForDoubleXp = !isNewbieProtected(progress)
        && !promoted
        && !progress.promoReady
        && remainingToPromo >= Math.max(45, breakdown.totalXp * 0.35)
        && (regulationGoals >= 3 || wouldTriggerPromoIfDoubled || mode === 'daily');

    // 破局租借钩子：绝不在“已拥有晋级资格 / 刚满贯 / 刚晋级”时打扰玩家！
    // 只在晋级赛失利或低分局（<=2球被门将压制）时雪中送炭推荐 95+ 传奇 2 场破局！
    const isEligibleForScoutLegendHook = !isNewbieProtected(progress)
        && progress.level < MAX_LEVEL
        && !promoted
        && !progress.promoReady
        && !isEligibleForDoubleXp
        && ((mode === 'promotion' && !wonPromotion) || regulationGoals <= 2);

    return {
        breakdown,
        promoted,
        newLevel: progress.level,
        newlyUnlocked,
        triggeredPromoReady,
        wouldTriggerPromoIfDoubled,
        isEligibleForDoubleXp,
        isEligibleForScoutLegendHook,
    };
}

/** 玩家观看 S3 经验翻倍激励视频后补发等额 XP */
export function applyDoubleXpReward(progress: PlayerProgress, extraXp: number): {
    triggeredPromoReady: boolean;
} {
    if (progress.level >= MAX_LEVEL) {
        progress.xp += extraXp;
        return { triggeredPromoReady: false };
    }
    const division = getDivision(progress.level);
    const wasReady = progress.promoReady;
    progress.xp = Math.min(division.xpToPromote, progress.xp + extraXp);
    if (progress.xp >= division.xpToPromote) {
        progress.promoReady = true;
    }
    return { triggeredPromoReady: !wasReady && progress.promoReady };
}

export function canPlayFreeDaily(progress: PlayerProgress, now = new Date()): boolean {
    if (progress.dailyDate !== todayKey(now)) return true;
    return progress.dailyTriesUsed < 1;
}

export function canAdRetryDaily(progress: PlayerProgress, now = new Date()): boolean {
    if (progress.dailyDate !== todayKey(now)) return false;
    return progress.dailyTriesUsed >= 1 && progress.dailyTriesUsed < 4;
}
