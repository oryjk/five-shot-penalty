import {
    _decorator, AudioClip, AudioSource, Component, EventMouse, EventTouch, Game, game, ImageAsset,
    input, Input, Label, Node, ResolutionPolicy, resources, Sprite, SpriteFrame, sys, Vec2, view, warn,
} from 'cc';
import { AdManager } from './core/AdManager';
import type { AdPlacement, AdPlacementMeta } from './core/AdManager';
import { PenaltyMatch } from './core/PenaltyMatch';
import {
    applyDoubleXpReward,
    canAdRetryDaily,
    canPlayFreeDaily,
    createDefaultProgress,
    getMatchLineup,
    isNewbieProtected,
    sanitizeProgress,
    settleMatch,
} from './core/Progression';
import type { MatchMode, PlayerProgress, SettlementResult } from './core/Progression';
import {
    buildRecommendedSquad,
    getDivision,
    getFeaturedLoanLegend,
    getKeeperForLevel,
    getPlayerById,
    MAX_LEVEL,
    PLAYERS,
} from './core/Roster';
import { SwipeInput } from './core/ShotPhysics';
import type { Point } from './core/ShotPhysics';
import { child, color, createSprite, HEIGHT, size, text, WIDTH } from './view/Drawing';
import { Hud } from './view/Hud';
import type { HudAction, ScreenMode, SimAdState } from './view/Hud';
import { RosterPanel } from './view/RosterPanel';
import type { RosterAction } from './view/RosterPanel';
import { Stadium } from './view/Stadium';

const { ccclass } = _decorator;
const PROGRESS_KEY = 'football-insight.pes-penalty.progress.v2';
const SOUNDS = ['kick', 'net', 'save', 'miss', 'post'] as const;
type Sound = typeof SOUNDS[number];
type Pointer = EventTouch | EventMouse;

interface Wechat {
    getMenuButtonBoundingClientRect?: () => { bottom: number };
    getWindowInfo?: () => { windowHeight: number; safeArea?: { bottom: number } };
    vibrateShort?: (options: { type: 'light' | 'medium'; fail: () => void }) => void;
    showShareMenu?: (options: { menus: string[]; fail: () => void }) => void;
    onShareAppMessage?: (callback: () => { title: string }) => void;
}

const wxRuntime = (): Wechat | undefined => (globalThis as typeof globalThis & { wx?: Wechat }).wx;

function loadSprite(name: string): Promise<SpriteFrame | null> {
    return new Promise(resolve => resources.load('art/' + name + '/spriteFrame', SpriteFrame, (error, image) => {
        if (!error && image) {
            resolve(image);
            return;
        }
        resources.load('art/' + name, ImageAsset, (imgErr, asset) => {
            if (imgErr || !asset) {
                warn('[PenaltyGame] Missing art ' + name, imgErr?.message ?? error?.message);
                resolve(null);
                return;
            }
            resolve(SpriteFrame.createWithImage(asset));
        });
    }));
}

function loadSound(name: Sound): Promise<AudioClip | null> {
    return new Promise(resolve => resources.load('audio/' + name, AudioClip, (error, clip) => {
        if (error) warn('[PenaltyGame] Missing sound ' + name, error.message);
        resolve(error ? null : clip);
    }));
}

function loadProgress(): PlayerProgress {
    try {
        const raw = sys.localStorage.getItem(PROGRESS_KEY);
        if (!raw) return createDefaultProgress();
        return sanitizeProgress(JSON.parse(raw) as Partial<PlayerProgress>);
    } catch {
        return createDefaultProgress();
    }
}

function saveProgress(progress: PlayerProgress): void {
    try {
        sys.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
        /* 隐私浏览或存储受限时静默忽略 */
    }
}

type PendingPointer =
    | { id: number; start: Point; kind: 'hud'; action: HudAction }
    | { id: number; start: Point; kind: 'roster'; action: RosterAction };

@ccclass('PenaltyGame')
export class PenaltyGame extends Component {
    private readonly swipe = new SwipeInput();
    private readonly ads = new AdManager();
    private readonly clips = new Map<Sound, AudioClip>();

    private progress: PlayerProgress = createDefaultProgress();
    private screen: ScreenMode = 'lobby';
    private match: PenaltyMatch | null = null;
    private settlement: SettlementResult | null = null;
    private doubleXpClaimed = false;
    private loanedPlayerId: string | null = null;
    private loanMatchesRemaining = 0;
    private scoutIntelQueued = false;

    private surface!: Node;
    private backdrop!: Sprite;
    private audio!: AudioSource;
    private stadium!: Stadium;
    private hud: Hud | null = null;
    private rosterPanel: RosterPanel | null = null;

    private pendingPointer: PendingPointer | null = null;
    private simAd: { state: SimAdState; resolve: (rewarded: boolean) => void } | null = null;

    private readyTime = 0;
    private clock = 0;
    private viewportHeight = 0;
    private sceneScale = 1;
    private backgrounded = false;

    onLoad(): void {
        view.setDesignResolutionSize(WIDTH, HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this.progress = loadProgress();

        this.backdrop = createSprite(this.node, 'Stadium atmosphere', 195, 422, WIDTH, HEIGHT);
        this.surface = child(this.node, 'Football Insight PES Penalty');
        this.stadium = new Stadium(this.surface);
        this.audio = this.node.addComponent(AudioSource);

        // 非微信环境或未配置真实 adUnitId 时启用 2 秒模拟激励视频弹窗，方便完整体验验收
        this.ads.setSimulatedHandler((meta: AdPlacementMeta) => this.openSimulatedAd(meta));

        const loading = text(this.surface, 'Opening', '足球洞察 · 实况点球球场准备中', 195, 310, 18, color('#F5F7FA'), 'center', 334, true);
        void this.loadGame(loading);

        const platform = wxRuntime();
        platform?.showShareMenu?.({ menus: ['shareAppMessage'], fail: () => {} });
        platform?.onShareAppMessage?.(() => {
            const div = getDivision(this.progress.level);
            return {
                title: `足球洞察实况点球 · 我已打到 Lv.${div.level} ${div.name}（最高 ${this.progress.topSpeedKmh || 110} km/h）！`,
            };
        });
    }

    private async loadGame(loading: Label): Promise<void> {
        const [arena, stageBg, brand, keeperReady, keeperDive] = await Promise.all([
            loadSprite('arena'),
            loadSprite('roster-stage'),
            loadSprite('football-insight'),
            loadSprite('keeper-ready'),
            loadSprite('keeper-dive'),
        ]);
        if (!this.isValid) return;
        this.backdrop.spriteFrame = arena;
        this.stadium.setKeeper(keeperReady, keeperDive);
        // RosterPanel 先于 Hud 创建，确保 Hud 内的最顶层 modal（模拟激励视频/VAR/Toast）始终渲染在最顶层
        this.rosterPanel = new RosterPanel(this.surface);
        this.rosterPanel.setStageArt(stageBg);
        this.hud = new Hud(this.surface, brand ?? undefined);
        loading.node.destroy();
        this.resize(true);
        this.refreshUI();
        this.ads.preload('var_mulligan');
        this.ads.preload('loan_legend');

        // 异步加载 16 名球员半写实立绘头像（总计仅 ~100KB，加载完自动刷新球星卡与铭牌）
        for (const player of PLAYERS) {
            void loadSprite('portraits/' + player.id).then(frame => {
                if (!frame || !this.isValid) return;
                this.rosterPanel?.setPortrait(player.id, frame);
                this.hud?.setPortrait(player.id, frame);
            });
        }

        for (const key of SOUNDS) {
            void loadSound(key).then(clip => {
                if (clip && this.isValid) this.clips.set(key, clip);
            });
        }
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.touchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        if (!sys.isMobile) {
            input.on(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
            input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
            input.on(Input.EventType.MOUSE_UP, this.mouseEnd, this);
        }
        game.on(Game.EVENT_HIDE, this.hide, this);
        game.on(Game.EVENT_SHOW, this.show, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.touchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
        input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
        input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.mouseEnd, this);
        game.off(Game.EVENT_HIDE, this.hide, this);
        game.off(Game.EVENT_SHOW, this.show, this);
        this.cancelAll();
    }

    private hide(): void {
        this.backgrounded = true;
        this.cancelAll();
    }

    private show(): void {
        this.backgrounded = false;
        this.resize(true);
    }

    private cancelAll(): void {
        this.pendingPointer = null;
        this.swipe.cancel();
    }

    private resize(force = false): void {
        const height = view.getVisibleSize().height;
        if (!height || (!force && height === this.viewportHeight)) return;
        this.viewportHeight = height;
        this.sceneScale = Math.min(1, height / HEIGHT);
        size(this.backdrop.node, WIDTH, Math.max(HEIGHT, height));
        this.surface.setScale(this.sceneScale, this.sceneScale, 1);

        const wx = wxRuntime();
        const metrics = wx?.getWindowInfo?.();
        const cssHeight = metrics?.windowHeight || height;
        const fraction = height / cssHeight;
        const capsule = wx?.getMenuButtonBoundingClientRect?.();
        const bottom = metrics?.safeArea?.bottom ?? cssHeight;
        const contentY = (value: number) => (value - height / 2) / this.sceneScale + HEIGHT / 2;
        this.hud?.layout(contentY(((capsule?.bottom ?? 50) + 12) * fraction), contentY(bottom * fraction));
        this.cancelAll();
    }

    private logicalPoint(position: Vec2): Point {
        const origin = view.getVisibleOrigin();
        return {
            x: (position.x - origin.x - WIDTH / 2) / this.sceneScale + WIDTH / 2,
            y: (this.viewportHeight / 2 - (position.y - origin.y)) / this.sceneScale + HEIGHT / 2,
        };
    }

    private touchStart(event: EventTouch): void {
        const id = event.getID();
        if (id !== null) this.startPointer(id, event);
    }
    private touchMove(event: EventTouch): void {
        const id = event.getID();
        if (id !== null) this.swipe.move(id, this.logicalPoint(event.getUILocation()));
    }
    private touchEnd(event: EventTouch): void {
        const id = event.getID();
        if (id !== null) this.endPointer(id, event);
    }
    private touchCancel(event: EventTouch): void {
        const id = event.getID();
        if (id === null) return;
        if (this.pendingPointer?.id === id) this.pendingPointer = null;
        this.swipe.cancel(id);
    }
    private mouseStart(event: EventMouse): void {
        if (event.getButton() === 0) this.startPointer(-1, event);
    }
    private mouseMove(event: EventMouse): void {
        this.swipe.move(-1, this.logicalPoint(event.getUILocation()));
    }
    private mouseEnd(event: EventMouse): void {
        if (event.getButton() === 0) this.endPointer(-1, event);
    }

    private startPointer(id: number, event: Pointer): void {
        if (this.pendingPointer || this.swipe.active || !this.hud || !this.rosterPanel || this.backgrounded) return;
        const point = this.logicalPoint(event.getUILocation());

        // 1. 若模拟广告正在播放，所有输入只交给广告弹窗
        if (this.simAd) {
            const action = this.hud.actionAt(point, this.screen, this.match, this.simAd.state);
            if (action) this.pendingPointer = { id, start: point, kind: 'hud', action };
            return;
        }

        // 2. 球员名册全屏界面
        if (this.screen === 'roster') {
            const rAction = this.rosterPanel.hitTest(point, this.progress);
            if (rAction) this.pendingPointer = { id, start: point, kind: 'roster', action: rAction };
            return;
        }

        // 3. HUD 按钮
        const hudAction = this.hud.actionAt(point, this.screen, this.match, null);
        if (hudAction) {
            this.pendingPointer = { id, start: point, kind: 'hud', action: hudAction };
            return;
        }

        // 4. 球场内滑动射门区域
        if (this.screen === 'match' && this.match?.stage === 'ready') {
            if (point.x >= 4 && point.x <= 386 && point.y >= 520 && point.y <= 820) {
                this.swipe.start(id, point);
            }
        }
    }

    private endPointer(id: number, event: Pointer): void {
        const point = this.logicalPoint(event.getUILocation());
        if (this.pendingPointer?.id === id) {
            const pending = this.pendingPointer;
            this.pendingPointer = null;
            const moved = Math.hypot(pending.start.x - point.x, pending.start.y - point.y);
            if (moved <= 22) {
                if (pending.kind === 'hud') void this.handleHudAction(pending.action);
                else void this.handleRosterAction(pending.action);
            }
            return;
        }

        const aim = this.swipe.finish(id, point);
        if (aim && this.screen === 'match' && this.match?.kick(aim, this.readyTime)) {
            this.play('kick', 0.65);
        }
    }

    private openSimulatedAd(meta: AdPlacementMeta): Promise<boolean> {
        return new Promise(resolve => {
            this.simAd = {
                state: { meta, elapsed: 0, duration: 2.0 },
                resolve,
            };
        });
    }

    private finishSimulatedAd(rewarded: boolean): void {
        if (!this.simAd) return;
        const { resolve } = this.simAd;
        this.simAd = null;
        resolve(rewarded);
    }

    private async triggerRewardedAd(placement: AdPlacement): Promise<boolean> {
        const res = await this.ads.showRewarded(placement);
        if (res.status === 'rewarded') return true;
        this.hud?.showToast(res.message);
        return false;
    }

    private startMatch(mode: MatchMode): void {
        const level = mode === 'daily' ? MAX_LEVEL : this.progress.level;
        const keeper = getKeeperForLevel(level);
        const lineup = mode === 'daily'
            ? [
                getPlayerById('leo_lapa'),
                getPlayerById('cristian_madeira'),
                getPlayerById('roberto_farias'),
                getPlayerById('zined_royale'),
                getPlayerById('pelegrino_oro'),
            ]
            : getMatchLineup(this.progress, this.loanedPlayerId);

        this.match = new PenaltyMatch({
            level,
            mode,
            lineup,
            keeper,
            loanedPlayerId: mode === 'daily' ? null : this.loanedPlayerId,
            scoutIntelActive: mode !== 'daily' && this.scoutIntelQueued,
            newbieProtected: isNewbieProtected(this.progress),
        });

        // 传奇租借每看 1 条广告可爽踢 2 场，赛前情报单场消耗
        if (mode !== 'daily') {
            if (this.loanMatchesRemaining > 0) {
                this.loanMatchesRemaining -= 1;
                if (this.loanMatchesRemaining <= 0) {
                    this.loanedPlayerId = null;
                }
            }
            this.scoutIntelQueued = false;
        }
        this.settlement = null;
        this.doubleXpClaimed = false;
        this.readyTime = 0;
        this.swipe.cancel();
        this.screen = 'match';
        this.refreshUI();
    }

    private async handleHudAction(action: HudAction): Promise<void> {
        switch (action) {
            case 'sim_ad_close':
                this.finishSimulatedAd(false);
                return;
            case 'sim_ad_claim':
                this.finishSimulatedAd(true);
                return;
            case 'sound':
                this.progress.muted = !this.progress.muted;
                if (this.progress.muted) this.audio.stop();
                saveProgress(this.progress);
                this.refreshUI();
                return;
            case 'open_roster':
                this.screen = 'roster';
                this.rosterPanel?.open(this.progress);
                this.refreshUI();
                return;
            case 'start_match':
            case 'result_again': {
                const mode: MatchMode = this.progress.promoReady ? 'promotion' : 'career';
                this.startMatch(mode);
                return;
            }
            case 'result_lobby':
                this.screen = 'lobby';
                this.match = null;
                this.settlement = null;
                this.refreshUI();
                return;
            case 'start_daily': {
                if (canPlayFreeDaily(this.progress)) {
                    this.hud?.showToast('每日传奇挑战：全明星阵容 vs Lv.8 传奇门神！');
                    this.startMatch('daily');
                } else if (canAdRetryDaily(this.progress)) {
                    const ok = await this.triggerRewardedAd('daily_retry');
                    if (ok) {
                        this.hud?.showToast('每日传奇加赛已开启！');
                        this.startMatch('daily');
                    }
                } else {
                    this.hud?.showToast(`今日每日传奇挑战次数已满（今日最佳 ${this.progress.dailyBestGoals}/5）`);
                }
                return;
            }
            case 'ad_loan_featured':
            case 'ad_result_loan': {
                if (this.loanedPlayerId && this.loanMatchesRemaining > 0) {
                    this.hud?.showToast(`已租借 ${getPlayerById(this.loanedPlayerId).name}（剩余 ${this.loanMatchesRemaining} 场）`);
                    return;
                }
                const legend = getFeaturedLoanLegend(this.progress.level);
                const ok = await this.triggerRewardedAd('loan_legend');
                if (ok) {
                    this.loanedPlayerId = legend.id;
                    this.loanMatchesRemaining = 2;
                    this.hud?.showToast(`🎉 已启用 ${legend.name} (OVR ${legend.ovr}) 连续 2 场！`);
                    this.refreshUI();
                }
                return;
            }
            case 'ad_scout_intel': {
                if (this.scoutIntelQueued) {
                    this.hud?.showToast('球探情报已就绪，下一场自动生效');
                    return;
                }
                const ok = await this.triggerRewardedAd('scout_intel');
                if (ok) {
                    this.scoutIntelQueued = true;
                    this.hud?.showToast('球探绝密情报激活：2 球弱侧提示 + 散布 -18%！');
                    this.refreshUI();
                }
                return;
            }
            case 'var_accept': {
                if (!this.match || this.match.stage !== 'var_offer') return;
                const ok = await this.triggerRewardedAd('var_mulligan');
                if (ok && this.match.acceptVarMulligan()) {
                    this.hud?.showToast('VAR 改判：门将提前移动，重罚本球！');
                    this.readyTime = 0;
                    this.refreshUI();
                }
                return;
            }
            case 'var_decline':
                if (this.match?.stage === 'var_offer') {
                    this.match.declineVarMulligan();
                    this.checkMatchCompletion();
                    this.refreshUI();
                }
                return;
            case 'ad_double_xp': {
                if (!this.settlement || this.doubleXpClaimed) return;
                const ok = await this.triggerRewardedAd('double_xp');
                if (ok) {
                    this.doubleXpClaimed = true;
                    const res = applyDoubleXpReward(this.progress, this.settlement.breakdown.totalXp);
                    saveProgress(this.progress);
                    this.hud?.showToast(
                        res.triggeredPromoReady
                            ? '经验翻倍成功！🏆 晋级关键战已解锁！'
                            : `经验暴击 +${this.settlement.breakdown.totalXp} XP！`
                    );
                    this.refreshUI();
                }
                return;
            }
        }
    }

    private async handleRosterAction(action: RosterAction): Promise<void> {
        switch (action.type) {
            case 'back':
                this.rosterPanel?.close();
                this.screen = this.settlement ? 'result' : 'lobby';
                this.refreshUI();
                return;
            case 'toggle_mode':
                this.progress.lineupMode = this.progress.lineupMode === 'squad' ? 'solo' : 'squad';
                saveProgress(this.progress);
                this.hud?.showToast(this.progress.lineupMode === 'squad' ? '已切换：5人点球大名单模式' : '已切换：单人主力包办 5 球');
                this.refreshUI();
                return;
            case 'auto_squad':
                this.progress.squadIds = buildRecommendedSquad(this.progress.level);
                this.progress.soloPlayerId = this.progress.squadIds[4];
                saveProgress(this.progress);
                this.hud?.showToast('已按当前解锁球星自动编排最强阵容！');
                this.refreshUI();
                return;
            case 'set_page':
                this.rosterPanel?.setPage(action.page);
                this.refreshUI();
                return;
            case 'select_player':
                this.rosterPanel?.selectPlayer(action.playerId);
                this.refreshUI();
                return;
            case 'assign_slot':
                this.progress.squadIds[action.slotIndex] = action.playerId;
                saveProgress(this.progress);
                this.hud?.showToast(`第 ${action.slotIndex + 1} 号主罚位已设为 ${getPlayerById(action.playerId).shortName}`);
                this.refreshUI();
                return;
            case 'set_solo':
                this.progress.soloPlayerId = action.playerId;
                saveProgress(this.progress);
                this.hud?.showToast(`单人主力已设为 ${getPlayerById(action.playerId).name}`);
                this.refreshUI();
                return;
            case 'loan_player': {
                if (this.loanedPlayerId === action.playerId && this.loanMatchesRemaining > 0) {
                    this.hud?.showToast(`该传奇球星已租借就绪（剩余 ${this.loanMatchesRemaining} 场）！`);
                    return;
                }
                const target = getPlayerById(action.playerId);
                const ok = await this.triggerRewardedAd('loan_legend');
                if (ok) {
                    this.loanedPlayerId = target.id;
                    this.loanMatchesRemaining = 2;
                    this.hud?.showToast(`🎉 已租借 ${target.name} (OVR ${target.ovr}) 连续 2 场！`);
                    this.refreshUI();
                }
                return;
            }
        }
    }

    private play(sound: Sound, volume: number): void {
        const clip = this.clips.get(sound);
        if (!this.progress.muted && clip) this.audio.playOneShot(clip, volume);
    }

    private checkMatchCompletion(): void {
        if (!this.match || this.match.stage !== 'complete' || this.settlement) return;
        this.settlement = settleMatch(this.progress, this.match.shots, this.match.mode, this.match.wonPromotion);
        saveProgress(this.progress);
        this.screen = 'result';
        if (this.settlement.promoted) {
            this.play('net', 0.8);
            this.hud?.showToast(`🎉 晋级 Lv.${this.settlement.newLevel}！新球星已永久解锁`);
        }
    }

    private refreshUI(): void {
        this.hud?.refresh(
            this.screen,
            this.progress,
            this.match,
            this.loanedPlayerId,
            this.loanMatchesRemaining,
            this.scoutIntelQueued,
            this.settlement,
            this.doubleXpClaimed
        );
        this.rosterPanel?.refresh(this.progress, this.loanedPlayerId);
    }

    update(delta: number): void {
        if (this.backgrounded) return;
        this.resize();
        const dt = Math.min(delta, 0.055);
        this.clock += dt;

        // 模拟激励视频倒计时推进
        if (this.simAd) {
            const prev = this.simAd.state;
            this.simAd.state = { ...prev, elapsed: Math.min(prev.duration, prev.elapsed + dt) };
        }

        if (this.screen === 'match' && this.match && !this.simAd) {
            if (this.match.stage === 'ready') this.readyTime += dt;
            const prevStage = this.match.stage;
            this.match.advance(dt);

            if (prevStage === 'flight' && this.match.stage === 'feedback' && this.match.shot) {
                const c = this.match.shot.contact;
                const sfx: Sound = (c === 'post_out' || c === 'post_in')
                    ? 'post'
                    : c === 'glove'
                        ? 'save'
                        : c === 'net'
                            ? 'net'
                            : 'miss';
                this.play(sfx, 0.72);
                if (c === 'net' || c === 'post_in' || c === 'glove') {
                    wxRuntime()?.vibrateShort?.({
                        type: c === 'glove' ? 'light' : 'medium',
                        fail: () => {},
                    });
                }
            }
            if (this.match.stage === 'complete') {
                this.checkMatchCompletion();
            }
        } else {
            this.readyTime += dt;
        }

        const previewKeeper = getKeeperForLevel(this.progress.level);
        const previewPlayer = this.loanedPlayerId
            ? getPlayerById(this.loanedPlayerId)
            : getPlayerById(this.progress.lineupMode === 'solo' ? this.progress.soloPlayerId : this.progress.squadIds[0]);

        this.stadium.update({
            match: this.screen === 'match' || this.screen === 'result' ? this.match : null,
            previewKeeper,
            previewPlayer,
            readyTime: this.readyTime,
            clock: this.clock,
            aim: this.screen === 'match' ? this.swipe.aim : null,
            interactive: this.screen === 'match' && this.match?.stage === 'ready' && !this.simAd,
        });

        this.refreshUI();
        this.hud?.update(dt, this.screen, this.match, this.swipe.active, this.swipe.aim, this.simAd?.state ?? null);
    }
}
