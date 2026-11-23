import { Color, Label, Node, Sprite, SpriteFrame } from 'cc';
import { ratingColorHex, SKILLS, starText, STAT_KEYS, STAT_LABELS } from '../core/Attributes';
import type { PlayerProfile } from '../core/Attributes';
import { isPlayerUnlocked } from '../core/Progression';
import type { PlayerProgress } from '../core/Progression';
import { getPlayerById, PLAYERS } from '../core/Roster';
import type { Point } from '../core/ShotPhysics';
import {
    child,
    color,
    createSprite,
    Drawing,
    getCardTierPalette,
    HEIGHT,
    hitRect,
    Rect,
    text,
    WIDTH,
} from './Drawing';
import { RadarChart } from './RadarChart';

const DARK = color('#08101A');
const PANEL_DARK = color('#0B1626DE');
const TEXT_MAIN = color('#F6F9FC');
const TEXT_MUTED = color('#95ABC2');
const CYAN = color('#38E4FF');
const GREEN = color('#46E484');
const GOLD = color('#FFCA4B');
const TRACK = color('#1A2B3F');

export type RosterAction =
    | { type: 'back' }
    | { type: 'toggle_mode' }
    | { type: 'auto_squad' }
    | { type: 'select_player'; playerId: string }
    | { type: 'assign_slot'; slotIndex: number; playerId: string }
    | { type: 'set_solo'; playerId: string }
    | { type: 'loan_player'; playerId: string }
    | { type: 'set_page'; page: 0 | 1 };

interface GridCellView {
    portrait: Sprite;
    ovr: Label;
    pos: Label;
    name: Label;
    stars: Label;
    status: Label;
}

/**
 * 实况足球 / eFootball 舞台级球星卡与素质表界面：
 * - 真实夜场聚光灯舞台底图
 * - 金属切角球星卡 + 16 名半写实球员头像立绘
 * - 实况色块数字标签 + 斜切分格能力条 + 六维战术雷达图
 */
export class RosterPanel {
    readonly root: Node;
    private readonly stageBg: Sprite;
    private readonly frameDraw: Drawing;
    private readonly heroDraw: Drawing;
    private readonly heroPortrait: Sprite;
    private readonly heroOverlayDraw: Drawing;
    private readonly actionDraw: Drawing;
    private readonly gridCardDraw: Drawing;
    private readonly gridOverlayDraw: Drawing;
    private readonly radar: RadarChart;

    private readonly modeLabel: Label;
    private readonly heroOvrLabel: Label;
    private readonly heroPosLabel: Label;
    private readonly heroFootLabel: Label;
    private readonly heroStarsLabel: Label;
    private readonly heroNameLabel: Label;
    private readonly heroTitleLabel: Label;
    private readonly skillLabels: Label[] = [];
    private readonly statValueLabels: Label[] = [];

    private readonly slotLabels: Label[] = [];
    private readonly soloBtnLabel: Label;
    private readonly lockHintLabel: Label;
    private readonly loanBtnLabel: Label;

    private readonly tabLabels: [Label, Label];
    private readonly cells: GridCellView[] = [];
    private readonly portraits = new Map<string, SpriteFrame>();

    private selectedPlayerId: string = PLAYERS[0].id;
    private page: 0 | 1 = 0;
    private lastRenderKey = '';

    // 精确交互区域
    private readonly backRect: Rect = { x: 14, y: 88, w: 66, h: 30 };
    private readonly modeRect: Rect = { x: 214, y: 88, w: 84, h: 30 };
    private readonly autoRect: Rect = { x: 304, y: 88, w: 72, h: 30 };
    private readonly slotRects: Rect[] = [];
    private readonly soloBtnRect: Rect = { x: 18, y: 422, w: 354, h: 38 };
    private readonly loanBtnRect: Rect = { x: 170, y: 420, w: 204, h: 40 };
    private readonly tabRects: [Rect, Rect] = [
        { x: 14, y: 472, w: 178, h: 30 },
        { x: 198, y: 472, w: 178, h: 30 },
    ];
    private readonly cellRects: Rect[] = [];

    constructor(parent: Node) {
        this.root = child(parent, 'PES Roster Stage');

        // 1. 球场聚光灯舞台底图 + 暗角遮罩
        const baseShade = new Drawing(this.root, 'Stage fallback');
        baseShade.box(0, 0, WIDTH, HEIGHT, color('#060D16'));
        this.stageBg = createSprite(this.root, 'Stage backdrop', WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT);
        const vignette = new Drawing(this.root, 'Stage vignette');
        vignette.box(0, 0, WIDTH, HEIGHT, color('#060E1878'));

        // 2. 顶部体育转播导航栏
        this.frameDraw = new Drawing(this.root, 'Broadcast header');
        this.frameDraw.chamferBox(14, 88, 66, 30, 7, PANEL_DARK, color('#4C6B8A'), 1.2);
        text(this.root, 'Back text', '← 返回', 47, 103, 12, TEXT_MAIN, 'center', 62, true);
        this.frameDraw.slantBox(92, 92, 5, 22, 3, GOLD);
        text(this.root, 'Roster title', '球星素质表', 104, 103, 16, TEXT_MAIN, 'left', 108, true, true);
        this.frameDraw.chamferBox(214, 88, 84, 30, 7, color('#0E283CE6'), CYAN, 1.3);
        this.modeLabel = text(this.root, 'Mode label', '5人阵容', 256, 103, 11.5, CYAN, 'center', 80, true);
        this.frameDraw.chamferBox(304, 88, 72, 30, 7, color('#2B220EE6'), GOLD, 1.2);
        text(this.root, 'Auto text', '最强排阵', 340, 103, 11, GOLD, 'center', 68, true);

        // 3. 英雄展示区：左侧金属大球星卡 + 右侧战术雷达图 + 下方 6 项经典实况数值块
        this.heroDraw = new Drawing(this.root, 'Hero stage frame');
        this.heroPortrait = createSprite(this.root, 'Hero portrait', 96, 200, 96, 96);
        this.heroOverlayDraw = new Drawing(this.root, 'Hero card overlay');

        this.heroOvrLabel = text(this.root, 'Hero OVR', '63', 28, 156, 32, GOLD, 'left', 56, true, true);
        this.heroPosLabel = text(this.root, 'Hero Pos', 'CF', 28, 179, 11, TEXT_MAIN, 'left', 42, true);
        this.heroFootLabel = text(this.root, 'Hero Foot', '右脚', 28, 194, 9.5, TEXT_MUTED, 'left', 42, true);
        this.heroNameLabel = text(this.root, 'Hero Name', '林辰', 84, 256, 14.5, TEXT_MAIN, 'center', 124, true);
        this.heroNameLabel.overflow = Label.Overflow.SHRINK;
        this.heroNameLabel.enableWrapText = false;
        this.heroTitleLabel = text(this.root, 'Hero Title', '青训全能前锋', 84, 272, 9.5, TEXT_MUTED, 'center', 124);
        this.heroTitleLabel.overflow = Label.Overflow.SHRINK;
        this.heroTitleLabel.enableWrapText = false;
        this.heroStarsLabel = text(this.root, 'Hero Stars', '★', 84, 286, 10, GOLD, 'center', 124, true);

        this.radar = new RadarChart(this.root, 'PES Radar', 274, 196, 39);

        for (let i = 0; i < 2; i++) {
            const lbl = text(this.root, 'Skill' + i, '', 214 + i * 86, 285, 10.5, TEXT_MAIN, 'center', 80, true);
            lbl.overflow = Label.Overflow.SHRINK;
            lbl.enableWrapText = false;
            this.skillLabels.push(lbl);
        }

        // 6 项经典实况色块数字 + 斜切分格条（2列 x 3行）
        for (let i = 0; i < STAT_KEYS.length; i++) {
            const col = i < 3 ? 0 : 1;
            const row = i % 3;
            const sx = col === 0 ? 22 : 202;
            const sy = 324 + row * 28;
            const key = STAT_KEYS[i];
            const meta = STAT_LABELS[key];
            text(this.root, 'StatLbl ' + key, `${meta.code} ${meta.name}`, sx + 34, sy - 4, 10.5, TEXT_MAIN, 'left', 128, true);
            const valLabel = text(this.root, 'StatVal ' + key, '65', sx + 14, sy + 2, 13, DARK, 'center', 30, true, true);
            this.statValueLabels.push(valLabel);
        }

        // 4. 排阵 / 租借立体操作条
        this.actionDraw = new Drawing(this.root, 'Action deck');
        for (let i = 0; i < 5; i++) {
            const r: Rect = { x: 14 + i * 73, y: 422, w: 69, h: 36 };
            this.slotRects.push(r);
            const lbl = text(this.root, 'Slot' + i, '', r.x + r.w / 2, r.y + 18, 10.5, TEXT_MAIN, 'center', 65, true);
            lbl.overflow = Label.Overflow.SHRINK;
            lbl.enableWrapText = false;
            this.slotLabels.push(lbl);
        }
        this.soloBtnLabel = text(this.root, 'SoloBtn', '', 195, 441, 14, TEXT_MAIN, 'center', 330, true);
        this.lockHintLabel = text(this.root, 'LockHint', '', 24, 440, 12.5, GOLD, 'left', 142, true);
        this.loanBtnLabel = text(this.root, 'LoanBtn', '', 272, 440, 13, DARK, 'center', 194, true);

        // 5. 分页斜切切换 + 4×2 金属球星卡池
        this.gridCardDraw = new Drawing(this.root, 'Grid cards');
        this.tabLabels = [
            text(this.root, 'Tab0', 'Lv.1–4 新秀与职业', 103, 487, 12, TEXT_MAIN, 'center', 166, true),
            text(this.root, 'Tab1', 'Lv.5–8 球星与传奇', 287, 487, 12, TEXT_MUTED, 'center', 166, true),
        ];

        // 头像层置于卡牌底框之上、文字铭牌之下
        const portraitLayer = child(this.root, 'Grid portraits');
        this.gridOverlayDraw = new Drawing(this.root, 'Grid overlays');

        for (let i = 0; i < 8; i++) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const r: Rect = { x: 14 + col * 92, y: 510 + row * 150, w: 86, h: 142 };
            this.cellRects.push(r);
            const portrait = createSprite(portraitLayer, 'CPort' + i, r.x + r.w / 2 + 8, r.y + 52, 62, 62);
            const nameLbl = text(this.root, 'CName' + i, '林辰', r.x + r.w / 2, r.y + 102, 11.5, TEXT_MAIN, 'center', 78, true);
            nameLbl.overflow = Label.Overflow.SHRINK;
            nameLbl.enableWrapText = false;
            this.cells.push({
                portrait,
                ovr: text(this.root, 'COvr' + i, '63', r.x + 8, r.y + 19, 18, GOLD, 'left', 34, true, true),
                pos: text(this.root, 'CPos' + i, 'CF', r.x + 8, r.y + 34, 8.5, TEXT_MUTED, 'left', 32, true),
                name: nameLbl,
                stars: text(this.root, 'CStars' + i, '★', r.x + r.w / 2, r.y + 116, 8.5, GOLD, 'center', 78, true),
                status: text(this.root, 'CStat' + i, '', r.x + r.w / 2, r.y + 131, 9, GREEN, 'center', 78, true),
            });
        }

        this.root.active = false;
    }

    setStageArt(stageFrame: SpriteFrame | null): void {
        if (stageFrame) this.stageBg.spriteFrame = stageFrame;
    }

    setPortrait(playerId: string, frame: SpriteFrame): void {
        this.portraits.set(playerId, frame);
        this.lastRenderKey = '';
    }

    get visible(): boolean {
        return this.root.active;
    }

    open(progress: PlayerProgress, focusPlayerId?: string): void {
        this.selectedPlayerId = focusPlayerId ?? (
            progress.lineupMode === 'solo' ? progress.soloPlayerId : progress.squadIds[4]
        );
        const p = getPlayerById(this.selectedPlayerId);
        this.page = p.unlockLevel >= 5 ? 1 : 0;
        this.lastRenderKey = '';
        this.root.active = true;
    }

    close(): void {
        this.root.active = false;
    }

    selectPlayer(playerId: string): void {
        this.selectedPlayerId = playerId;
        this.lastRenderKey = '';
    }

    setPage(page: 0 | 1): void {
        this.page = page;
        this.lastRenderKey = '';
    }

    refresh(progress: PlayerProgress, loanedPlayerId: string | null): void {
        if (!this.root.active) return;
        const key = [
            progress.level,
            progress.lineupMode,
            progress.squadIds.join(','),
            progress.soloPlayerId,
            loanedPlayerId ?? '',
            this.selectedPlayerId,
            this.page,
            this.portraits.size,
        ].join('|');
        if (key === this.lastRenderKey) return;
        this.lastRenderKey = key;

        const player = getPlayerById(this.selectedPlayerId);
        const unlocked = isPlayerUnlocked(progress, player.id);
        const isLoaned = loanedPlayerId === player.id;

        this.modeLabel.string = progress.lineupMode === 'squad' ? '5人阵容' : '单人包办';
        this.renderHeroStage(player, unlocked, isLoaned);
        this.renderActionStrip(progress, player, unlocked, isLoaned);
        this.renderGrid(progress, loanedPlayerId);
    }

    private renderHeroStage(player: PlayerProfile, unlocked: boolean, isLoaned: boolean): void {
        this.heroDraw.clear();
        this.heroOverlayDraw.clear();
        const ovrHex = ratingColorHex(player.ovr);
        const pal = getCardTierPalette(player.stars);

        // 展示区半透明切角舞台底板
        this.heroDraw.chamferBox(14, 126, 362, 286, 12, color('#0A1524C8'), isLoaned ? GOLD : pal.rimInner, 1.3);
        // 左侧大号金属球星卡
        this.heroDraw.cardFrame(20, 132, 128, 168, player.stars, false, !unlocked && !isLoaned, isLoaned);

        // 真实球员立绘头像
        const frame = this.portraits.get(player.id) ?? null;
        this.heroPortrait.spriteFrame = frame;
        this.heroPortrait.node.active = Boolean(frame);
        this.heroPortrait.color = unlocked || isLoaned ? color('#FFFFFF') : color('#8A97A8');

        // 大卡底部铭牌高光覆盖层（让头像底部自然融入铭牌）
        const plateY = 132 + 168 * 0.65;
        this.heroOverlayDraw.box(22, plateY, 124, 48, unlocked || isLoaned ? pal.plateBg : color('#091019F0'));
        this.heroOverlayDraw.line([[26, plateY], [142, plateY]], isLoaned ? GOLD : pal.rimOuter, 1.3);

        this.heroOvrLabel.string = String(player.ovr);
        this.heroOvrLabel.color = color(ovrHex);
        this.heroPosLabel.string = player.position;
        this.heroFootLabel.string = player.foot === 'L' ? '左脚' : '右脚';
        this.heroNameLabel.string = player.name;
        this.heroTitleLabel.string = player.title;
        this.heroStarsLabel.string = starText(player.stars) + (isLoaned ? ' 租借' : !unlocked ? ` Lv.${player.unlockLevel}` : '');

        // 右侧六维战术雷达图
        this.radar.render(player.stats, ovrHex);

        // 雷达图下方斜切技能标签
        for (let i = 0; i < 2; i++) {
            const skillId = player.skills[i];
            if (skillId) {
                const def = SKILLS[skillId];
                const col = color(def.badgeColor);
                const bx = 174 + i * 86;
                this.heroOverlayDraw.slantBox(bx, 274, 82, 22, 6, new Color(col.r, col.g, col.b, 56), col, 1.2);
                this.skillLabels[i].node.active = true;
                this.skillLabels[i].string = def.name;
                this.skillLabels[i].color = col;
            } else {
                this.skillLabels[i].node.active = false;
            }
        }

        // 底部经典实况 6 维色块数值 + 斜切分格能量条
        this.heroOverlayDraw.line([[22, 309], [368, 309]], color('#2C4560B0'), 1);
        for (let i = 0; i < STAT_KEYS.length; i++) {
            const col = i < 3 ? 0 : 1;
            const row = i % 3;
            const sx = col === 0 ? 22 : 202;
            const sy = 316 + row * 28;
            const val = player.stats[STAT_KEYS[i]];
            const hex = ratingColorHex(val);
            const badgeCol = color(hex);

            // 经典实况实心色块数字徽章（[ 95 ]）
            this.heroOverlayDraw.slantBox(sx, sy, 29, 20, 4, badgeCol);
            this.statValueLabels[i].string = String(val);
            this.statValueLabels[i].color = val >= 75 ? DARK : color('#09131F');

            // 10 格斜切能量条
            this.heroOverlayDraw.segmentedBar(sx + 34, sy + 13, 130, 6, (val - 38) / 61, 10, TRACK, badgeCol);
        }
    }

    private renderActionStrip(
        progress: PlayerProgress,
        player: PlayerProfile,
        unlocked: boolean,
        isLoaned: boolean
    ): void {
        this.actionDraw.clear();

        const showSlots = unlocked && progress.lineupMode === 'squad';
        const showSolo = unlocked && progress.lineupMode === 'solo';
        const showLocked = !unlocked;

        for (const lbl of this.slotLabels) lbl.node.active = showSlots;
        this.soloBtnLabel.node.active = showSolo;
        this.lockHintLabel.node.active = showLocked;
        this.loanBtnLabel.node.active = showLocked;

        if (showSlots) {
            for (let i = 0; i < 5; i++) {
                const r = this.slotRects[i];
                const assigned = getPlayerById(progress.squadIds[i]);
                const active = assigned.id === player.id;
                const isFifth = i === 4;
                if (active) {
                    this.actionDraw.gameButton(r.x, r.y, r.w, r.h - 2, color('#145A46'), color('#0A3327'), GREEN, 6, 3);
                } else {
                    this.actionDraw.chamferBox(
                        r.x,
                        r.y,
                        r.w,
                        r.h,
                        6,
                        color('#0E1D2FE8'),
                        isFifth ? GOLD : color('#3A536E'),
                        isFifth ? 1.4 : 1.1
                    );
                }
                const tag = isFifth ? `5★` : `${i + 1}.`;
                this.slotLabels[i].string = `${tag}${assigned.shortName.slice(0, 3)}`;
                this.slotLabels[i].color = active ? color('#D4FFE8') : isFifth ? GOLD : TEXT_MAIN;
            }
        } else if (showSolo) {
            const isSolo = progress.soloPlayerId === player.id;
            const r = this.soloBtnRect;
            if (isSolo) {
                this.actionDraw.gameButton(r.x, r.y, r.w, r.h - 2, color('#145A46'), color('#0A3327'), GREEN, 8, 3);
                this.soloBtnLabel.string = `✓ 当前单人主力 · ${player.name}`;
                this.soloBtnLabel.color = color('#D8FFEC');
            } else {
                this.actionDraw.gameButton(r.x, r.y, r.w, r.h - 2, color('#D92D20'), color('#7A1610'), color('#FF8A80'), 8, 3);
                this.soloBtnLabel.string = `设为单人主力 · ${player.shortName} 包办 5 球`;
                this.soloBtnLabel.color = TEXT_MAIN;
            }
        } else {
            this.actionDraw.chamferBox(14, 420, 150, 40, 8, color('#121E2EE6'), color('#485D74'), 1.1);
            this.lockHintLabel.string = `🔒 Lv.${player.unlockLevel} 永久解锁`;
            const r = this.loanBtnRect;
            if (isLoaned) {
                this.actionDraw.gameButton(r.x, r.y, r.w, r.h - 2, color('#145A46'), color('#0A3327'), GREEN, 8, 3);
                this.loanBtnLabel.string = '✓ 传奇租借生效中';
                this.loanBtnLabel.color = color('#D8FFEC');
            } else {
                this.actionDraw.gameButton(r.x, r.y, r.w, r.h - 2, GOLD, color('#9C6E0C'), color('#FFF1A8'), 8, 3);
                this.loanBtnLabel.string = '🎬 看视频租借踢 2 场';
                this.loanBtnLabel.color = DARK;
            }
        }
    }

    private renderGrid(progress: PlayerProgress, loanedPlayerId: string | null): void {
        this.gridCardDraw.clear();
        this.gridOverlayDraw.clear();

        // 分页斜切标签
        for (let t = 0; t < 2; t++) {
            const r = this.tabRects[t];
            const active = this.page === t;
            this.gridCardDraw.slantBox(
                r.x,
                r.y,
                r.w,
                r.h,
                8,
                active ? color('#143552F0') : color('#0C1826CC'),
                active ? CYAN : color('#314860'),
                active ? 1.5 : 1
            );
            this.tabLabels[t].color = active ? CYAN : TEXT_MUTED;
        }

        const startIdx = this.page * 8;
        const inSquad = new Set(progress.lineupMode === 'squad' ? progress.squadIds : [progress.soloPlayerId]);

        for (let i = 0; i < 8; i++) {
            const p = PLAYERS[startIdx + i];
            const r = this.cellRects[i];
            const unlocked = isPlayerUnlocked(progress, p.id);
            const selected = p.id === this.selectedPlayerId;
            const loaned = loanedPlayerId === p.id;
            const activeInLineup = unlocked && inSquad.has(p.id);
            const ovrHex = ratingColorHex(p.ovr);
            const pal = getCardTierPalette(p.stars);

            // 绘制金属切角球星卡底框
            this.gridCardDraw.cardFrame(r.x, r.y, r.w, r.h, p.stars, selected, !unlocked && !loaned, loaned);

            // 真实球员头像立绘
            const c = this.cells[i];
            const frame = this.portraits.get(p.id) ?? null;
            c.portrait.spriteFrame = frame;
            c.portrait.node.active = Boolean(frame);
            c.portrait.color = unlocked || loaned ? color('#FFFFFF') : color('#7B8999');

            // 卡片底部铭牌压盖头像下沿，形成专业 FUT 卡层次
            const plateY = r.y + r.h * 0.62;
            const bCut = 12;
            this.gridOverlayDraw.polygon(
                [
                    [r.x + 2, plateY],
                    [r.x + r.w - 2, plateY],
                    [r.x + r.w - 2, r.y + r.h - bCut],
                    [r.x + r.w - bCut, r.y + r.h - 2],
                    [r.x + bCut, r.y + r.h - 2],
                    [r.x + 2, r.y + r.h - bCut],
                ],
                unlocked || loaned ? pal.plateBg : color('#091019F2')
            );
            this.gridOverlayDraw.line(
                [[r.x + 6, plateY], [r.x + r.w - 6, plateY]],
                selected ? CYAN : loaned ? GOLD : unlocked ? pal.rimOuter : color('#3A4E62'),
                1.1
            );

            c.ovr.string = String(p.ovr);
            c.ovr.color = color(ovrHex);
            c.pos.string = `${p.position}/${p.foot}`;
            c.name.string = p.shortName;
            c.name.color = unlocked || loaned ? TEXT_MAIN : TEXT_MUTED;
            c.stars.string = starText(p.stars);

            if (loaned) {
                c.status.string = '★ 租借中';
                c.status.color = GOLD;
            } else if (activeInLineup) {
                c.status.string = '● 上阵中';
                c.status.color = GREEN;
            } else if (unlocked) {
                c.status.string = '已签约';
                c.status.color = color('#8FB3CE');
            } else {
                c.status.string = `🔒 Lv.${p.unlockLevel}`;
                c.status.color = color('#F49642');
            }
        }
    }

    hitTest(point: Point, progress: PlayerProgress): RosterAction | null {
        if (!this.root.active) return null;
        if (hitRect(point, this.backRect)) return { type: 'back' };
        if (hitRect(point, this.modeRect)) return { type: 'toggle_mode' };
        if (hitRect(point, this.autoRect)) return { type: 'auto_squad' };

        if (hitRect(point, this.tabRects[0])) return { type: 'set_page', page: 0 };
        if (hitRect(point, this.tabRects[1])) return { type: 'set_page', page: 1 };

        const player = getPlayerById(this.selectedPlayerId);
        const unlocked = isPlayerUnlocked(progress, player.id);

        if (unlocked && progress.lineupMode === 'squad') {
            for (let i = 0; i < 5; i++) {
                if (hitRect(point, this.slotRects[i])) {
                    return { type: 'assign_slot', slotIndex: i, playerId: player.id };
                }
            }
        } else if (unlocked && progress.lineupMode === 'solo') {
            if (hitRect(point, this.soloBtnRect)) {
                return { type: 'set_solo', playerId: player.id };
            }
        } else if (!unlocked) {
            if (hitRect(point, this.loanBtnRect)) {
                return { type: 'loan_player', playerId: player.id };
            }
        }

        const startIdx = this.page * 8;
        for (let i = 0; i < 8; i++) {
            if (hitRect(point, this.cellRects[i])) {
                return { type: 'select_player', playerId: PLAYERS[startIdx + i].id };
            }
        }
        return null;
    }
}
