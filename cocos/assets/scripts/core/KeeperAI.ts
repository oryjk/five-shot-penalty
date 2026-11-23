import { clamp, hasSkill, lerp } from './Attributes';
import type { KeeperProfile, PlayerProfile } from './Attributes';
import {
    computeBallKinematics,
    computeSpread,
    CROSSBAR_HEIGHT,
    evaluateGoalFrame,
    GOAL_HALF_WIDTH,
    sampleTruncatedGaussian,
} from './ShotPhysics';
import type { Aim, SpreadEnvelope } from './ShotPhysics';

export type Outcome = 'goal' | 'save' | 'miss';
export type ShotSide = -1 | 0 | 1;
export type ContactType = 'net' | 'post_in' | 'glove' | 'post_out' | 'sky' | 'grass';

export type ShotVerdictTag =
    | 'top_bins'
    | 'panenka_goal'
    | 'fooled_keeper'
    | 'banana_goal'
    | 'post_in'
    | 'power_blast'
    | 'clean_goal'
    | 'saved_read'
    | 'saved_slow'
    | 'saved_reflex'
    | 'saved_panenka'
    | 'miss_sky'
    | 'miss_post'
    | 'miss_weakfoot'
    | 'miss_wide';

export interface ResolvedShot {
    readonly aim: Aim;
    readonly spread: SpreadEnvelope;
    readonly landingX: number;       // 球过门线时的真实横坐标 (m)
    readonly landingY: number;       // 球过门线时的真实高度 (m)
    readonly curveShift: number;     // 弧线总横向偏移 (m)
    readonly speedKmh: number;
    readonly duration: number;
    readonly startX: number;         // 门将初始站位 X (m)
    readonly diveX: number;          // 门将目标扑救 X (m)
    readonly contactX: number;       // 球过门线瞬间门将到达 X (m)
    readonly contactY: number;       // 门将扑救手部高度 Y (m)
    readonly reactionDelay: number;  // 门将实际起动延迟 (s)
    readonly keeperGuessedRight: boolean;
    readonly fooledKeeper: boolean;
    readonly stayedCenter: boolean;
    readonly contact: ContactType;
    readonly outcome: Outcome;
    readonly verdictTag: ShotVerdictTag;
    readonly verdictTitle: string;
    readonly verdictSubtitle: string;
    readonly isTopBins: boolean;
}

export interface ResolveShotOptions {
    readonly aim: Aim;
    readonly player: PlayerProfile;
    readonly keeper: KeeperProfile;
    readonly readyTime: number;
    readonly isClutchShot: boolean;
    readonly historySides: readonly ShotSide[];
    readonly scoutWeakSide?: -1 | 1 | null;
    readonly scoutWarmupBuff?: boolean;
    readonly rng?: () => number;
}

export function sideOfX(x: number): ShotSide {
    if (x < -0.95) return -1;
    if (x > 0.95) return 1;
    return 0;
}

/** 门将赛前门线重心微移（更真实克制，不再机械大摆锤） */
export function keeperReadyPosition(readyTime: number, keeper: KeeperProfile, scoutWeakSide?: -1 | 1 | null): number {
    const baseAmp = keeper.style === 'gambler' ? 0.58 : keeper.style === 'anchor' ? 0.24 : 0.42;
    const freq = keeper.style === 'gambler' ? 1.85 : 1.25;
    // 若存在球探弱侧提示，门将重心会略偏向另一侧，暗示弱侧空档
    const bias = scoutWeakSide ? -scoutWeakSide * 0.28 : 0;
    return clamp(bias + Math.sin(readyTime * freq) * baseAmp, -0.85, 0.85);
}

/** 为球探情报生成门将当前球可能留出的弱侧 */
export function pickScoutWeakSide(keeper: KeeperProfile, historySides: readonly ShotSide[], rng: () => number): -1 | 1 {
    if (historySides.length >= 1) {
        const last = historySides[historySides.length - 1];
        if (last !== 0 && (keeper.style === 'reader' || keeper.style === 'legend')) {
            // 读心门将会提防你刚打过的一侧，所以另一侧是弱侧
            return (last === -1 ? 1 : -1);
        }
    }
    return rng() < 0.5 ? -1 : 1;
}

interface KeeperPlan {
    readonly diveSide: ShotSide;     // -1 扑左, 0 站中, 1 扑右
    readonly committedEarly: boolean;
    readonly fooled: boolean;
    readonly readHistory: boolean;
}

function decideKeeperPlan(
    aim: Aim,
    actualSide: ShotSide,
    player: PlayerProfile,
    keeper: KeeperProfile,
    historySides: readonly ShotSide[],
    scoutWeakSide: -1 | 1 | null,
    rng: () => number
): KeeperPlan {
    const antNorm = clamp((keeper.stats.anticipation - 50) / 49, 0, 1);
    const decNorm = clamp((player.stats.deception - 55) / 44, 0, 1);
    const hasFeintSkill = hasSkill(player, 'feint');

    // 计算玩家最近是否重复打同一侧（供 reader / legend 门将记忆惩罚）
    let repeatedSide: ShotSide = 0;
    let repeatCount = 0;
    if (historySides.length > 0) {
        const last = historySides[historySides.length - 1];
        if (last !== 0) {
            repeatedSide = last;
            for (let i = historySides.length - 1; i >= 0; i--) {
                if (historySides[i] === last) repeatCount++;
                else break;
            }
        }
    }

    // 1. 决定门将是否选择“站桩等反应（stay center）”
    let stayCenterProb = 0.24;
    if (keeper.style === 'anchor') stayCenterProb = 0.56;
    else if (keeper.style === 'gambler') stayCenterProb = 0.08;
    else if (keeper.style === 'rookie') stayCenterProb = 0.30;
    else if (keeper.style === 'reader') stayCenterProb = 0.18;
    else if (keeper.style === 'intimidator') stayCenterProb = 0.26;
    else if (keeper.style === 'legend') stayCenterProb = 0.24;

    // 玩家做出了强烈假动作变向，会显著勾引门将提前倒地
    const feintPull = aim.feintScore * (hasFeintSkill ? 0.36 : 0.22) + decNorm * 0.08;
    stayCenterProb = clamp(stayCenterProb - feintPull, 0.04, 0.65);

    if (rng() < stayCenterProb) {
        return { diveSide: 0, committedEarly: false, fooled: false, readHistory: false };
    }

    // 2. 门将决定提前赌哪一边（左 or 右）
    // 如果玩家利用球探情报攻打了门将弱侧，门将大概率被引导向另一侧
    if (scoutWeakSide && actualSide === scoutWeakSide && rng() < 0.62) {
        const wrongSide = (scoutWeakSide === -1 ? 1 : -1) as ShotSide;
        return { diveSide: wrongSide, committedEarly: true, fooled: true, readHistory: false };
    }

    // 如果有强变向假动作，且前半段朝反侧晃动，高欺骗球员极大概率把门将骗反！
    if (aim.feintScore >= 0.28 && actualSide !== 0) {
        const foolProb = clamp(
            0.34 + aim.feintScore * 0.42 + decNorm * 0.22 + (hasFeintSkill ? 0.16 : 0) - antNorm * 0.24,
            0.18,
            0.88
        );
        if (rng() < foolProb) {
            const wrongSide = (actualSide === -1 ? 1 : -1) as ShotSide;
            return { diveSide: wrongSide, committedEarly: true, fooled: true, readHistory: false };
        }
    }

    // 读心记忆型门将：如果你连打同侧，他会强行预判那一侧！
    if ((keeper.style === 'reader' || keeper.style === 'legend') && repeatCount >= 1) {
        const memoryProb = clamp(
            (keeper.style === 'reader' ? 0.46 : 0.38) + repeatCount * 0.18 - decNorm * 0.16,
            0.22,
            0.84
        );
        if (rng() < memoryProb) {
            const guessedCorrect = repeatedSide === actualSide;
            return {
                diveSide: repeatedSide,
                committedEarly: true,
                fooled: !guessedCorrect && actualSide !== 0,
                readHistory: guessedCorrect,
            };
        }
    }

    // 常规预判：门将试图从助跑/站姿猜出左右侧（受 anticipation vs deception 博弈影响）
    let correctGuessProb = lerp(0.42, 0.70, antNorm) - lerp(0, 0.22, decNorm);
    if (keeper.style === 'gambler') correctGuessProb += 0.05;
    if (keeper.style === 'rookie') correctGuessProb -= 0.06;
    // 勺子中路时，只要门将没选 stayCenter，就必然提前扑向一侧（勺子封神时刻！）
    if (aim.isPanenka) {
        const diveSide: ShotSide = rng() < 0.5 ? -1 : 1;
        return { diveSide, committedEarly: true, fooled: true, readHistory: false };
    }

    correctGuessProb = clamp(correctGuessProb, 0.24, 0.74);
    if (actualSide === 0) {
        // 球员瞄准中路，非站桩门将有较高概率提前扑边漏出中路，但也可能小幅移动
        const diveSide: ShotSide = rng() < 0.5 ? -1 : 1;
        return { diveSide, committedEarly: true, fooled: false, readHistory: false };
    }

    const guessedRight = rng() < correctGuessProb;
    const diveSide = (guessedRight ? actualSide : -actualSide) as ShotSide;
    return {
        diveSide,
        committedEarly: true,
        fooled: !guessedRight,
        readHistory: false,
    };
}

/**
 * 完整解算一脚点球：散布采样 -> 门框判定 -> 门将三阶段扑救 -> 细腻复盘文案。
 */
export function resolveShot(options: ResolveShotOptions): ResolvedShot {
    const {
        aim,
        player,
        keeper,
        readyTime,
        isClutchShot,
        historySides,
        scoutWeakSide = null,
        scoutWarmupBuff = false,
        rng = Math.random,
    } = options;

    const spread = computeSpread(aim, { player, keeper, isClutchShot, scoutWarmupBuff });
    const { speedKmh, duration, curveShift } = computeBallKinematics(aim, player);

    // 1. 真实落点采样（瞄准点 + 弧线位移 + 散布偏移 + 红区过载上扬）
    const noiseX = sampleTruncatedGaussian(rng) * spread.radiusX;
    const noiseY = sampleTruncatedGaussian(rng) * spread.radiusY;
    const landingX = aim.x + curveShift + noiseX;
    const landingY = Math.max(0.08, aim.y + spread.skyLift + noiseY);

    const frame = evaluateGoalFrame(landingX, landingY);
    const actualSide = sideOfX(landingX);
    const startX = keeperReadyPosition(readyTime, keeper, scoutWeakSide);

    // 2. 门将三阶段判定
    const refNorm = clamp((keeper.stats.reflex - 50) / 49, 0, 1);
    const reachNorm = clamp((keeper.stats.reach - 50) / 49, 0, 1);
    const antNorm = clamp((keeper.stats.anticipation - 50) / 49, 0, 1);

    const plan = decideKeeperPlan(aim, actualSide, player, keeper, historySides, scoutWeakSide, rng);

    // 弧线迷惑门将初始判断落点
    const perceivedX = landingX - curveShift * clamp(0.62 - antNorm * 0.20, 0.28, 0.62);
    const baseReaction = lerp(0.21, 0.09, refNorm);
    const diveSpeed = lerp(5.6, 8.4, (refNorm + reachNorm) * 0.5);

    let reactionDelay = baseReaction;
    let diveX: number;
    let contactX: number;
    let contactY: number;

    if (plan.committedEarly && plan.diveSide !== 0) {
        // 提前押注扑边：起动极快，猜对方向时极有威胁；但扑错边就很难回头
        reactionDelay = Math.max(0.03, baseReaction * 0.35);
        const guessedRight = plan.diveSide === actualSide || (actualSide === 0 && Math.abs(landingX) < 0.85);
        if (guessedRight) {
            diveX = clamp(perceivedX, -3.28, 3.28);
        } else {
            // 扑反方向！门将已经飞身向另一侧扑去
            const wrongTarget = plan.diveSide * lerp(2.2, 2.95, reachNorm);
            // 只有极慢球（如缓慢地滚偏中球，非勺子）高反应门将才可能急刹车回探一点
            if (!aim.isPanenka && duration > 0.78 && Math.abs(landingX) < 1.35 && refNorm > 0.60) {
                diveX = plan.diveSide * 0.90;
            } else {
                diveX = wrongTarget;
            }
        }
    } else {
        // 站桩等反应：不提前倒地，看清球路后再全力启动（完克勺子与慢球，面对中等速度非死角球也能极限扑出）
        reactionDelay = baseReaction * 0.96;
        diveX = clamp(perceivedX, -3.28, 3.28);
    }

    const availableTime = Math.max(0, duration - reactionDelay);
    const travel = availableTime * diveSpeed;
    const dir = Math.sign(diveX - startX);
    contactX = startX + dir * Math.min(travel, Math.abs(diveX - startX));

    // 门将手部扑救高度
    const canReachHeight = !plan.fooled && (plan.diveSide === 0 || plan.diveSide === actualSide);
    if (aim.isPanenka && !plan.committedEarly) {
        contactY = clamp(landingY, 1.05, 2.15);
    } else if (canReachHeight) {
        const targetY = clamp(landingY, 0.35, lerp(2.04, 2.34, reachNorm));
        const heightProgress = clamp(availableTime / 0.28, 0, 1);
        contactY = lerp(1.12, targetY, heightProgress);
    } else {
        contactY = 0.92;
    }

    // 臂展扑救包络椭圆：猜对方向时，常规非死角球会被稳稳扑出，逼出死角/重炮/弧线/假动作！
    const reachRx = lerp(0.88, 1.20, reachNorm);
    const reachRy = lerp(0.82, 1.10, reachNorm);
    const distNorm = Math.hypot((landingX - contactX) / reachRx, (landingY - contactY) / reachRy);

    // 站桩门将遇到勺子点球：几乎必没收！
    const panenkaCaught = aim.isPanenka && !plan.committedEarly && Math.abs(landingX - startX) < 1.35;
    // 提前扑反的门将遇到勺子：必然目送入网！
    const panenkaScored = aim.isPanenka && plan.committedEarly;

    const stopped = !panenkaScored && (panenkaCaught || distNorm <= 1.0);
    const isTopBins = (frame === 'inside' || frame === 'post_in')
        && Math.abs(landingX) >= GOAL_HALF_WIDTH - 0.92
        && landingY >= CROSSBAR_HEIGHT - 0.78;

    // 3. 汇总最终判定与实况风技术复盘文案
    let contact: ContactType;
    let outcome: Outcome;
    let verdictTag: ShotVerdictTag;
    let verdictTitle: string;
    let verdictSubtitle: string;

    if (frame === 'inside' || frame === 'post_in') {
        if (stopped) {
            contact = 'glove';
            outcome = 'save';
            if (panenkaCaught) {
                verdictTag = 'saved_panenka';
                verdictTitle = '勺子被没收';
                verdictSubtitle = '门将稳稳站桩，没有提前倒地';
            } else if (plan.readHistory) {
                verdictTag = 'saved_read';
                verdictTitle = '被门将读心扑出';
                verdictSubtitle = '连踢同侧被识破，试试变向或换角';
            } else if (speedKmh < 74) {
                verdictTag = 'saved_slow';
                verdictTitle = '球速偏慢被扑';
                verdictSubtitle = '力量偏小且未骗开门将重心';
            } else {
                verdictTag = 'saved_reflex';
                verdictTitle = '门神神扑！';
                verdictSubtitle = `${keeper.name} 猜对方向完成极限扑救`;
            }
        } else {
            contact = frame === 'post_in' ? 'post_in' : 'net';
            outcome = 'goal';
            if (aim.isPanenka) {
                verdictTag = 'panenka_goal';
                verdictTitle = '优雅勺子破门！';
                verdictSubtitle = `完美戏耍 ${keeper.name} · ${speedKmh} km/h`;
            } else if (frame === 'post_in') {
                verdictTag = 'post_in';
                verdictTitle = '擦柱入网！';
                verdictSubtitle = `绝佳内沿折射 · ${speedKmh} km/h`;
            } else if (isTopBins) {
                verdictTag = 'top_bins';
                verdictTitle = '绝对十分角！';
                verdictSubtitle = `门将望尘莫及 · ${speedKmh} km/h`;
            } else if (Math.abs(curveShift) >= 0.48) {
                verdictTag = 'banana_goal';
                verdictTitle = '香蕉球破网！';
                verdictSubtitle = `美妙外旋绕过指尖 · ${speedKmh} km/h`;
            } else if (plan.fooled) {
                verdictTag = 'fooled_keeper';
                verdictTitle = '完美骗过门将！';
                verdictSubtitle = `反向推射轻松入网 · ${speedKmh} km/h`;
            } else if (speedKmh >= 110) {
                verdictTag = 'power_blast';
                verdictTitle = '无解重炮破门！';
                verdictSubtitle = `势大力沉贯穿球门 · ${speedKmh} km/h`;
            } else {
                verdictTag = 'clean_goal';
                verdictTitle = '精准破门！';
                verdictSubtitle = `落点刁钻 · ${speedKmh} km/h`;
            }
        }
    } else if (frame === 'post_out') {
        contact = 'post_out';
        outcome = 'miss';
        verdictTag = 'miss_post';
        verdictTitle = '击中门框弹出！';
        verdictSubtitle = `差之毫厘 · ${speedKmh} km/h`;
    } else if (frame === 'sky_over') {
        contact = 'sky';
        outcome = 'miss';
        verdictTag = 'miss_sky';
        verdictTitle = '发力过猛打飞！';
        verdictSubtitle = aim.zone === 'overload'
            ? `红区过载失控 (${speedKmh} km/h)，控制力度或换高 FIN 球员`
            : `射门偏高越过横梁 · ${speedKmh} km/h`;
    } else {
        contact = 'grass';
        outcome = 'miss';
        if (spread.weakFootPenalty >= 0.35) {
            verdictTag = 'miss_weakfoot';
            verdictTitle = '逆足发力偏出';
            verdictSubtitle = `非惯用脚大角度精度不足 · ${speedKmh} km/h`;
        } else {
            verdictTag = 'miss_wide';
            verdictTitle = '射门偏出立柱';
            verdictSubtitle = aim.zone === 'overload'
                ? '过载发力导致散布过大'
                : `瞄准偏外侧 · ${speedKmh} km/h`;
        }
    }

    return {
        aim,
        spread,
        landingX,
        landingY,
        curveShift,
        speedKmh,
        duration,
        startX,
        diveX,
        contactX,
        contactY,
        reactionDelay,
        keeperGuessedRight: plan.diveSide === actualSide && actualSide !== 0,
        fooledKeeper: plan.fooled,
        stayedCenter: !plan.committedEarly,
        contact,
        outcome,
        verdictTag,
        verdictTitle,
        verdictSubtitle,
        isTopBins,
    };
}
