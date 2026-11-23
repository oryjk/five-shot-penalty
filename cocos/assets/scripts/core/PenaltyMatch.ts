import type { KeeperProfile, PlayerProfile } from './Attributes';
import { pickScoutWeakSide, resolveShot, sideOfX } from './KeeperAI';
import type { Outcome, ResolvedShot, ShotSide } from './KeeperAI';
import type { MatchMode } from './Progression';
import { getDivision } from './Roster';
import type { Aim } from './ShotPhysics';

export const TOTAL_SHOTS = 5;
export const FEEDBACK_SECONDS = 1.05;

export type MatchStage = 'ready' | 'flight' | 'feedback' | 'var_offer' | 'complete';

export interface MatchConfig {
    readonly level: number;
    readonly mode: MatchMode;
    readonly lineup: readonly PlayerProfile[]; // 至少 5 名（可重复）
    readonly keeper: KeeperProfile;
    readonly loanedPlayerId?: string | null;
    readonly scoutIntelActive?: boolean;
    readonly newbieProtected?: boolean;
    readonly rng?: () => number;
}

export class PenaltyMatch {
    stage: MatchStage = 'ready';
    elapsed = 0;
    shot: ResolvedShot | null = null;
    varUsed = false;
    suddenDeath = false;
    wonPromotion = false;
    scoutWeakSide: -1 | 1 | null = null;
    scoutHintsRemaining = 0;

    private readonly config: MatchConfig;
    private readonly rng: () => number;
    private readonly _shots: ResolvedShot[] = [];
    private readonly _historySides: ShotSide[] = [];

    constructor(config: MatchConfig) {
        this.config = config;
        this.rng = config.rng ?? Math.random;
        if (config.scoutIntelActive) {
            this.scoutHintsRemaining = 2;
            this.scoutWeakSide = pickScoutWeakSide(config.keeper, [], this.rng);
        }
    }

    get level(): number { return this.config.level; }
    get mode(): MatchMode { return this.config.mode; }
    get keeper(): KeeperProfile { return this.config.keeper; }
    get loanedPlayerId(): string | null { return this.config.loanedPlayerId ?? null; }
    get scoutIntelActive(): boolean { return Boolean(this.config.scoutIntelActive); }
    get promoTarget(): number { return getDivision(this.config.level).promoTarget; }

    get shots(): readonly ResolvedShot[] { return this._shots; }
    get results(): readonly Outcome[] { return this._shots.map(s => s.outcome); }
    get historySides(): readonly ShotSide[] { return this._historySides; }

    /** 已完成的 5 球常规进球数 */
    get regulationGoals(): number {
        return this._shots.slice(0, TOTAL_SHOTS).filter(s => s.outcome === 'goal').length;
    }

    /** 含突然死亡在内的总进球数 */
    get goals(): number {
        return this._shots.filter(s => s.outcome === 'goal').length;
    }

    /** 当前是第几球（1..5，突然死亡为 6） */
    get currentShotNumber(): number {
        if (this.stage === 'complete') return this._shots.length;
        if (this.stage === 'flight') return this._shots.length + 1;
        if (this.stage === 'feedback' || this.stage === 'var_offer') return this._shots.length;
        return this._shots.length + 1;
    }

    /** 当前主罚球员（突然死亡默认派出第 5 位大心脏压轴球员） */
    get currentPlayer(): PlayerProfile {
        const index = Math.min(this.config.lineup.length - 1, Math.max(0, this.currentShotNumber - 1));
        return this.config.lineup[index];
    }

    /** 本球是否为高压赛点球（第 5 球、突然死亡、或晋级赛第 4~5 球） */
    get isClutchShot(): boolean {
        const num = this.currentShotNumber;
        if (this.suddenDeath || num >= TOTAL_SHOTS) return true;
        if (this.config.mode === 'promotion' && num >= 4) return true;
        return false;
    }

    get maxSpeedKmh(): number {
        return this._shots.reduce((best, s) => Math.max(best, s.speedKmh), 0);
    }

    kick(aim: Aim, readyTime: number): boolean {
        if (this.stage !== 'ready') return false;
        const player = this.currentPlayer;
        const weakHint = this.scoutHintsRemaining > 0 ? this.scoutWeakSide : null;
        this.shot = resolveShot({
            aim,
            player,
            keeper: this.config.keeper,
            readyTime,
            isClutchShot: this.isClutchShot,
            historySides: this._historySides,
            scoutWeakSide: weakHint,
            scoutWarmupBuff: this.scoutIntelActive,
            rng: this.rng,
        });
        this.elapsed = 0;
        this.stage = 'flight';
        return true;
    }

    advance(seconds: number): void {
        if (!this.shot || !Number.isFinite(seconds) || seconds <= 0) return;
        if (this.stage !== 'flight' && this.stage !== 'feedback') return;
        this.elapsed += seconds;

        if (this.stage === 'flight' && this.elapsed >= this.shot.duration) {
            this.elapsed -= this.shot.duration;
            this._shots.push(this.shot);
            this._historySides.push(sideOfX(this.shot.landingX));
            if (this.scoutHintsRemaining > 0) {
                this.scoutHintsRemaining -= 1;
            }
            this.stage = 'feedback';
        }

        if (this.stage === 'feedback' && this.elapsed >= FEEDBACK_SECONDS) {
            this.elapsed = 0;
            if (this.shouldOfferVar(this.shot)) {
                this.stage = 'var_offer';
                return;
            }
            this.proceedAfterShot();
        }
    }

    /** S1 强钩子触发判断：只在关键时刻丢球时弹出 VAR 重罚，每局最多 1 次 */
    private shouldOfferVar(lastShot: ResolvedShot): boolean {
        if (this.varUsed || this.config.newbieProtected) return false;
        if (lastShot.outcome === 'goal') return false;

        const taken = this._shots.length;
        // 1. 突然死亡丢球：100% 触发最高情绪峰值！
        if (this.suddenDeath) return true;

        // 2. 晋级赛：第 4/5 球丢球，或丢完这球后剩下球全进也刚好卡在悬崖边
        if (this.config.mode === 'promotion') {
            const remaining = TOTAL_SHOTS - taken;
            const goalsSoFar = this.regulationGoals;
            if (taken >= 4 && goalsSoFar < this.promoTarget) return true;
            if (goalsSoFar + remaining < this.promoTarget) return true;
        }

        // 3. 常规/每日赛：差 1 球满贯（前几球全进）或第 5 球刚好冲高分失手
        const priorGoals = this.regulationGoals;
        if (taken >= 4 && priorGoals >= taken - 1) return true;
        if (taken === TOTAL_SHOTS && priorGoals === this.promoTarget - 1) return true;

        return false;
    }

    /** 玩家观看 S1 激励视频后：VAR 判定重罚本球 */
    acceptVarMulligan(): boolean {
        if (this.stage !== 'var_offer' || this.varUsed) return false;
        this.varUsed = true;
        this._shots.pop();
        this._historySides.pop();
        this.shot = null;
        this.elapsed = 0;
        this.stage = 'ready';
        if (this.scoutIntelActive && this.scoutHintsRemaining > 0) {
            this.scoutWeakSide = pickScoutWeakSide(this.config.keeper, this._historySides, this.rng);
        } else {
            this.scoutWeakSide = null;
        }
        return true;
    }

    /** 玩家放弃 VAR 重罚，接受当前结果继续 */
    declineVarMulligan(): void {
        if (this.stage !== 'var_offer') return;
        this.proceedAfterShot();
    }

    private proceedAfterShot(): void {
        const taken = this._shots.length;

        // 若正处于突然死亡加赛：1 球定胜负！
        if (this.suddenDeath) {
            const sdShot = this._shots[this._shots.length - 1];
            this.wonPromotion = sdShot?.outcome === 'goal';
            this.stage = 'complete';
            return;
        }

        if (taken < TOTAL_SHOTS) {
            this.stage = 'ready';
            this.shot = null;
            this.scoutWeakSide = this.scoutHintsRemaining > 0
                ? pickScoutWeakSide(this.config.keeper, this._historySides, this.rng)
                : null;
            return;
        }

        // 5 球常规结束
        const regGoals = this.regulationGoals;
        if (this.config.mode === 'promotion') {
            if (regGoals >= this.promoTarget) {
                this.wonPromotion = true;
                this.stage = 'complete';
                return;
            }
            if (regGoals === this.promoTarget - 1) {
                // 刚好差 1 球平线 → 触发刺激的 1 球突然死亡加赛！
                this.suddenDeath = true;
                this.stage = 'ready';
                this.shot = null;
                this.scoutWeakSide = null;
                return;
            }
            this.wonPromotion = false;
            this.stage = 'complete';
            return;
        }

        this.stage = 'complete';
    }
}
