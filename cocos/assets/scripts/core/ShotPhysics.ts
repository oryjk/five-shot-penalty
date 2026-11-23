import { clamp, hasSkill, lerp } from './Attributes';
import type { KeeperProfile, PlayerProfile } from './Attributes';

export const GOAL_HALF_WIDTH = 3.66;
export const CROSSBAR_HEIGHT = 2.44;
export const BALL_RADIUS = 0.11;
export const GOAL_DISTANCE = 11;

export type Point = Readonly<{ x: number; y: number }>;
export type PowerZone = 'finesse' | 'golden' | 'power' | 'overload';

export interface Aim {
    readonly x: number;          // 目标门线横坐标 (m)，左负右正，球门 [-3.66, 3.66]
    readonly y: number;          // 目标门线高度 (m)，地面 0，横梁 2.44，可瞄到 2.85（高出横梁）
    readonly power: number;      // 0..1 归一化发力
    readonly zone: PowerZone;
    readonly curve: number;      // -1..1 滑动轨迹弯曲度（负向左弯，正向右弯）
    readonly feintScore: number; // 0..1 变向/停顿假动作得分
    readonly initialSide: -1 | 0 | 1; // 滑动前半段展示给门将的初始倾向侧
    readonly isPanenka: boolean; // 是否轻挑中路勺子点球
}

export interface SpreadEnvelope {
    readonly radiusX: number;      // 水平散布标准差半径 (m)
    readonly radiusY: number;      // 垂直散布标准差半径 (m)
    readonly skyLift: number;      // 发力过载导致的必然上扬高度偏移 (m)
    readonly pressureJitter: number; // 门将威慑/赛点导致的视觉准星微抖幅度 (m)
    readonly weakFootPenalty: number; // 0..1 逆足惩罚程度
    readonly cornerBonus: boolean; // 是否触发死角猎手加成
}

export interface SwipeSample {
    readonly x: number;
    readonly y: number;
    readonly t: number;
}

export function classifyPowerZone(power: number): PowerZone {
    if (power < 0.39) return 'finesse';
    if (power < 0.73) return 'golden';
    if (power < 0.91) return 'power';
    return 'overload';
}

export function powerZoneLabel(zone: PowerZone): string {
    switch (zone) {
        case 'finesse': return '轻巧推射';
        case 'golden': return '黄金发力';
        case 'power': return '强力抽射';
        case 'overload': return '过载红区';
    }
}

export function powerZoneColorHex(zone: PowerZone): string {
    switch (zone) {
        case 'finesse': return '#38D9FF';
        case 'golden': return '#46E484';
        case 'power': return '#F7C948';
        case 'overload': return '#FF5263';
    }
}

/**
 * 从单指滑动路径解析真实射门意图（方向、高度、发力区间、搓射弧线、变向假动作、勺子挑射）。
 * 坐标系：屏幕像素，向下 y 增大（向上滑为 start.y > end.y）。
 */
export function aimFromTrail(samples: readonly SwipeSample[]): Aim | null {
    if (samples.length < 2) return null;
    const start = samples[0];
    const end = samples[samples.length - 1];
    const dx = end.x - start.x;
    const up = start.y - end.y;
    const distance = Math.hypot(dx, up);
    if (!Number.isFinite(distance) || up < 18 || distance < 22) return null;

    const slope = dx / Math.max(up, 24);
    const power = clamp((distance - 22) / 148, 0, 1);
    const zone = classifyPowerZone(power);

    // 1. 滑动轨迹弯曲度 -> 弧线球 (curve)
    // 测量轨迹中段偏离起终点连线的最大带符号垂直距离
    let maxSignedDev = 0;
    const chordLen = Math.max(distance, 1);
    const ux = dx / chordLen;
    const uy = (end.y - start.y) / chordLen;
    for (let i = 1; i < samples.length - 1; i++) {
        const px = samples[i].x - start.x;
        const py = samples[i].y - start.y;
        // 左弯（轨迹鼓向左侧，终点往右收）还是右弯：叉积决定弧线方向
        // 足球直觉：手指划出“左凸弧线”→ 球先偏左再向右拐（右旋，curve > 0）；
        // 或者手指划出“右凸弧线”→ 球先偏右再向左拐（左旋，curve < 0）。
        // cross = px * uy - py * ux，在屏幕坐标(y向下)向上滑动(uy<0)时：
        // 若中点在连线左侧(px < 0)，px*uy > 0 → 球从左往右拐（curve > 0）
        // 若中点在连线右侧(px > 0)，px*uy < 0 → 球从右往左拐（curve < 0）
        const perp = px * uy - py * ux;
        if (Math.abs(perp) > Math.abs(maxSignedDev)) maxSignedDev = perp;
    }
    const rawCurve = Math.abs(maxSignedDev) < 10 ? 0 : clamp((maxSignedDev / chordLen) * 3.1, -1, 1);

    // 2. 变向假动作检测 (feintScore) 与前半段初始倾向 (initialSide)
    let minAimX = 0;
    let maxAimX = 0;
    let earlyAimX = 0;
    const earlyIdx = Math.max(1, Math.floor(samples.length * 0.45));
    for (let i = 1; i < samples.length; i++) {
        const sdx = samples[i].x - start.x;
        const sup = Math.max(start.y - samples[i].y, 24);
        const sx = clamp((sdx / sup) * 5.6, -5.2, 5.2);
        if (sx < minAimX) minAimX = sx;
        if (sx > maxAimX) maxAimX = sx;
        if (i === earlyIdx) earlyAimX = sx;
    }

    const x = clamp(slope * 5.6, -5.0, 5.0);
    // 高度随发力上升：黄金/强力区瞄准中上角，过载红区叠加 skyLift 后极易冲过 2.44m 横梁打飞
    const anglePenalty = Math.min(Math.abs(slope), 1.4) * 0.16;
    const rawY = 0.18 + 2.18 * Math.pow(power, 0.96) - anglePenalty;
    const y = clamp(rawY, 0.14, 2.75);

    // 若滑动中曾明显瞄向另一侧（与最终 x 反号或摆幅极大），计为假动作变向
    const oppositeSwing = x >= 0 ? Math.max(0, -minAimX) : Math.max(0, maxAimX);
    const totalSwing = maxAimX - minAimX;
    const durationMs = Math.max(0, end.t - start.t);
    const hesitationBonus = durationMs >= 320 && totalSwing >= 1.2 ? 0.22 : 0;
    const feintScore = clamp(
        (oppositeSwing >= 0.75 ? (oppositeSwing - 0.55) / 1.9 : 0) + hesitationBonus,
        0,
        1
    );

    const initialSide: -1 | 0 | 1 =
        Math.abs(earlyAimX) < 0.65 ? 0 : earlyAimX < 0 ? -1 : 1;

    // 3. 勺子点球判定：轻巧力度 + 瞄向中路区域
    const isPanenka = power >= 0.14 && power <= 0.38 && Math.abs(x) <= 1.25 && Math.abs(rawCurve) < 0.35;

    return {
        x,
        y: isPanenka ? clamp(1.38 + (power - 0.14) * 2.1, 1.35, 1.95) : y,
        power,
        zone,
        curve: isPanenka ? 0 : rawCurve,
        feintScore,
        initialSide,
        isPanenka,
    };
}

/** 简化兼容入口（两点直线滑动） */
export function aimFromSwipe(start: Point, end: Point): Aim | null {
    return aimFromTrail([
        { x: start.x, y: start.y, t: 0 },
        { x: end.x, y: end.y, t: 180 },
    ]);
}

export class SwipeInput {
    private finger: { id: number; samples: SwipeSample[] } | null = null;
    public aim: Aim | null = null;

    start(id: number, origin: Point, nowMs = Date.now()): boolean {
        if (this.finger) return false;
        this.finger = { id, samples: [{ x: origin.x, y: origin.y, t: nowMs }] };
        this.aim = null;
        return true;
    }

    move(id: number, destination: Point, nowMs = Date.now()): Aim | null {
        if (this.finger?.id !== id) return null;
        const list = this.finger.samples;
        const last = list[list.length - 1];
        if (Math.hypot(destination.x - last.x, destination.y - last.y) >= 3 || nowMs - last.t >= 40) {
            list.push({ x: destination.x, y: destination.y, t: nowMs });
            if (list.length > 48) {
                // 保留起点和最近轨迹，同时避免数组无限增长
                list.splice(1, 1);
            }
        }
        this.aim = aimFromTrail(list);
        return this.aim;
    }

    finish(id: number, destination: Point, nowMs = Date.now()): Aim | null {
        if (this.finger?.id !== id) return null;
        this.finger.samples.push({ x: destination.x, y: destination.y, t: nowMs });
        const aim = aimFromTrail(this.finger.samples);
        this.cancel();
        return aim;
    }

    cancel(id?: number): void {
        if (id !== undefined && this.finger?.id !== id) return;
        this.finger = null;
        this.aim = null;
    }

    get active(): boolean {
        return this.finger !== null;
    }

    get trail(): readonly SwipeSample[] {
        return this.finger?.samples ?? [];
    }
}

export interface SpreadContext {
    readonly player: PlayerProfile;
    readonly keeper: KeeperProfile;
    readonly isClutchShot: boolean;
    readonly scoutWarmupBuff?: boolean;
}

/**
 * 计算实时散布圆与过载上扬偏移——所有实况能力值（FIN/CMP/WKF）与特技在此真实生效！
 */
export function computeSpread(aim: Aim, ctx: SpreadContext): SpreadEnvelope {
    const { player, keeper, isClutchShot, scoutWarmupBuff } = ctx;
    const finNorm = clamp((player.stats.finishing - 55) / 44, 0, 1); // 0(55) .. 1(99)
    const cmpNorm = clamp((player.stats.composure - 55) / 44, 0, 1);
    const wkfNorm = clamp((player.stats.weakFoot - 50) / 49, 0, 1);

    // 1. 基础散布随力量分段非线性放大：轻巧极准，黄金稳定，强力明显放大，红区剧烈失控！
    let powerSpread: number;
    let skyLift = 0;
    if (aim.zone === 'finesse') {
        powerSpread = lerp(0.18, 0.28, clamp(aim.power / 0.39, 0, 1));
    } else if (aim.zone === 'golden') {
        powerSpread = lerp(0.28, 0.50, (aim.power - 0.39) / 0.34);
    } else if (aim.zone === 'power') {
        const t = (aim.power - 0.73) / 0.18;
        powerSpread = lerp(0.54, 0.96, t);
        skyLift = lerp(0.06, 0.28, t) * (1.32 - finNorm * 0.68);
    } else {
        // 过载红区：力量拉满必有明显上扬与散布失控，低 FIN 球员极易打飞！
        const t = clamp((aim.power - 0.91) / 0.09, 0, 1);
        powerSpread = lerp(1.02, 1.48, t);
        skyLift = lerp(0.32, 0.78, t) * (1.42 - finNorm * 0.76);
    }

    // 2. 射门精度 FIN 缩放系数：让 63 分青训与 95+ 传奇的手感形成强烈反差！
    // FIN 60 → 1.38x（散布明显），FIN 99 → 0.44x（手术刀般精准）
    const finFactor = lerp(1.42, 0.44, finNorm);

    // 3. 逆足惩罚：右脚球员大力/大角度攻右侧或逆向搓射时，受 WKF 影响扩大散布
    const weakSide = player.foot === 'R' ? aim.x > 1.35 : aim.x < -1.35;
    const weakCurve = player.foot === 'R' ? aim.curve > 0.35 : aim.curve < -0.35;
    let weakFootPenalty = 0;
    if (weakSide) weakFootPenalty += clamp((Math.abs(aim.x) - 1.35) / 2.2, 0, 1) * 0.65;
    if (weakCurve) weakFootPenalty += 0.35;
    weakFootPenalty = clamp(weakFootPenalty, 0, 1) * (1 - wkfNorm * 0.82);

    // 4. 门将威慑 & 赛点压力（由 CMP 冷静抗压与「大心脏」抵消）
    const keeperThreat = Math.max(0, (keeper.stats.intimidation - 65) / 34); // Lv.4+ 渐强
    const rawPressure = keeperThreat * 0.55 + (isClutchShot ? 0.55 : 0);
    const hasClutch = hasSkill(player, 'clutch') && isClutchShot;
    const netPressure = hasClutch ? 0 : Math.max(0, rawPressure - cmpNorm * 0.98);
    const pressureSpreadFactor = 1 + netPressure * 0.38;
    const pressureJitter = netPressure * 0.22;

    // 5. 特技修正
    let skillScale = 1.0;
    if (hasSkill(player, 'cannon') && (aim.zone === 'power' || aim.zone === 'overload')) {
        skyLift *= 0.62;
        skillScale *= 0.84;
    }
    const nearCorner = Math.abs(aim.x) >= 2.35 || aim.y >= 1.72;
    const cornerBonus = hasSkill(player, 'corner') && nearCorner;
    if (cornerBonus) skillScale *= 0.82;
    if (hasClutch) skillScale *= 0.80;
    if (aim.isPanenka && hasSkill(player, 'panenka')) {
        skillScale *= 0.65;
    }
    if (scoutWarmupBuff) {
        skillScale *= 0.82;
    }

    const baseRadius = powerSpread * finFactor * (1 + weakFootPenalty * 0.48) * pressureSpreadFactor * skillScale;
    const radiusX = clamp(baseRadius, 0.08, 1.65);
    const radiusY = clamp(baseRadius * (aim.zone === 'overload' ? 1.18 : 0.90), 0.08, 1.75);

    return {
        radiusX,
        radiusY,
        skyLift: Math.max(0, skyLift),
        pressureJitter,
        weakFootPenalty,
        cornerBonus,
    };
}

/** 计算球速 (km/h)、飞行时间 (s) 与弧线总横向偏移 (m) */
export function computeBallKinematics(aim: Aim, player: PlayerProfile): {
    speedKmh: number;
    duration: number;
    curveShift: number;
} {
    const kpwNorm = clamp((player.stats.power - 55) / 44, 0, 1);
    const crlNorm = clamp((player.stats.curl - 55) / 44, 0, 1);

    if (aim.isPanenka) {
        const speedKmh = Math.round(lerp(46, 56, clamp((aim.power - 0.14) / 0.24, 0, 1)));
        const duration = lerp(1.12, 0.98, clamp((aim.power - 0.14) / 0.24, 0, 1));
        return { speedKmh, duration, curveShift: 0 };
    }

    const baseMinSpeed = lerp(54, 66, kpwNorm);
    const baseMaxSpeed = lerp(104, 130, kpwNorm) + (hasSkill(player, 'cannon') ? 5 : 0);
    // 搓射带大弧线时会损失少量直线极速
    const curlDrag = Math.abs(aim.curve) * 0.08;
    const speedKmh = Math.round(lerp(baseMinSpeed, baseMaxSpeed, Math.pow(aim.power, 0.92)) * (1 - curlDrag));
    const speedMs = speedKmh / 3.6;
    const duration = clamp(GOAL_DISTANCE / speedMs, 0.33, 0.96);

    const bananaMult = hasSkill(player, 'banana') ? 1.40 : 1.0;
    const curveShift = aim.curve * lerp(0.32, 1.18, crlNorm) * bananaMult;

    return { speedKmh, duration, curveShift };
}

/** 盒-穆勒正态采样（截断在 ±1.9σ，真实体现散布圆边界风险） */
export function sampleTruncatedGaussian(rng: () => number): number {
    const u1 = Math.max(1e-6, rng());
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return clamp(z * 0.68, -1.85, 1.85);
}

export type FrameContact = 'inside' | 'post_in' | 'post_out' | 'sky_over' | 'wide';

/**
 * 真实球门门框判定：区分球门内、擦立柱/横梁内沿弹入网（post_in 算进球！）、砸框弹出、打飞、射偏。
 */
export function evaluateGoalFrame(x: number, y: number): FrameContact {
    const absX = Math.abs(x);
    const postOuter = GOAL_HALF_WIDTH + BALL_RADIUS + 0.06;
    const postInner = GOAL_HALF_WIDTH - BALL_RADIUS - 0.02;
    const barOuter = CROSSBAR_HEIGHT + BALL_RADIUS + 0.06;
    const barInner = CROSSBAR_HEIGHT - BALL_RADIUS - 0.02;

    if (y < 0) return 'wide';
    if (absX < postInner && y < barInner) return 'inside';

    // 擦立柱判定
    if (absX >= postInner && absX <= postOuter && y <= barOuter) {
        // 靠球门内沿（<= GOAL_HALF_WIDTH - 0.01）折射入网！
        return absX <= GOAL_HALF_WIDTH - 0.01 && y <= CROSSBAR_HEIGHT - 0.01 ? 'post_in' : 'post_out';
    }
    // 擦横梁判定
    if (y >= barInner && y <= barOuter && absX <= postOuter) {
        return y <= CROSSBAR_HEIGHT - 0.01 && absX <= GOAL_HALF_WIDTH - 0.01 ? 'post_in' : 'post_out';
    }
    if (y > barOuter && absX <= GOAL_HALF_WIDTH + 1.1) return 'sky_over';
    return 'wide';
}
