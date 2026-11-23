import { Color, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { clamp, easeOut, lerp } from '../core/Attributes';
import type { KeeperProfile, PlayerProfile } from '../core/Attributes';
import { keeperReadyPosition } from '../core/KeeperAI';
import type { ResolvedShot } from '../core/KeeperAI';
import { FEEDBACK_SECONDS, PenaltyMatch } from '../core/PenaltyMatch';
import {
    computeBallKinematics,
    computeSpread,
    CROSSBAR_HEIGHT,
    GOAL_HALF_WIDTH,
    powerZoneColorHex,
} from '../core/ShotPhysics';
import type { Aim } from '../core/ShotPhysics';
import { child, color, createSprite, Drawing, HEIGHT, Pair, place, WIDTH } from './Drawing';

const CENTER = 195;
const GOAL_Y = 492;
const SPOT_Y = 666;
const GOAL_X_SCALE = 33;
const GOAL_Y_SCALE = 46;
const left = CENTER - GOAL_HALF_WIDTH * GOAL_X_SCALE;
const right = CENTER + GOAL_HALF_WIDTH * GOAL_X_SCALE;
const top = GOAL_Y - CROSSBAR_HEIGHT * GOAL_Y_SCALE;

// 模块级预分配 Color（杜绝在 60fps update 中反复 new Color 引发微信小游戏 JSCore GC 闪退）
const IVORY = color('#F2F7EB');
const NET_FILL_OUTER = color('#081C336F');
const NET_FILL_INNER = color('#18333F59');
const NET_MESH = color('#E1F4F991');
const IMPACT_COLORS = {
    goal: color('#CAFFD6'),
    save: color('#FFD399'),
    miss: color('#FFBFB0'),
};
const ZONE_COLORS: Record<string, Color> = {
    finesse: color('#38D9FF'),
    golden: color('#46E484'),
    power: color('#F7C948'),
    overload: color('#FF5263'),
    panenka: color('#C58BFF'),
};
const TRAIL_DEFAULT = color('#F4FED3');
const TRAIL_CURVE = color('#38D9FF');
const TRAIL_PANENKA = color('#C58BFF');

const REUSABLE_COLOR = new Color(255, 255, 255, 255);
const REUSABLE_FILL = new Color(255, 255, 255, 42);

function goalScreenPoint(gx: number, gy: number): Pair {
    return [CENTER + gx * GOAL_X_SCALE, GOAL_Y - gy * GOAL_Y_SCALE];
}

function flightPosition(
    targetX: number,
    targetY: number,
    curveShift: number,
    power: number,
    isPanenka: boolean,
    progress: number
): [number, number, number, number] {
    const ground = lerp(SPOT_Y + 15, GOAL_Y, progress);
    const straightX = (targetX - curveShift) * progress;
    const curvedX = curveShift * Math.pow(progress, 1.55) - curveShift * 0.24 * Math.sin(Math.PI * progress);
    const xMeters = straightX + curvedX;

    const arcBoost = isPanenka
        ? Math.sin(Math.PI * progress) * 1.42
        : Math.sin(Math.PI * progress) * (0.26 + (1 - power) * 0.28 + power * 0.26);
    const height = targetY * progress + arcBoost;
    const radius = lerp(19, 6.2, progress);
    return [
        CENTER + xMeters * GOAL_X_SCALE,
        ground - height * lerp(58, GOAL_Y_SCALE, progress) - radius * (1 - progress),
        ground,
        radius,
    ];
}

export interface StadiumRenderState {
    readonly match: PenaltyMatch | null;
    readonly previewKeeper: KeeperProfile;
    readonly previewPlayer: PlayerProfile;
    readonly readyTime: number;
    readonly clock: number;
    readonly aim: Aim | null;
    readonly interactive: boolean;
}

/**
 * 真机零闪退优化版球场渲染器：
 * 所有每帧动画元素（足球阴影、待机光环、飞行拖尾点、门将威慑圈、球探弱侧标）全部预绘制为静态节点，
 * 运行时仅修改 Transform / UIOpacity，杜绝 60fps Graphics.clear() 网格重建和 Color GC 抖动。
 */
export class Stadium {
    private readonly net: Drawing;
    private readonly keeperFallback: Drawing;
    private readonly ready: Sprite;
    private readonly dive: Sprite;
    private readonly action: Drawing;

    // 预绘制静态动画节点（零每帧 Graphics 重绘）
    private readonly auraNode: Node;
    private readonly auraOpacity: UIOpacity;
    private readonly scoutHintNode: Node;
    private readonly scoutHintOpacity: UIOpacity;
    private readonly shadowNode: Node;
    private readonly idleRingNode: Node;
    private readonly idleArrowNode: Node;
    private readonly trailNodes: { node: Node; opacity: UIOpacity; draw: Drawing; tintHex: string }[] = [];

    private readonly ball: Drawing;
    private readonly ballNode: Node;

    private netAnimated = false;
    private lastNetStep = -1;
    private lastActionKey = '';
    private lastTintHex = '';
    private readonly keeperTintColor = new Color(255, 255, 255, 255);

    constructor(parent: Node) {
        const pitch = new Drawing(parent, 'Penalty box');
        const marks = color('#EEF8D794');
        pitch.line([[0, GOAL_Y + 4], [390, GOAL_Y + 4]], marks, 1.6);
        pitch.line([[43, GOAL_Y + 4], [13, 560], [377, 560], [347, GOAL_Y + 4]], marks, 1.65);
        pitch.line([[88, GOAL_Y + 4], [75, 524], [315, 524], [302, GOAL_Y + 4]], marks, 1.2);
        pitch.g.moveTo(124, -560);
        pitch.g.bezierCurveTo(149, -585, 241, -585, 266, -560);
        pitch.g.strokeColor = marks;
        pitch.g.lineWidth = 1.5;
        pitch.g.stroke();
        pitch.ellipse(CENTER, SPOT_Y + 15, 4.5, 2.4, color('#F4FFE8CC'));
        pitch.ellipse(CENTER, GOAL_Y + 3, 133, 8, color('#031B1C5C'));

        this.net = new Drawing(parent, 'Net');
        this.drawNet(0, CENTER);

        // 预绘制门将威慑光环
        this.auraNode = child(parent, 'Keeper aura');
        this.auraOpacity = this.auraNode.addComponent(UIOpacity);
        const auraDraw = new Drawing(this.auraNode, 'Aura ring');
        place(auraDraw.node, WIDTH / 2, HEIGHT / 2);
        auraDraw.ellipseStroke(0, 0, 38, 8.5, color('#FF5C72'), 2.0);
        this.auraNode.active = false;

        // 预绘制球探弱侧提示标
        this.scoutHintNode = child(parent, 'Scout weak hint');
        this.scoutHintOpacity = this.scoutHintNode.addComponent(UIOpacity);
        const hintDraw = new Drawing(this.scoutHintNode, 'Hint icon');
        place(hintDraw.node, WIDTH / 2, HEIGHT / 2);
        const cyan = color('#38D9FF');
        hintDraw.ring(0, 0, 19, cyan, 2.0);
        hintDraw.line([[-6, -2], [0, 5], [6, -2]], cyan, 2.2);
        this.scoutHintNode.active = false;

        this.keeperFallback = new Drawing(parent, 'Keeper loading silhouette');
        this.ready = createSprite(parent, 'Keeper ready', CENTER, 444, 105, 99);
        this.dive = createSprite(parent, 'Keeper dive', CENTER, 444, 118, 86);

        const frame = new Drawing(parent, 'Posts and crossbar');
        const rails: Pair[] = [[left, GOAL_Y], [left, top], [right, top], [right, GOAL_Y]];
        frame.line(rails.map(([x, y]) => [x + 2, y + 1]), color('#101F2BD9'), 8.5);
        frame.line(rails, color('#C3D5D8'), 6.5);
        frame.line(
            [[left - 1, GOAL_Y - 2], [left - 1, top - 0.8], [right - 1, top - 0.8], [right - 1, GOAL_Y - 2]],
            IVORY,
            2
        );

        // 预绘制足球地面投影节点（不再每帧 clear）
        this.shadowNode = child(parent, 'Ball shadow');
        const shadowDraw = new Drawing(this.shadowNode, 'Shadow ellipse');
        place(shadowDraw.node, WIDTH / 2, HEIGHT / 2);
        shadowDraw.ellipse(0, 0, 26, 6.5, color('#03161B6B'));

        // 预绘制待机脉动圈与引导箭头
        this.idleRingNode = child(parent, 'Idle ring');
        const ringDraw = new Drawing(this.idleRingNode, 'Ring');
        place(ringDraw.node, WIDTH / 2, HEIGHT / 2);
        ringDraw.ring(0, 0, 28, color('#FFF9CB82'), 1.5);

        this.idleArrowNode = child(parent, 'Idle arrow');
        const arrowDraw = new Drawing(this.idleArrowNode, 'Arrow');
        place(arrowDraw.node, WIDTH / 2, HEIGHT / 2);
        arrowDraw.line([[-7, 0], [0, -6], [7, 0]], color('#FEF1AF'), 2.2);

        // 预绘制 5 个飞行拖尾球点
        for (let i = 0; i < 5; i++) {
            const tn = child(parent, 'Trail' + i);
            const op = tn.addComponent(UIOpacity);
            const td = new Drawing(tn, 'Dot');
            place(td.node, WIDTH / 2, HEIGHT / 2);
            td.ellipse(0, 0, 14, 14, TRAIL_DEFAULT);
            tn.active = false;
            this.trailNodes.push({ node: tn, opacity: op, draw: td, tintHex: '#F4FED3' });
        }

        // 仅在瞄准拖动或射门命中瞬间按需重绘的动态层
        this.action = new Drawing(parent, 'Aim and contact effects');

        this.ballNode = child(parent, 'Spinning football');
        this.ball = new Drawing(this.ballNode, 'Football panels');
        place(this.ball.node, WIDTH / 2, HEIGHT / 2);
        this.drawBall();
    }

    setKeeper(ready: SpriteFrame | null, dive: SpriteFrame | null): void {
        this.ready.spriteFrame = ready;
        this.dive.spriteFrame = dive;
        for (const sprite of [this.ready, this.dive]) {
            if (!sprite.spriteFrame) continue;
            const native = sprite.spriteFrame.originalSize;
            const targetH = sprite === this.ready ? 99 : 89;
            const width = (native.width / native.height) * targetH;
            sprite.node.getComponent(UITransform)?.setContentSize(width, targetH);
        }
    }

    private drawNet(ripple: number, impactX: number): void {
        this.net.clear();
        const bx1 = left + 22;
        const bx2 = right - 22;
        const by1 = top + 16;
        const by2 = GOAL_Y - 17;
        this.net.polygon([[left, top], [right, top], [right, GOAL_Y], [left, GOAL_Y]], NET_FILL_OUTER);
        this.net.polygon([[bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]], NET_FILL_INNER);
        for (let i = 0; i <= 20; i++) {
            const x = lerp(left, right, i / 20);
            const bx = lerp(bx1, bx2, i / 20);
            const wave = Math.max(0, 1 - Math.abs(x - impactX) / 110) * ripple * Math.sin(i * 0.79);
            this.net.line([[x, top], [bx, by1], [bx + wave, by2 + Math.abs(wave) * 0.55], [x, GOAL_Y]], NET_MESH, i % 5 === 0 ? 0.9 : 0.56);
        }
        for (let i = 0; i <= 8; i++) {
            const y = lerp(top, GOAL_Y, i / 8);
            const by = lerp(by1, by2, i / 8);
            this.net.line([[left, y], [bx1, by], [bx2, by], [right, y]], NET_MESH, i % 4 === 0 ? 0.9 : 0.56);
        }
    }

    private drawBall(): void {
        const outer = color('#CCD8DE');
        this.ball.ellipse(0, 0, 19, 19, color('#1A242C'));
        this.ball.ellipse(0, 0, 18, 18, outer);
        this.ball.ellipse(-1.1, -2.5, 15, 14, color('#F1F2EB'));
        this.ball.ellipse(-4, -6.3, 11.5, 8.5, IVORY);
        const dark = color('#293744');
        const pins = Array.from({ length: 5 }, (_, i): Pair => {
            const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
            return [Math.cos(angle), Math.sin(angle)];
        });
        for (const [x, y] of pins) {
            this.ball.line([[x * 7, y * 7], [x * 16, y * 16]], color('#687C88'), 0.85);
            this.ball.ellipse(x * 15.7, y * 15.7, 2.4, 2.4, dark);
        }
        this.ball.polygon(pins.map(([x, y]): Pair => [x * 7.2, y * 7.2]), dark);
    }

    private drawKeeper(state: StadiumRenderState): void {
        const match = state.match;
        const keeper = match ? match.keeper : state.previewKeeper;
        const shot = match?.shot ?? null;

        if (keeper.jerseyTint !== this.lastTintHex) {
            this.lastTintHex = keeper.jerseyTint;
            this.keeperTintColor.fromHEX(keeper.jerseyTint);
            this.ready.color = this.keeperTintColor;
            this.dive.color = this.keeperTintColor;
        }

        const age = match?.stage === 'flight' ? match.elapsed : shot?.duration ?? 0;
        const delay = shot ? shot.reactionDelay : 0.14;
        const diveTime = shot ? clamp((age - delay) / Math.max(0.18, shot.duration - delay), 0, 1) : 0;
        const moveRatio = easeOut(diveTime);
        const targetX = shot ? shot.contactX : keeperReadyPosition(state.readyTime, keeper, match?.scoutWeakSide ?? null);
        const currentMetersX = shot ? lerp(shot.startX, targetX, moveRatio) : targetX;
        const x = CENTER + currentMetersX * GOAL_X_SCALE;

        const sign = shot ? Math.sign(shot.diveX - shot.startX) || 1 : 1;
        const diveDist = shot ? Math.abs(shot.contactX - shot.startX) : 0;
        const diving = Boolean(shot && !shot.stayedCenter && diveDist > 0.45 && diveTime > 0.16 && this.dive.spriteFrame)
            || Boolean(shot && diveDist > 1.05 && diveTime > 0.24 && this.dive.spriteFrame);

        const airborne = shot && diving ? Math.sin(diveTime * Math.PI * 0.55) * clamp((shot.contactY - 0.85) * 32, 0, 42) : 0;
        const land = match?.stage === 'complete' || match?.stage === 'var_offer'
            ? 1
            : match?.stage === 'feedback'
                ? easeOut(clamp(match.elapsed / 0.48, 0, 1))
                : 0;
        const rocking = Math.sin(state.readyTime * 7.5) * 1.4;

        this.ready.node.active = !diving && Boolean(this.ready.spriteFrame);
        this.dive.node.active = diving;

        if (diving) {
            place(this.dive.node, x + sign * diveTime * 8, 444 - airborne + land * 24);
            this.dive.node.setScale(sign, 1, 1);
            this.dive.node.angle = -sign * land * 18;
        } else {
            place(this.ready.node, x, 444 + (shot ? 0 : Math.abs(rocking) - 0.6));
            this.ready.node.angle = rocking;
        }

        // 威慑光环（纯 Transform + Opacity，零 clear）
        const showAura = keeper.stats.intimidation >= 88 && (!shot || match?.stage === 'ready');
        this.auraNode.active = showAura;
        if (showAura) {
            const pulse = 0.5 + 0.5 * Math.sin(state.clock * 4.2);
            place(this.auraNode, x, GOAL_Y - 2);
            const sc = 0.92 + pulse * 0.26;
            this.auraNode.setScale(sc, sc, 1);
            this.auraOpacity.opacity = Math.round(90 + pulse * 100);
        }

        // S4 球探弱侧提示（纯 Transform + Opacity，零 clear）
        const showHint = Boolean(state.interactive && match?.stage === 'ready' && match.scoutWeakSide && match.scoutHintsRemaining > 0);
        this.scoutHintNode.active = showHint;
        if (showHint && match?.scoutWeakSide) {
            const pulse = 0.5 + 0.5 * Math.sin(state.clock * 5.2);
            const hintX = CENTER + match.scoutWeakSide * 2.55 * GOAL_X_SCALE;
            const hintY = GOAL_Y - 1.35 * GOAL_Y_SCALE;
            place(this.scoutHintNode, hintX, hintY);
            const sc = 0.9 + pulse * 0.22;
            this.scoutHintNode.setScale(sc, sc, 1);
            this.scoutHintOpacity.opacity = Math.round(130 + pulse * 115);
        }

        if (!this.ready.spriteFrame && !this.keeperFallback.node.active) {
            this.keeperFallback.node.active = true;
            this.keeperFallback.clear();
            this.keeperFallback.box(CENTER - 12, 429, 24, 27, color('#F5B953'), 5);
        } else if (this.ready.spriteFrame && this.keeperFallback.node.active) {
            this.keeperFallback.node.active = false;
        }
    }

    update(state: StadiumRenderState): void {
        const match = state.match;
        const shot = match?.shot ?? null;
        const feedback = match?.stage === 'feedback' || match?.stage === 'var_offer';
        const isNetHit = shot && (shot.contact === 'net' || shot.contact === 'post_in');
        const netImpact = match?.stage === 'feedback' && isNetHit ? Math.max(0, 1 - match.elapsed * 2.5) : 0;

        // 节流球网抖动重绘（约 20Hz，且静止后只重置 1 次）
        if (netImpact > 0) {
            const step = Math.floor((match?.elapsed ?? 0) * 20);
            if (step !== this.lastNetStep) {
                this.lastNetStep = step;
                const impactX = shot ? goalScreenPoint(shot.landingX, shot.landingY)[0] : CENTER;
                this.drawNet(netImpact * Math.sin((match?.elapsed ?? 0) * 26 + 1.5) * 11, impactX);
                this.netAnimated = true;
            }
        } else if (this.netAnimated) {
            this.drawNet(0, CENTER);
            this.netAnimated = false;
            this.lastNetStep = -1;
        }

        this.drawKeeper(state);

        let [x, y, ground, radius] = flightPosition(0, 0, 0, 0, false, 0);
        let rotation = 12;
        let showTrails = false;

        if (shot && match) {
            const fraction = match.stage === 'flight' ? clamp(match.elapsed / shot.duration, 0, 1) : 1;
            const progress = 1 - Math.pow(1 - fraction, 1.24);
            [x, y, ground, radius] = flightPosition(
                shot.landingX,
                shot.landingY,
                shot.curveShift,
                shot.aim.power,
                shot.aim.isPanenka,
                progress
            );
            const spinDir = shot.curveShift !== 0 ? Math.sign(shot.curveShift) : 1;
            rotation += progress * (260 + shot.aim.power * 240) * spinDir;

            if (match.stage === 'flight' && progress > 0.02) {
                showTrails = true;
                const wantHex = shot.aim.isPanenka ? '#C58BFF' : Math.abs(shot.curveShift) > 0.35 ? '#38D9FF' : '#F4FED3';
                const col = shot.aim.isPanenka ? TRAIL_PANENKA : Math.abs(shot.curveShift) > 0.35 ? TRAIL_CURVE : TRAIL_DEFAULT;
                for (let i = 0; i < 5; i++) {
                    const tn = this.trailNodes[i];
                    if (tn.tintHex !== wantHex) {
                        tn.tintHex = wantHex;
                        tn.draw.clear();
                        tn.draw.ellipse(0, 0, 14, 14, col);
                    }
                    const [tx, ty] = flightPosition(
                        shot.landingX,
                        shot.landingY,
                        shot.curveShift,
                        shot.aim.power,
                        shot.aim.isPanenka,
                        Math.max(0, progress - (i + 1) * 0.025)
                    );
                    tn.node.active = true;
                    place(tn.node, tx, ty);
                    const sc = (radius * (1 - (i + 1) * 0.13)) / 14;
                    tn.node.setScale(sc, sc, 1);
                    tn.opacity.opacity = Math.max(16, 95 - (i + 1) * 16);
                }
            } else if (feedback) {
                const elapsed = match.stage === 'var_offer' ? 0.55 : match.elapsed;
                const recoil = easeOut(clamp(elapsed / 0.52, 0, 1));
                const direction = Math.sign(shot.landingX) || 1;
                if (shot.contact === 'net') {
                    y += recoil * 10;
                    radius *= 1 - recoil * 0.16;
                } else if (shot.contact === 'post_in') {
                    x -= direction * recoil * 22;
                    y += recoil * 12;
                    radius *= 1 - recoil * 0.15;
                } else if (shot.contact === 'glove') {
                    x += direction * recoil * 44;
                    y += recoil * 28;
                } else if (shot.contact === 'post_out') {
                    x -= direction * recoil * 38;
                    y += recoil * 34;
                } else if (shot.contact === 'sky') {
                    y -= recoil * 46;
                    radius *= 1 - recoil * 0.32;
                } else {
                    x += direction * recoil * 26;
                    y += recoil * 14;
                }
            }
        }

        if (!showTrails) {
            for (const tn of this.trailNodes) {
                if (tn.node.active) tn.node.active = false;
            }
        }

        // 待机光环与向上箭头（纯 Transform，零 clear）
        const showIdle = !shot && state.interactive;
        this.idleRingNode.active = showIdle;
        this.idleArrowNode.active = showIdle && !state.aim;
        if (showIdle) {
            const pulse = (Math.sin(state.clock * 3.2) + 1) / 2;
            place(this.idleRingNode, x, y + 2);
            const rScale = (26 + pulse * 4) / 28;
            this.idleRingNode.setScale(rScale, rScale, 1);
            if (!state.aim) {
                place(this.idleArrowNode, x, y - 47 - pulse * 5);
            }
        }

        const hideBall = !state.interactive && (!match || match.stage === 'complete');
        this.shadowNode.active = !hideBall;
        if (!hideBall) {
            place(this.shadowNode, x, ground);
            const sScale = radius / 19;
            this.shadowNode.setScale(sScale, sScale, 1);
        }
        place(this.ballNode, x, y);
        this.ballNode.setScale(radius / 19, radius / 19, 1);
        this.ballNode.angle = rotation;
        this.ballNode.active = !hideBall;

        // 按需脏检查重绘 action（瞄准圆 / 命中爆发），空闲时 0 次重绘！
        if (state.aim && state.interactive && match?.stage === 'ready') {
            const aim = state.aim;
            const jitterTick = Math.floor(state.clock * 20);
            const key = `aim|${Math.round(aim.x * 20)}|${Math.round(aim.y * 20)}|${Math.round(aim.power * 50)}|${Math.round(aim.curve * 20)}|${aim.isPanenka ? 1 : 0}|${jitterTick}`;
            if (key !== this.lastActionKey) {
                this.lastActionKey = key;
                this.action.clear();
                this.drawAim(aim, match, state.clock);
            }
        } else if (match?.stage === 'feedback' && shot && shot.contact !== 'grass' && shot.contact !== 'sky' && match.elapsed <= FEEDBACK_SECONDS * 0.62) {
            const step = Math.floor(match.elapsed * 20);
            const key = `imp|${match.currentShotNumber}|${step}`;
            if (key !== this.lastActionKey) {
                this.lastActionKey = key;
                this.action.clear();
                this.drawImpact(shot, match.elapsed);
            }
        } else if (this.lastActionKey !== '') {
            this.lastActionKey = '';
            this.action.clear();
        }
    }

    private drawAim(aim: Aim, match: PenaltyMatch, clock: number): void {
        const player = match.currentPlayer;
        const keeper = match.keeper;
        const spread = computeSpread(aim, {
            player,
            keeper,
            isClutchShot: match.isClutchShot,
            scoutWarmupBuff: match.scoutIntelActive,
        });
        const { curveShift } = computeBallKinematics(aim, player);
        const zoneCol = aim.isPanenka ? ZONE_COLORS.panenka : (ZONE_COLORS[aim.zone] ?? ZONE_COLORS.golden);

        REUSABLE_COLOR.set(zoneCol.r, zoneCol.g, zoneCol.b, 200);
        const previewTargetX = aim.x + curveShift;
        const previewTargetY = aim.y + spread.skyLift;
        for (let i = 1; i <= 11; i++) {
            const p = 0.13 + i * 0.07;
            const [tx, ty] = flightPosition(previewTargetX, previewTargetY, curveShift, aim.power, aim.isPanenka, p);
            const r = 1.4 + i * 0.07;
            this.action.ellipse(tx, ty, r, r, REUSABLE_COLOR);
        }

        const jitterX = spread.pressureJitter * Math.sin(clock * 19.3) * GOAL_X_SCALE;
        const jitterY = spread.pressureJitter * Math.cos(clock * 15.7) * GOAL_Y_SCALE;
        const [rawCx, rawCy] = goalScreenPoint(previewTargetX, previewTargetY);
        const cx = clamp(rawCx + jitterX, 16, WIDTH - 16);
        const cy = clamp(rawCy + jitterY, 270, GOAL_Y + 8);
        const rx = clamp(spread.radiusX * GOAL_X_SCALE, 7, 68);
        const ry = clamp(spread.radiusY * GOAL_Y_SCALE, 7, 74);

        REUSABLE_FILL.set(zoneCol.r, zoneCol.g, zoneCol.b, 38);
        this.action.ellipse(cx, cy, rx, ry, REUSABLE_FILL);
        this.action.ellipseStroke(cx, cy, rx, ry, zoneCol, aim.zone === 'overload' ? 2.1 : 1.6);
        this.action.ellipse(cx, cy, 2.3, 2.3, zoneCol);

        this.action.line([[cx - rx - 4, cy], [cx - rx + 3, cy]], zoneCol, 1.3);
        this.action.line([[cx + rx - 3, cy], [cx + rx + 4, cy]], zoneCol, 1.3);
        this.action.line([[cx, cy - ry - 4], [cx, cy - ry + 3]], zoneCol, 1.3);
        this.action.line([[cx, cy + ry - 3], [cx, cy + ry + 4]], zoneCol, 1.3);
    }

    private drawImpact(shot: ResolvedShot, time: number): void {
        const [x, y] = goalScreenPoint(shot.landingX, shot.landingY);
        const spread = clamp(time / (FEEDBACK_SECONDS * 0.62), 0, 1);
        const source = IMPACT_COLORS[shot.outcome];
        REUSABLE_COLOR.set(source.r, source.g, source.b, Math.round(220 * (1 - spread)));
        this.action.ring(x, y, 9 + spread * 29, REUSABLE_COLOR, 1.4);
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const inner = 10 + spread * (20 + (i % 3) * 7);
            this.action.line(
                [[x + dx * inner, y + dy * inner], [x + dx * (inner + 4), y + dy * (inner + 4)]],
                REUSABLE_COLOR,
                1.5
            );
        }
    }
}
