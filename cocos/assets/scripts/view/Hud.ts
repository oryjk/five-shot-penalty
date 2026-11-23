import { Color, Label, Node, Sprite, SpriteFrame, UIOpacity } from 'cc';
import type { AdPlacementMeta } from '../core/AdManager';
import { clamp, ratingColorHex, SKILLS } from '../core/Attributes';
import type { Outcome } from '../core/KeeperAI';
import { PenaltyMatch, TOTAL_SHOTS } from '../core/PenaltyMatch';
import {
    canAdRetryDaily,
    canPlayFreeDaily,
    isNewbieProtected,
} from '../core/Progression';
import type { PlayerProgress, SettlementResult } from '../core/Progression';
import {
    getDivision,
    getFeaturedLoanLegend,
    getKeeperForLevel,
    getPlayerById,
    MAX_LEVEL,
} from '../core/Roster';
import { powerZoneColorHex, powerZoneLabel } from '../core/ShotPhysics';
import type { Aim, Point } from '../core/ShotPhysics';
import { child, color, createSprite, Drawing, HEIGHT, hitRect, Rect, text, WIDTH } from './Drawing';

export type ScreenMode = 'lobby' | 'roster' | 'match' | 'result';

export type HudAction =
    | 'sound'
    | 'start_match'
    | 'open_roster'
    | 'start_daily'
    | 'ad_loan_featured'
    | 'ad_scout_intel'
    | 'var_accept'
    | 'var_decline'
    | 'ad_double_xp'
    | 'ad_result_loan'
    | 'result_again'
    | 'result_lobby'
    | 'sim_ad_close'
    | 'sim_ad_claim';

const RED = color('#DC2626');
const RED_DEPTH = color('#7A1212');
const RED_EDGE = color('#FF8A80');
const DARK = color('#08111B');
const PANEL = color('#0B1726EC');
const CARD = color('#102033EC');
const LIGHT = color('#F6F9FC');
const MUTED = color('#95ABC2');
const EDGE = color('#3B5570');
const CYAN = color('#38E4FF');
const GREEN = color('#46E484');
const GOLD = color('#FFCA4B');
const GOLD_DEPTH = color('#9A6B0A');
const GOLD_LIGHT = color('#FFF2B2');
const TRACK = color('#1A2B3F');

const OUTCOME_STYLE: Record<Outcome, { label: string; fill: Color }> = {
    goal: { label: '进球', fill: color('#B8F7A8') },
    save: { label: '扑救', fill: color('#FFD28A') },
    miss: { label: '射偏', fill: color('#FF9C94') },
};

export interface SimAdState {
    readonly meta: AdPlacementMeta;
    readonly elapsed: number;
    readonly duration: number;
}

export class Hud {
    private readonly top: Node;
    private readonly center: Node;
    private readonly bottom: Node;
    private readonly modal: Node;

    // Top bar
    private readonly topBarDraw: Drawing;
    private readonly divBadgeLabel: Label;
    private readonly soundLabel: Label;

    // Lobby nodes
    private readonly lobbyTop: Node;
    private readonly lobbyTopDraw: Drawing;
    private readonly lobbyDivTitle: Label;
    private readonly lobbyCareerStat: Label;
    private readonly lobbyXpText: Label;
    private readonly keeperHeaderLabel: Label;
    private readonly keeperStyleLabel: Label;
    private readonly keeperStatsLine: Label;
    private readonly keeperWeaknessLabel: Label;

    private readonly lobbyBottom: Node;
    private readonly lobbyBottomDraw: Drawing;
    private readonly lobbyPortrait: Sprite;
    private readonly lineupSummaryLabel: Label;
    private readonly lineupSubLabel: Label;
    private readonly adHookLoanLabel: Label;
    private readonly adHookScoutLabel: Label;
    private readonly startBtnLabel: Label;
    private readonly dailyBtnLabel: Label;

    // Match HUD nodes
    private readonly matchTop: Node;
    private readonly matchTopDraw: Drawing;
    private readonly matchMarks: Drawing;
    private readonly matchPortrait: Sprite;
    private readonly matchGoalLabel: Label;
    private readonly matchGoalTargetLabel: Label;
    private readonly shooterNameLabel: Label;
    private readonly shooterMetaLabel: Label;
    private readonly shooterBadgeLabel: Label;

    private readonly matchBottom: Node;
    private readonly meterDraw: Drawing;
    private readonly techLabel: Label;
    private readonly hintDetailLabel: Label;

    // Verdict feedback
    private readonly feedbackNode: Node;
    private readonly feedbackFade: UIOpacity;
    private readonly feedbackDraw: Drawing;
    private readonly feedbackTitle: Label;
    private readonly feedbackSub: Label;

    // S1 VAR Mulligan Modal
    private readonly varNode: Node;
    private readonly varDraw: Drawing;
    private readonly varSubLabel: Label;

    // Result screen
    private readonly resultNode: Node;
    private readonly resultDraw: Drawing;
    private readonly resultMarks: Drawing;
    private readonly resultTitleLabel: Label;
    private readonly resultGoalsLabel: Label;
    private readonly resultSubStatsLabel: Label;
    private readonly resultHighlightsLabel: Label;
    private readonly resultXpLabel: Label;
    private readonly resultShotLabels: Label[] = [];
    private readonly resultDoubleBtnLabel: Label;
    private readonly resultAgainBtnLabel: Label;

    // Simulated Rewarded Video Modal
    private readonly simAdNode: Node;
    private readonly simAdDraw: Drawing;
    private readonly simAdTitle: Label;
    private readonly simAdDesc: Label;
    private readonly simAdProgressText: Label;
    private readonly simAdClaimLabel: Label;
    private lastSimAdStep = -1;

    // Toast
    private readonly toastNode: Node;
    private readonly toastFade: UIOpacity;
    private readonly toastDraw: Drawing;
    private readonly toastLabel: Label;
    private toastTimer = 0;

    private readonly portraits = new Map<string, SpriteFrame>();

    private topOffset = 0;
    private bottomOffset = 0;
    private statusKey = '';
    private powerKey = '';

    // 交互矩形（坐标与绘制严格一致）
    private readonly soundRect: Rect = { x: 308, y: 89, w: 66, h: 30 };
    private readonly lineupCardRect: Rect = { x: 16, y: 598, w: 358, h: 52 };
    private readonly adLoanRect: Rect = { x: 16, y: 656, w: 175, h: 36 };
    private readonly adScoutRect: Rect = { x: 199, y: 656, w: 175, h: 36 };
    private readonly startBtnRect: Rect = { x: 16, y: 700, w: 358, h: 52 };
    private readonly rosterBtnRect: Rect = { x: 16, y: 762, w: 175, h: 42 };
    private readonly dailyBtnRect: Rect = { x: 199, y: 762, w: 175, h: 42 };

    private readonly varAcceptRect: Rect = { x: 42, y: 590, w: 306, h: 46 };
    private readonly varDeclineRect: Rect = { x: 96, y: 646, w: 198, h: 34 };

    private readonly resDoubleRect: Rect = { x: 26, y: 664, w: 338, h: 42 };
    private readonly resAgainRect: Rect = { x: 26, y: 716, w: 338, h: 46 };
    private readonly resRosterRect: Rect = { x: 26, y: 772, w: 164, h: 36 };
    private readonly resLobbyRect: Rect = { x: 200, y: 772, w: 164, h: 36 };

    private readonly simCloseRect: Rect = { x: 48, y: 454, w: 138, h: 38 };
    private readonly simClaimRect: Rect = { x: 204, y: 454, w: 138, h: 38 };

    private showLoanHook = false;
    private showScoutHook = false;
    private showDoubleHook = false;
    private showResultLoanHook = false;

    constructor(parent: Node, brand?: SpriteFrame) {
        this.top = child(parent, 'Top safe-area HUD');
        this.center = child(parent, 'Center overlay HUD');
        this.bottom = child(parent, 'Bottom safe-area HUD');
        // 最顶层弹窗层：确保激励视频/VAR/Toast 永远盖在结算页与名册页上方
        this.modal = child(parent, 'Topmost Modal Layer');

        // 1. 顶部转播品牌栏
        this.topBarDraw = new Drawing(this.top, 'Top bar');
        this.topBarDraw.chamferBox(16, 89, 32, 29, 5, LIGHT);
        if (brand) createSprite(this.top, 'Brand mark', 32, 104, 24, 18, brand);
        text(this.top, 'Brand name', '足球洞察', 55, 104, 14, LIGHT, 'left', 72, true, true);
        this.topBarDraw.slantBox(132, 92, 114, 24, 6, color('#112336DC'), color('#3A5775'), 1);
        this.divBadgeLabel = text(this.top, 'Div badge', 'Lv.1 街头青训', 189, 104, 11, GOLD, 'center', 108, true);
        this.topBarDraw.chamferBox(308, 89, 66, 30, 6, color('#112336DC'), EDGE, 1.1);
        this.soundLabel = text(this.top, 'Sound toggle', '声音开', 341, 104, 11.5, LIGHT, 'center', 62, true);

        // 2. 大厅顶部：精简转播段位条 + 紧凑对手球探条（把夜场球门与门将彻底露出来！）
        this.lobbyTop = child(this.top, 'Lobby top broadcast');
        this.lobbyTopDraw = new Drawing(this.lobbyTop, 'Lobby top draw');
        this.lobbyDivTitle = text(this.lobbyTop, 'Lobby div', 'Lv.1 街头青训', 32, 147, 16, LIGHT, 'left', 176, true, true);
        this.lobbyCareerStat = text(this.lobbyTop, 'Lobby career', '生涯 0 球', 362, 147, 10.5, MUTED, 'right', 164, true);
        this.lobbyXpText = text(this.lobbyTop, 'Lobby xp', '0 / 220 XP', 32, 179, 10.5, CYAN, 'left', 330, true);

        // 紧凑转播风 VS 对手条（y=198..272，完全不压迫夜场灯光与球门）
        this.keeperHeaderLabel = text(this.lobbyTop, 'GK header', 'VS 张磊 · OVR 60', 32, 215, 13.5, LIGHT, 'left', 220, true, true);
        this.keeperStyleLabel = text(this.lobbyTop, 'GK style', '新手反应型', 360, 215, 10.5, GOLD, 'right', 110, true);
        this.keeperStatsLine = text(this.lobbyTop, 'GK stats', '', 32, 236, 10.5, color('#C9DDF0'), 'left', 332, true);
        this.keeperWeaknessLabel = text(this.lobbyTop, 'GK weak', '', 32, 255, 10.5, CYAN, 'left', 334);
        this.keeperWeaknessLabel.overflow = Label.Overflow.SHRINK;
        this.keeperWeaknessLabel.enableWrapText = false;

        // 3. 大厅底部：真实球员头像阵容条 + 3D 实体立体按钮
        this.lobbyBottom = child(this.bottom, 'Lobby bottom deck');
        this.lobbyBottomDraw = new Drawing(this.lobbyBottom, 'Lobby dock draw');
        this.lobbyPortrait = createSprite(this.lobbyBottom, 'Captain portrait', 44, 624, 42, 42);
        this.lineupSummaryLabel = text(this.lobbyBottom, 'Lineup summary', '', 74, 616, 12.5, LIGHT, 'left', 240, true);
        this.lineupSummaryLabel.overflow = Label.Overflow.SHRINK;
        this.lineupSummaryLabel.enableWrapText = false;
        this.lineupSubLabel = text(this.lobbyBottom, 'Lineup sub', '', 74, 634, 10, MUTED, 'left', 242);
        this.lineupSubLabel.overflow = Label.Overflow.SHRINK;
        this.lineupSubLabel.enableWrapText = false;
        text(this.lobbyBottom, 'Lineup edit', '阵型 ›', 362, 624, 11.5, CYAN, 'right', 56, true);

        this.adHookLoanLabel = text(this.lobbyBottom, 'Ad loan', '', 103.5, 673, 11, DARK, 'center', 168, true);
        this.adHookScoutLabel = text(this.lobbyBottom, 'Ad scout', '', 286.5, 673, 11, CYAN, 'center', 168, true);
        this.startBtnLabel = text(this.lobbyBottom, 'Start btn', '开始 5 球挑战 →', 195, 725, 18.5, LIGHT, 'center', 334, true, true);
        text(this.lobbyBottom, 'Roster btn', '球星素质表', 103.5, 782, 13.5, LIGHT, 'center', 166, true);
        this.dailyBtnLabel = text(this.lobbyBottom, 'Daily btn', '每日传奇', 286.5, 782, 12.5, GOLD, 'center', 166, true);

        // 4. 实战顶部转播记分牌 + 带真实头像的主罚铭牌
        this.matchTop = child(this.top, 'Match scoreboard');
        this.matchTopDraw = new Drawing(this.matchTop, 'Match top draw');
        this.matchMarks = new Drawing(this.matchTop, 'Shot marks');
        this.matchPortrait = createSprite(this.matchTop, 'Kicker portrait', 42, 203, 36, 36);
        this.matchGoalLabel = text(this.matchTop, 'Goals', '0', 316, 152, 25, LIGHT, 'right', 46, true, true);
        this.matchGoalTargetLabel = text(this.matchTop, 'Target', '/ 5', 362, 154, 12, MUTED, 'right', 56, true);
        this.shooterNameLabel = text(this.matchTop, 'Shooter name', '', 68, 195, 13, LIGHT, 'left', 202, true, true);
        this.shooterNameLabel.overflow = Label.Overflow.SHRINK;
        this.shooterNameLabel.enableWrapText = false;
        this.shooterMetaLabel = text(this.matchTop, 'Shooter meta', '', 68, 212, 10, MUTED, 'left', 210);
        this.shooterMetaLabel.overflow = Label.Overflow.SHRINK;
        this.shooterMetaLabel.enableWrapText = false;
        this.shooterBadgeLabel = text(this.matchTop, 'Shooter badge', '', 362, 203, 10.5, GOLD, 'right', 96, true);

        // 5. 实战底部切角发力槽
        this.matchBottom = child(this.bottom, 'Match controls');
        const bottomCard = new Drawing(this.matchBottom, 'Control card');
        bottomCard.chamferBox(16, 720, 358, 88, 10, PANEL, color('#324B65'), 1.2);
        this.techLabel = text(this.matchBottom, 'Tech hint', '向上滑动射门', 195, 742, 15.5, LIGHT, 'center', 336, true, true);
        this.hintDetailLabel = text(this.matchBottom, 'Hint detail', '弯划香蕉球 · 变向骗门将 · 轻划中路勺子', 195, 791, 10, MUTED, 'center', 340);
        this.meterDraw = new Drawing(this.matchBottom, 'Power meter');

        // 6. 单球技术复盘转播芯片
        this.feedbackNode = child(this.center, 'Verdict feedback');
        this.feedbackFade = this.feedbackNode.addComponent(UIOpacity);
        this.feedbackDraw = new Drawing(this.feedbackNode, 'Verdict chip');
        this.feedbackTitle = text(this.feedbackNode, 'Verdict title', '', 195, 566, 19, LIGHT, 'center', 300, true, true);
        this.feedbackTitle.overflow = Label.Overflow.SHRINK;
        this.feedbackTitle.enableWrapText = false;
        this.feedbackSub = text(this.feedbackNode, 'Verdict sub', '', 195, 591, 11.5, MUTED, 'center', 306);
        this.feedbackSub.overflow = Label.Overflow.SHRINK;
        this.feedbackSub.enableWrapText = false;
        this.feedbackNode.active = false;

        // 7. S1 VAR 重罚浮层（挂在最顶层 modal）
        this.varNode = child(this.modal, 'VAR Mulligan Modal');
        this.varDraw = new Drawing(this.varNode, 'VAR panel');
        this.varDraw.box(0, 0, WIDTH, HEIGHT, color('#04091288'));
        this.varDraw.chamferBox(24, 488, 342, 206, 14, color('#0A1524FA'), GOLD, 1.8);
        this.varDraw.slantBox(128, 500, 134, 24, 6, color('#F59E0B38'), GOLD, 1.1);
        text(this.varNode, 'VAR tag', 'VAR 裁判介入', 195, 512, 12, GOLD, 'center', 120, true);
        text(this.varNode, 'VAR head', '疑似门将提前移动！', 195, 545, 19, LIGHT, 'center', 310, true, true);
        this.varSubLabel = text(this.varNode, 'VAR sub', '观看视频立即重罚这一球（本局限 1 次）', 195, 570, 11.5, MUTED, 'center', 310);
        this.varDraw.gameButton(42, 590, 306, 44, GOLD, GOLD_DEPTH, GOLD_LIGHT, 8, 4);
        text(this.varNode, 'VAR accept', '🎬 看视频 · VAR 重罚本球', 195, 611, 15.5, DARK, 'center', 296, true);
        this.varDraw.chamferBox(96, 646, 198, 34, 7, color('#142436'), EDGE, 1);
        text(this.varNode, 'VAR decline', '接受结果继续', 195, 663, 12, MUTED, 'center', 180, true);
        this.varNode.active = false;

        // 8. 赛后结算切角转播卡
        this.resultNode = child(this.bottom, 'Result settlement');
        this.resultDraw = new Drawing(this.resultNode, 'Result bg');
        this.resultTitleLabel = text(this.resultNode, 'Res title', '本局结束', 195, 418, 18.5, LIGHT, 'center', 334, true, true);
        this.resultTitleLabel.overflow = Label.Overflow.SHRINK;
        this.resultTitleLabel.enableWrapText = false;
        this.resultGoalsLabel = text(this.resultNode, 'Res goals', '3 / 5', 195, 466, 44, LIGHT, 'center', 320, true, true);
        this.resultGoalsLabel.overflow = Label.Overflow.SHRINK;
        this.resultGoalsLabel.enableWrapText = false;
        this.resultSubStatsLabel = text(this.resultNode, 'Res stats', '', 195, 505, 12, CYAN, 'center', 334, true);
        this.resultSubStatsLabel.overflow = Label.Overflow.SHRINK;
        this.resultSubStatsLabel.enableWrapText = false;
        this.resultHighlightsLabel = text(this.resultNode, 'Res highlights', '', 195, 527, 11, GOLD, 'center', 334);
        this.resultHighlightsLabel.overflow = Label.Overflow.SHRINK;
        this.resultHighlightsLabel.enableWrapText = false;
        this.resultMarks = new Drawing(this.resultNode, 'Res marks');
        for (let i = 0; i < TOTAL_SHOTS; i++) {
            this.resultShotLabels.push(text(this.resultNode, 'RS' + i, '', 67 + i * 64, 588, 11, MUTED, 'center', 60, true));
        }
        this.resultXpLabel = text(this.resultNode, 'Res xp', '', 195, 620, 11.5, LIGHT, 'center', 334, true);
        this.resultXpLabel.overflow = Label.Overflow.SHRINK;
        this.resultXpLabel.enableWrapText = false;
        this.resultDoubleBtnLabel = text(this.resultNode, 'Res double', '', 195, 684, 13, DARK, 'center', 326, true);
        this.resultDoubleBtnLabel.overflow = Label.Overflow.SHRINK;
        this.resultDoubleBtnLabel.enableWrapText = false;
        this.resultAgainBtnLabel = text(this.resultNode, 'Res again', '再来一局 →', 195, 738, 17.5, LIGHT, 'center', 324, true, true);
        this.resultAgainBtnLabel.overflow = Label.Overflow.SHRINK;
        this.resultAgainBtnLabel.enableWrapText = false;
        text(this.resultNode, 'Res roster', '球星素质表', 108, 790, 12.5, CYAN, 'center', 156, true);
        text(this.resultNode, 'Res lobby', '返回大厅', 282, 790, 12.5, LIGHT, 'center', 156, true);
        this.resultNode.active = false;

        // 9. Web/编辑器 模拟激励视频预览弹窗（最顶层 modal，零遮挡）
        this.simAdNode = child(this.modal, 'Simulated Rewarded Video');
        this.simAdDraw = new Drawing(this.simAdNode, 'Sim ad draw');
        this.simAdTitle = text(this.simAdNode, 'Sim title', '激励视频广告', 195, 326, 16.5, GOLD, 'center', 304, true);
        this.simAdTitle.overflow = Label.Overflow.SHRINK;
        this.simAdTitle.enableWrapText = false;
        this.simAdDesc = text(this.simAdNode, 'Sim desc', '', 195, 356, 12, LIGHT, 'center', 296);
        this.simAdProgressText = text(this.simAdNode, 'Sim prog', '', 195, 424, 11.5, CYAN, 'center', 296, true);
        text(this.simAdNode, 'Sim close', '提前关闭(无奖励)', 117, 473, 11.5, MUTED, 'center', 132, true);
        this.simAdClaimLabel = text(this.simAdNode, 'Sim claim', '观看中...', 273, 473, 12.5, DARK, 'center', 132, true);
        this.simAdNode.active = false;

        // 10. 顶部 Toast（最顶层 modal）
        this.toastNode = child(this.modal, 'Toast');
        this.toastFade = this.toastNode.addComponent(UIOpacity);
        this.toastDraw = new Drawing(this.toastNode, 'Toast bg');
        this.toastDraw.chamferBox(30, 130, 330, 34, 8, color('#091928F6'), CYAN, 1.4);
        this.toastLabel = text(this.toastNode, 'Toast text', '', 195, 147, 12, LIGHT, 'center', 306, true);
        this.toastLabel.overflow = Label.Overflow.SHRINK;
        this.toastLabel.enableWrapText = false;
        this.toastNode.active = false;
    }

    setPortrait(playerId: string, frame: SpriteFrame): void {
        this.portraits.set(playerId, frame);
        this.statusKey = '';
    }

    layout(topInset: number, bottomInset: number): void {
        this.topOffset = Math.max(0, topInset - 84);
        this.bottomOffset = Math.min(0, bottomInset - 822);
        this.top.setPosition(0, -this.topOffset);
        this.bottom.setPosition(0, -this.bottomOffset);
    }

    showToast(message: string): void {
        this.toastLabel.string = message;
        this.toastTimer = 2.3;
        this.toastNode.active = true;
        this.toastFade.opacity = 255;
    }

    private drawMark(draw: Drawing, x: number, y: number, outcome?: Outcome, active = false, golden = false): void {
        const r = 11;
        const fill = outcome ? OUTCOME_STYLE[outcome].fill : active ? (golden ? GOLD : RED) : EDGE;
        draw.ellipse(x, y, r, r, fill);
        if (!active) draw.ellipse(x, y, r - 1.3, r - 1.3, DARK);
        if (outcome === 'goal') {
            draw.line([[x - 4, y], [x - 1, y + 3.5], [x + 5, y - 4]], fill, 1.8);
        } else if (outcome === 'save') {
            draw.line(
                [[x - 4.5, y - 4], [x + 4.5, y - 4], [x + 3.5, y + 2], [x, y + 5.2], [x - 3.5, y + 2], [x - 4.5, y - 4]],
                fill,
                1.5
            );
        } else if (outcome === 'miss') {
            draw.line([[x - 3.5, y - 3.5], [x + 3.5, y + 3.5]], fill, 1.65);
            draw.line([[x - 3.5, y + 3.5], [x + 3.5, y - 3.5]], fill, 1.65);
        } else {
            draw.ellipse(x, y, 2.3, 2.3, active ? LIGHT : MUTED);
        }
    }

    refresh(
        screen: ScreenMode,
        progress: PlayerProgress,
        match: PenaltyMatch | null,
        loanedPlayerId: string | null,
        loanMatchesRemaining: number,
        scoutIntelQueued: boolean,
        settlement: SettlementResult | null,
        doubleXpClaimed: boolean
    ): void {
        const div = getDivision(progress.level);

        const key = [
            screen,
            progress.level,
            progress.xp,
            progress.promoReady,
            progress.muted,
            progress.lineupMode,
            progress.squadIds.join(','),
            progress.soloPlayerId,
            progress.totalMatches,
            progress.dailyTriesUsed,
            loanedPlayerId ?? '',
            loanMatchesRemaining,
            scoutIntelQueued,
            match?.stage ?? '',
            match?.results.join(',') ?? '',
            match?.suddenDeath ?? false,
            match?.currentShotNumber ?? 0,
            match?.scoutHintsRemaining ?? 0,
            doubleXpClaimed,
            settlement?.promoted ?? false,
            this.portraits.size,
        ].join('|');

        if (key === this.statusKey) return;
        this.statusKey = key;

        const hideMainHud = screen === 'roster';
        this.top.active = !hideMainHud;
        this.lobbyTop.active = screen === 'lobby';
        this.lobbyBottom.active = screen === 'lobby';
        this.matchTop.active = screen === 'match';
        this.matchBottom.active = screen === 'match' && match?.stage !== 'var_offer' && match?.stage !== 'complete';
        this.feedbackNode.active = screen === 'match' && match?.stage === 'feedback';
        this.varNode.active = screen === 'match' && match?.stage === 'var_offer';
        this.resultNode.active = screen === 'result';

        this.divBadgeLabel.string = `Lv.${div.level} ${div.name}`;
        this.divBadgeLabel.color = color(div.badgeColor);
        this.soundLabel.string = progress.muted ? '声音关' : '声音开';

        if (screen === 'lobby') {
            this.renderLobby(progress, loanedPlayerId, loanMatchesRemaining, scoutIntelQueued);
        } else if (screen === 'match' && match) {
            this.renderMatchHud(match);
        } else if (screen === 'result' && match && settlement) {
            this.renderResult(progress, match, settlement, loanedPlayerId, doubleXpClaimed);
        }
    }

    private renderLobby(
        progress: PlayerProgress,
        loanedPlayerId: string | null,
        loanMatchesRemaining: number,
        scoutIntelQueued: boolean
    ): void {
        const div = getDivision(progress.level);
        const keeper = getKeeperForLevel(progress.level);
        const newbie = isNewbieProtected(progress);

        this.lobbyTopDraw.clear();
        // 段位斜切转播条
        this.lobbyTopDraw.chamferBox(16, 130, 358, 62, 10, PANEL, progress.promoReady ? GOLD : EDGE, progress.promoReady ? 1.5 : 1.1);
        this.lobbyTopDraw.slantBox(16, 130, 8, 62, 0, color(div.badgeColor));

        this.lobbyDivTitle.string = `Lv.${div.level} ${div.name}`;
        this.lobbyDivTitle.color = color(div.badgeColor);
        this.lobbyCareerStat.string = `生涯 ${progress.totalGoals} 球 · 极速 ${progress.topSpeedKmh || '--'} km/h`;

        const xpRatio = progress.level >= MAX_LEVEL ? 1 : progress.xp / div.xpToPromote;
        this.lobbyTopDraw.segmentedBar(32, 161, 330, 7, xpRatio, 18, TRACK, progress.promoReady ? GOLD : CYAN);
        if (progress.level >= MAX_LEVEL) {
            this.lobbyXpText.string = `殿堂大师声望 ${progress.xp} · 全 16 名球星已永久签约`;
            this.lobbyXpText.color = GOLD;
        } else if (progress.promoReady) {
            this.lobbyXpText.string = `🏆 晋级战已就绪 · 进 ≥${div.promoTarget} 球升至 Lv.${div.level + 1}`;
            this.lobbyXpText.color = GOLD;
        } else {
            this.lobbyXpText.string = `升段经验 ${progress.xp} / ${div.xpToPromote}`;
            this.lobbyXpText.color = CYAN;
        }

        // 紧凑转播 VS 门将条（把夜场球门完全让出来！）
        this.lobbyTopDraw.chamferBox(16, 198, 358, 72, 10, color('#0B1624DC'), color('#415C78'), 1.1);
        this.lobbyTopDraw.slantBox(16, 198, 8, 72, 0, RED);
        this.keeperHeaderLabel.string = `VS ${keeper.name}  ·  OVR ${keeper.ovr}`;
        this.keeperStyleLabel.string = keeper.styleLabel;
        this.keeperStatsLine.string = `反应 ${keeper.stats.reflex}   臂展 ${keeper.stats.reach}   预判 ${keeper.stats.anticipation}   威慑 ${keeper.stats.intimidation}`;
        this.keeperWeaknessLabel.string = keeper.weaknessHint;

        // 底部阵容条 + 实体 3D 按钮
        this.lobbyBottomDraw.clear();
        this.lobbyBottomDraw.chamferBox(16, 598, 358, 52, 10, PANEL, loanedPlayerId ? GOLD : EDGE, loanedPlayerId ? 1.5 : 1.1);

        const captainId = loanedPlayerId ?? (progress.lineupMode === 'solo' ? progress.soloPlayerId : progress.squadIds[4]);
        const capFrame = this.portraits.get(captainId) ?? null;
        this.lobbyPortrait.spriteFrame = capFrame;
        this.lobbyPortrait.node.active = Boolean(capFrame);
        this.lobbyBottomDraw.strokeBox(23, 603, 42, 42, loanedPlayerId ? GOLD : CYAN, 0, 1.4);

        if (loanedPlayerId) {
            const legend = getPlayerById(loanedPlayerId);
            this.lineupSummaryLabel.string = `★ 传奇租借(剩${loanMatchesRemaining}场) · ${legend.shortName} ${legend.ovr}`;
            this.lineupSummaryLabel.color = GOLD;
            this.lineupSubLabel.string = '1/3/5 号核心位出战';
        } else if (progress.lineupMode === 'squad') {
            const anchor = getPlayerById(progress.squadIds[4]);
            const avg = Math.round(progress.squadIds.reduce((sum, id) => sum + getPlayerById(id).ovr, 0) / 5);
            this.lineupSummaryLabel.string = `5人点球阵 · 均分 OVR ${avg}`;
            this.lineupSummaryLabel.color = LIGHT;
            this.lineupSubLabel.string = `压轴第5球：${anchor.name} (${anchor.ovr})`;
        } else {
            const solo = getPlayerById(progress.soloPlayerId);
            this.lineupSummaryLabel.string = `单人主力 · ${solo.name} (${solo.ovr})`;
            this.lineupSummaryLabel.color = LIGHT;
            this.lineupSubLabel.string = `${solo.position} · ${solo.foot === 'L' ? '左脚' : '右脚'} · ${solo.title}`;
        }

        // S2 / S4 赛前可选激励钩子（首局免广告保护）
        this.showLoanHook = !newbie && progress.level < MAX_LEVEL;
        this.showScoutHook = !newbie && progress.level >= 2;
        this.adHookLoanLabel.node.active = this.showLoanHook;
        this.adHookScoutLabel.node.active = this.showScoutHook;

        if (this.showLoanHook) {
            const feat = getFeaturedLoanLegend(progress.level);
            const r = this.adLoanRect;
            if (loanedPlayerId) {
                this.lobbyBottomDraw.chamferBox(r.x, r.y, r.w, r.h, 7, color('#143B32EC'), GREEN, 1.2);
                this.adHookLoanLabel.string = `✓ 传奇租借·剩${loanMatchesRemaining}场`;
                this.adHookLoanLabel.color = GREEN;
            } else {
                this.lobbyBottomDraw.gameButton(r.x, r.y, r.w, r.h - 2, GOLD, GOLD_DEPTH, GOLD_LIGHT, 7, 3);
                this.adHookLoanLabel.string = `🎬 租借${feat.ovr}传奇×2场`;
                this.adHookLoanLabel.color = DARK;
            }
        }
        if (this.showScoutHook) {
            const r = this.adScoutRect;
            if (scoutIntelQueued) {
                this.lobbyBottomDraw.chamferBox(r.x, r.y, r.w, r.h, 7, color('#143B32EC'), GREEN, 1.2);
                this.adHookScoutLabel.string = '✓ 球探情报已激活';
                this.adHookScoutLabel.color = GREEN;
            } else {
                this.lobbyBottomDraw.chamferBox(r.x, r.y, r.w, r.h, 7, color('#112D44EC'), CYAN, 1.2);
                this.adHookScoutLabel.string = '🎬 球探情报(-18%散布)';
                this.adHookScoutLabel.color = CYAN;
            }
        }

        // 主 3D 实体游戏按钮
        const sr = this.startBtnRect;
        if (progress.promoReady) {
            this.lobbyBottomDraw.gameButton(sr.x, sr.y, sr.w, sr.h - 3, GOLD, GOLD_DEPTH, GOLD_LIGHT, 10, 4);
            this.startBtnLabel.string = `开始 Lv.${div.level} 晋级战 (进≥${div.promoTarget}球) →`;
            this.startBtnLabel.color = DARK;
        } else {
            this.lobbyBottomDraw.gameButton(sr.x, sr.y, sr.w, sr.h - 3, RED, RED_DEPTH, RED_EDGE, 10, 4);
            this.startBtnLabel.string = '开始 5 球挑战 →';
            this.startBtnLabel.color = LIGHT;
        }

        // 次级金属切角按钮
        const rr = this.rosterBtnRect;
        this.lobbyBottomDraw.gameButton(rr.x, rr.y, rr.w, rr.h - 2, color('#132C44'), color('#0A1828'), CYAN, 8, 3);
        const dr = this.dailyBtnRect;
        this.lobbyBottomDraw.gameButton(dr.x, dr.y, dr.w, dr.h - 2, color('#252014'), color('#120E06'), GOLD, 8, 3);
        if (canPlayFreeDaily(progress)) {
            this.dailyBtnLabel.string = '每日传奇 · 免费';
            this.dailyBtnLabel.color = GOLD;
        } else if (canAdRetryDaily(progress)) {
            this.dailyBtnLabel.string = '🎬 每日传奇 · 再战';
            this.dailyBtnLabel.color = GOLD;
        } else {
            this.dailyBtnLabel.string = `每日最佳 ${progress.dailyBestGoals}/5`;
            this.dailyBtnLabel.color = MUTED;
        }
    }

    private renderMatchHud(match: PenaltyMatch): void {
        this.matchTopDraw.clear();
        this.matchMarks.clear();

        // 欧冠转播风顶部记分牌
        this.matchTopDraw.chamferBox(16, 130, 358, 44, 8, PANEL, match.suddenDeath ? GOLD : EDGE, match.suddenDeath ? 1.6 : 1.1);
        this.matchTopDraw.slantBox(16, 130, 7, 44, 0, match.suddenDeath ? GOLD : RED);
        this.matchTopDraw.line([[228, 139], [228, 165]], EDGE, 1.2);

        const results = match.results;
        const totalDots = match.suddenDeath ? TOTAL_SHOTS + 1 : TOTAL_SHOTS;
        const step = totalDots === 6 ? 30 : 35;
        for (let i = 0; i < totalDots; i++) {
            this.drawMark(this.matchMarks, 42 + i * step, 152, results[i], i === results.length, i === 5);
        }

        this.matchGoalLabel.string = String(match.goals);
        this.matchGoalTargetLabel.string = match.suddenDeath
            ? '突然死亡'
            : match.mode === 'promotion'
                ? `目标≥${match.promoTarget}`
                : '/ 5 球';
        this.matchGoalTargetLabel.color = match.suddenDeath ? GOLD : MUTED;

        // 带真实球员头像的主罚转播条
        const p = match.currentPlayer;
        const ovrHex = ratingColorHex(p.ovr);
        const isLoan = match.loanedPlayerId === p.id;
        this.matchTopDraw.chamferBox(16, 180, 358, 46, 8, color('#0A1624E8'), isLoan ? GOLD : color(ovrHex), 1.2);

        const pFrame = this.portraits.get(p.id) ?? null;
        this.matchPortrait.spriteFrame = pFrame;
        this.matchPortrait.node.active = Boolean(pFrame);
        this.matchTopDraw.strokeBox(24, 185, 36, 36, isLoan ? GOLD : color(ovrHex), 0, 1.2);

        this.shooterNameLabel.string = `#${p.number} ${p.name} · OVR ${p.ovr}`;
        this.shooterNameLabel.color = color(ovrHex);
        const skillTxt = p.skills.length > 0 ? p.skills.map(s => SKILLS[s].shortName).join('/') : '均衡型';
        this.shooterMetaLabel.string = `${p.foot === 'L' ? '左脚' : '右脚'} · 精${p.stats.finishing} 力${p.stats.power} 弧${p.stats.curl} · [${skillTxt}]`;

        if (match.suddenDeath) {
            this.shooterBadgeLabel.string = '⚡ 突然死亡';
            this.shooterBadgeLabel.color = GOLD;
        } else if (isLoan) {
            this.shooterBadgeLabel.string = '★ 租借传奇';
            this.shooterBadgeLabel.color = GOLD;
        } else if (match.scoutHintsRemaining > 0) {
            this.shooterBadgeLabel.string = `情报×${match.scoutHintsRemaining}`;
            this.shooterBadgeLabel.color = CYAN;
        } else if (match.isClutchShot) {
            this.shooterBadgeLabel.string = '赛点高压';
            this.shooterBadgeLabel.color = RED_EDGE;
        } else {
            this.shooterBadgeLabel.string = `第 ${match.currentShotNumber} 球`;
            this.shooterBadgeLabel.color = MUTED;
        }

        // 单球技术复盘转播芯片
        if (match.stage === 'feedback' && match.shot) {
            const s = match.shot;
            const style = OUTCOME_STYLE[s.outcome];
            this.feedbackTitle.string = s.verdictTitle;
            this.feedbackTitle.color = style.fill;
            this.feedbackSub.string = s.verdictSubtitle;
            this.feedbackDraw.clear();
            this.feedbackDraw.chamferBox(34, 546, 322, 62, 12, color('#091524F5'), style.fill, 1.8);
            this.feedbackDraw.slantBox(34, 546, 8, 62, 0, style.fill);
        }

        if (match.stage === 'var_offer') {
            this.varSubLabel.string = match.suddenDeath
                ? '突然死亡决胜球！看视频立即重罚本球'
                : '观看激励视频可申请重罚这一球（本局限 1 次）';
        }
    }

    private renderResult(
        progress: PlayerProgress,
        match: PenaltyMatch,
        settlement: SettlementResult,
        loanedPlayerId: string | null,
        doubleXpClaimed: boolean
    ): void {
        this.resultDraw.clear();
        this.resultMarks.clear();
        this.resultDraw.chamferBox(16, 386, 358, 430, 14, color('#0B1726F9'), settlement.promoted ? GOLD : EDGE, settlement.promoted ? 1.8 : 1.3);
        this.resultDraw.slantBox(16, 386, 358, 4, 0, settlement.promoted ? GOLD : RED);

        if (settlement.promoted) {
            this.resultTitleLabel.string = match.suddenDeath
                ? `⚡ 加赛绝杀！晋级 Lv.${settlement.newLevel} ${getDivision(settlement.newLevel).name}`
                : `🎉 晋级 Lv.${settlement.newLevel} ${getDivision(settlement.newLevel).name}！`;
            this.resultTitleLabel.color = GOLD;
        } else if (match.regulationGoals === 5) {
            this.resultTitleLabel.string = '🏆 5 / 5 完美大满贯！';
            this.resultTitleLabel.color = GOLD;
        } else if (match.mode === 'promotion') {
            this.resultTitleLabel.string = match.suddenDeath
                ? '突然死亡加赛惜败 · 保留晋级资格'
                : '晋级赛惜败 · 保留晋级资格';
            this.resultTitleLabel.color = color('#FFB4A2');
        } else if (match.mode === 'daily') {
            this.resultTitleLabel.string = '每日传奇挑战结算';
            this.resultTitleLabel.color = CYAN;
        } else {
            this.resultTitleLabel.string = '本局挑战结束';
            this.resultTitleLabel.color = LIGHT;
        }

        // 大号比分始终保持纯数字（如 2 / 5），突然死亡状态放在标题与副文案中，彻底避免大字换行裁剪
        this.resultGoalsLabel.string = `${match.regulationGoals} / 5`;
        const xpShown = doubleXpClaimed ? settlement.breakdown.totalXp * 2 : settlement.breakdown.totalXp;
        this.resultSubStatsLabel.string = `最高球速 ${match.maxSpeedKmh} km/h  ·  声望 +${xpShown} XP${doubleXpClaimed ? ' (×2!)' : ''}`;

        if (settlement.newlyUnlocked.length > 0) {
            this.resultHighlightsLabel.string = `永久解锁：${settlement.newlyUnlocked.map(p => `${p.name}(${p.ovr})`).join(' · ')}`;
            this.resultHighlightsLabel.color = GREEN;
        } else if (settlement.breakdown.highlights.length > 0) {
            this.resultHighlightsLabel.string = settlement.breakdown.highlights.join('  ·  ');
            this.resultHighlightsLabel.color = GOLD;
        } else {
            this.resultHighlightsLabel.string = '控在黄金发力区 · 善用香蕉球与假动作更稳破门';
            this.resultHighlightsLabel.color = MUTED;
        }

        const results = match.results.slice(0, TOTAL_SHOTS);
        for (let i = 0; i < TOTAL_SHOTS; i++) {
            const outcome = results[i];
            this.drawMark(this.resultMarks, 67 + i * 64, 563, outcome);
            if (outcome) {
                this.resultShotLabels[i].string = OUTCOME_STYLE[outcome].label;
                this.resultShotLabels[i].color = OUTCOME_STYLE[outcome].fill;
            }
        }

        // XP 斜切分格进度条
        const div = getDivision(progress.level);
        const ratio = progress.level >= MAX_LEVEL ? 1 : progress.xp / div.xpToPromote;
        this.resultDraw.segmentedBar(32, 634, 326, 9, ratio, 20, TRACK, progress.promoReady ? GOLD : CYAN);
        if (progress.promoReady) {
            this.resultXpLabel.string = `🏆 已达标！立即开启 Lv.${div.level} 晋级关键战`;
            this.resultXpLabel.color = GOLD;
        } else if (progress.level >= MAX_LEVEL) {
            this.resultXpLabel.string = `传奇殿堂声望：${progress.xp} XP`;
            this.resultXpLabel.color = GOLD;
        } else {
            this.resultXpLabel.string = `Lv.${div.level} 升级进度：${progress.xp} / ${div.xpToPromote} XP`;
            this.resultXpLabel.color = CYAN;
        }

        // 结算页广告位严格克制：已有晋级资格 / 刚晋级 / 刚满贯时绝不打扰，只在差一截或受挫时雪中送炭！
        this.showDoubleHook = settlement.isEligibleForDoubleXp && !doubleXpClaimed;
        this.showResultLoanHook = !this.showDoubleHook && settlement.isEligibleForScoutLegendHook && !loanedPlayerId;
        this.resultDoubleBtnLabel.node.active = this.showDoubleHook || this.showResultLoanHook;

        if (this.showDoubleHook) {
            const dr = this.resDoubleRect;
            this.resultDraw.gameButton(dr.x, dr.y, dr.w, dr.h - 2, GOLD, GOLD_DEPTH, GOLD_LIGHT, 8, 3);
            this.resultDoubleBtnLabel.string = settlement.wouldTriggerPromoIfDoubled
                ? '🎬 看视频 XP ×2 · 立即触发晋级战！'
                : `🎬 看视频本局经验 ×2 (+${settlement.breakdown.totalXp} XP)`;
        } else if (this.showResultLoanHook) {
            const dr = this.resDoubleRect;
            const feat = getFeaturedLoanLegend(progress.level);
            this.resultDraw.gameButton(dr.x, dr.y, dr.w, dr.h - 2, GOLD, GOLD_DEPTH, GOLD_LIGHT, 8, 3);
            this.resultDoubleBtnLabel.string = `🎬 租借 ${feat.ovr}分 ${feat.shortName} 踢 2 场破局！`;
        }

        // 主 3D 实体按钮
        const ar = this.resAgainRect;
        if (progress.promoReady) {
            this.resultDraw.gameButton(ar.x, ar.y, ar.w, ar.h - 3, GOLD, GOLD_DEPTH, GOLD_LIGHT, 9, 4);
            this.resultAgainBtnLabel.string = `立即开始 Lv.${div.level} 晋级战 →`;
            this.resultAgainBtnLabel.color = DARK;
        } else {
            this.resultDraw.gameButton(ar.x, ar.y, ar.w, ar.h - 3, RED, RED_DEPTH, RED_EDGE, 9, 4);
            this.resultAgainBtnLabel.string = '再来一局 →';
            this.resultAgainBtnLabel.color = LIGHT;
        }

        this.resultDraw.chamferBox(this.resRosterRect.x, this.resRosterRect.y, this.resRosterRect.w, this.resRosterRect.h, 7, CARD, CYAN, 1.1);
        this.resultDraw.chamferBox(this.resLobbyRect.x, this.resLobbyRect.y, this.resLobbyRect.w, this.resLobbyRect.h, 7, CARD, EDGE, 1.1);
    }

    update(
        dt: number,
        screen: ScreenMode,
        match: PenaltyMatch | null,
        tracking: boolean,
        aim: Aim | null,
        simAd: SimAdState | null
    ): void {
        if (this.toastTimer > 0) {
            this.toastTimer -= dt;
            if (this.toastTimer <= 0) {
                this.toastNode.active = false;
            } else if (this.toastTimer < 0.4) {
                this.toastFade.opacity = Math.round(255 * (this.toastTimer / 0.4));
            }
        }

        // 节流模拟广告进度条重绘（仅在进度步进变化时重绘，杜绝每帧 clear）
        this.simAdNode.active = Boolean(simAd);
        if (simAd) {
            const ratio = clamp(simAd.elapsed / simAd.duration, 0, 1);
            const step = Math.round(ratio * 24);
            if (step !== this.lastSimAdStep) {
                this.lastSimAdStep = step;
                const done = ratio >= 1;
                this.simAdDraw.clear();
                this.simAdDraw.box(0, 0, WIDTH, HEIGHT, color('#030810DC'));
                this.simAdDraw.chamferBox(28, 284, 334, 226, 14, color('#0B1726FC'), GOLD, 1.8);
                this.simAdDraw.segmentedBar(48, 392, 294, 12, ratio, 20, TRACK, done ? GREEN : GOLD);
                this.simAdDraw.chamferBox(this.simCloseRect.x, this.simCloseRect.y, this.simCloseRect.w, this.simCloseRect.h, 7, CARD, EDGE, 1.1);
                if (done) {
                    this.simAdDraw.gameButton(this.simClaimRect.x, this.simClaimRect.y, this.simClaimRect.w, this.simClaimRect.h - 2, GREEN, color('#1C6B3D'), color('#B9F6CA'), 7, 3);
                } else {
                    this.simAdDraw.chamferBox(this.simClaimRect.x, this.simClaimRect.y, this.simClaimRect.w, this.simClaimRect.h, 7, color('#2C3B4B'), EDGE, 1);
                }
                this.simAdTitle.string = `🎬 模拟激励视频 · ${simAd.meta.title}`;
                this.simAdDesc.string = simAd.meta.rewardSummary;
                this.simAdProgressText.string = done
                    ? '已完整观看！点击右侧立即领奖'
                    : `模拟广告播放中... ${(simAd.duration - simAd.elapsed).toFixed(1)}s`;
                this.simAdClaimLabel.string = done ? '✓ 领取奖励' : '请稍候...';
                this.simAdClaimLabel.color = done ? DARK : MUTED;
            }
        } else if (this.lastSimAdStep !== -1) {
            this.lastSimAdStep = -1;
            this.simAdDraw.clear();
        }

        if (this.feedbackNode.active && match) {
            this.feedbackFade.opacity = Math.round(255 * clamp(match.elapsed / 0.12, 0, 1));
            this.feedbackNode.setPosition(0, -10 * Math.max(0, 1 - match.elapsed * 8));
        }

        if (screen !== 'match' || !match || !this.matchBottom.active) return;

        const powerStep = aim ? Math.round(aim.power * 40) : 0;
        const key = [
            match.stage,
            tracking,
            powerStep,
            aim?.zone ?? '',
            aim?.isPanenka ?? false,
            aim ? Math.round(aim.curve * 4) : 0,
            aim && aim.feintScore >= 0.35 ? 1 : 0,
        ].join('|');
        if (key === this.powerKey) return;
        this.powerKey = key;

        this.meterDraw.clear();
        const ready = match.stage === 'ready';
        if (!ready) {
            this.techLabel.string = `第 ${match.currentShotNumber} 球飞行中...`;
            this.techLabel.color = LIGHT;
            this.hintDetailLabel.string = '';
            return;
        }

        if (!aim) {
            this.techLabel.string = tracking ? '向上滑动瞄准球门' : '按住足球向上滑动射门';
            this.techLabel.color = LIGHT;
            this.hintDetailLabel.string = '弯划香蕉球 · 变向骗门将 · 轻划中路勺子';
        } else {
            const tags: string[] = [];
            if (aim.isPanenka) tags.push('勺子挑射');
            else tags.push(powerZoneLabel(aim.zone));
            if (Math.abs(aim.curve) >= 0.25) tags.push(aim.curve > 0 ? '右旋弧线' : '左旋弧线');
            if (aim.feintScore >= 0.32) tags.push('假动作变向!');
            this.techLabel.string = tags.join(' · ');
            this.techLabel.color = color(aim.isPanenka ? '#C58BFF' : powerZoneColorHex(aim.zone));
            this.hintDetailLabel.string = aim.zone === 'overload'
                ? '警告：过载红区极易打飞！松手即射'
                : '观察散布圆大小 · 松手起脚';
        }

        const barX = 40;
        const barY = 763;
        const barW = 310;
        const barH = 11;
        const segs: readonly [number, number, string][] = [
            [0, 0.38, '#174859'],
            [0.39, 0.72, '#174E35'],
            [0.73, 0.90, '#594716'],
            [0.91, 1.0, '#621923'],
        ];
        for (const [s, e, bgHex] of segs) {
            this.meterDraw.slantBox(barX + barW * s, barY, barW * (e - s), barH, 3, color(bgHex));
        }
        if (aim) {
            const fillHex = aim.isPanenka ? '#C58BFF' : powerZoneColorHex(aim.zone);
            const fillW = Math.max(6, barW * aim.power);
            this.meterDraw.slantBox(barX, barY, fillW, barH, 3, color(fillHex));
            const px = barX + barW * aim.power;
            this.meterDraw.box(px - 2, barY - 3, 4, barH + 6, LIGHT);
        }
    }

    actionAt(point: Point, screen: ScreenMode, match: PenaltyMatch | null, simAd: SimAdState | null): HudAction | null {
        if (simAd) {
            if (hitRect(point, this.simCloseRect)) return 'sim_ad_close';
            if (simAd.elapsed >= simAd.duration && hitRect(point, this.simClaimRect)) return 'sim_ad_claim';
            return null;
        }

        const topPoint: Point = { x: point.x, y: point.y - this.topOffset };
        const bottomPoint: Point = { x: point.x, y: point.y - this.bottomOffset };

        if (screen !== 'roster' && hitRect(topPoint, this.soundRect)) return 'sound';

        if (screen === 'lobby') {
            if (hitRect(bottomPoint, this.lineupCardRect)) return 'open_roster';
            if (this.showLoanHook && hitRect(bottomPoint, this.adLoanRect)) return 'ad_loan_featured';
            if (this.showScoutHook && hitRect(bottomPoint, this.adScoutRect)) return 'ad_scout_intel';
            if (hitRect(bottomPoint, this.startBtnRect)) return 'start_match';
            if (hitRect(bottomPoint, this.rosterBtnRect)) return 'open_roster';
            if (hitRect(bottomPoint, this.dailyBtnRect)) return 'start_daily';
            return null;
        }

        if (screen === 'match' && match?.stage === 'var_offer') {
            if (hitRect(point, this.varAcceptRect)) return 'var_accept';
            if (hitRect(point, this.varDeclineRect)) return 'var_decline';
            return null;
        }

        if (screen === 'result') {
            if (this.showDoubleHook && hitRect(bottomPoint, this.resDoubleRect)) return 'ad_double_xp';
            if (this.showResultLoanHook && hitRect(bottomPoint, this.resDoubleRect)) return 'ad_result_loan';
            if (hitRect(bottomPoint, this.resAgainRect)) return 'result_again';
            if (hitRect(bottomPoint, this.resRosterRect)) return 'open_roster';
            if (hitRect(bottomPoint, this.resLobbyRect)) return 'result_lobby';
            return null;
        }

        return null;
    }
}
