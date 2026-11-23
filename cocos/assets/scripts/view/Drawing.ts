import { Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { Point } from '../core/ShotPhysics';

export const WIDTH = 390;
export const HEIGHT = 844;
export const color = (hex: string): Color => new Color().fromHEX(hex);
export type Pair = readonly [number, number];
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

export function hitRect(p: Point, r: Rect): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function child(parent: Node, name: string): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    return node;
}

export function place(node: Node, x: number, y: number): void {
    node.setPosition(x - WIDTH / 2, HEIGHT / 2 - y);
}

export function size(node: Node, width: number, height: number): UITransform {
    const ui = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
}

export function createSprite(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    frame?: SpriteFrame
): Sprite {
    const node = child(parent, name);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (frame) sprite.spriteFrame = frame;
    size(node, width, height);
    place(node, x, y);
    return sprite;
}

export function text(
    parent: Node,
    name: string,
    value: string,
    x: number,
    y: number,
    fontSize: number,
    fill: Color,
    align: 'left' | 'center' | 'right' = 'center',
    width = 340,
    bold = false,
    italic = false
): Label {
    const node = child(parent, name);
    const label = node.addComponent(Label);
    label.string = value;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.isBold = bold;
    label.isItalic = italic;
    label.color = fill;
    label.horizontalAlign = align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
            ? Label.HorizontalAlign.RIGHT
            : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    size(node, width, fontSize + 14);
    place(node, x + (align === 'left' ? width / 2 : align === 'right' ? -width / 2 : 0), y);
    return label;
}

export interface CardTierPalette {
    readonly bgTop: Color;
    readonly bgBottom: Color;
    readonly rimOuter: Color;
    readonly rimInner: Color;
    readonly sheen: Color;
    readonly plateBg: Color;
}

const CARD_TIERS: Record<1 | 2 | 3 | 4 | 5, CardTierPalette> = {
    1: {
        // 1★ 青铜新秀卡
        bgTop: color('#3B271DF0'),
        bgBottom: color('#1B120EF5'),
        rimOuter: color('#C48255'),
        rimInner: color('#6A452C'),
        sheen: new Color(255, 210, 175, 22),
        plateBg: color('#160F0CEB'),
    },
    2: {
        // 2★ 白银职业卡
        bgTop: color('#2E3E50F0'),
        bgBottom: color('#151E29F5'),
        rimOuter: color('#C9D8E8'),
        rimInner: color('#60758B'),
        sheen: new Color(220, 240, 255, 24),
        plateBg: color('#101822EB'),
    },
    3: {
        // 3★ 黄金球星卡
        bgTop: color('#4A3912F2'),
        bgBottom: color('#1E1709F6'),
        rimOuter: color('#F7CC52'),
        rimInner: color('#8E6C1E'),
        sheen: new Color(255, 232, 140, 28),
        plateBg: color('#171206EE'),
    },
    4: {
        // 4★ 欧冠电光蓝紫卡
        bgTop: color('#1A2E66F4'),
        bgBottom: color('#0C132CF8'),
        rimOuter: color('#38D9FF'),
        rimInner: color('#5D6BFF'),
        sheen: new Color(80, 220, 255, 28),
        plateBg: color('#091024F0'),
    },
    5: {
        // 5★ 殿堂传奇黑金赤卡
        bgTop: color('#3B1422F6'),
        bgBottom: color('#120910FA'),
        rimOuter: color('#FFCA4B'),
        rimInner: color('#FF4D6D'),
        sheen: new Color(255, 206, 96, 34),
        plateBg: color('#14080DF2'),
    },
};

export function getCardTierPalette(stars: 1 | 2 | 3 | 4 | 5): CardTierPalette {
    return CARD_TIERS[stars];
}

export class Drawing {
    readonly node: Node;
    readonly g: Graphics;

    constructor(parent: Node, name: string) {
        this.node = child(parent, name);
        place(this.node, 0, 0);
        this.g = this.node.addComponent(Graphics);
        this.g.lineJoin = Graphics.LineJoin.MITER;
        this.g.lineCap = Graphics.LineCap.BUTT;
    }

    clear(): void {
        this.g.clear();
    }

    box(
        x: number,
        y: number,
        width: number,
        height: number,
        fill: Color,
        radius = 0,
        border?: Color,
        borderWidth = 1
    ): void {
        if (radius) this.g.roundRect(x, -y - height, width, height, radius);
        else this.g.rect(x, -y - height, width, height);
        this.g.fillColor = fill;
        this.g.fill();
        if (border) {
            this.g.lineWidth = borderWidth;
            this.g.strokeColor = border;
            this.g.stroke();
        }
    }

    /** 切角运动风面板（替代网页圆角框） */
    chamferBox(
        x: number,
        y: number,
        w: number,
        h: number,
        cut: number,
        fill: Color,
        border?: Color,
        borderWidth = 1.2
    ): void {
        const c = Math.min(cut, w * 0.25, h * 0.45);
        const path: Pair[] = [
            [x + c, y],
            [x + w, y],
            [x + w, y + h - c],
            [x + w - c, y + h],
            [x, y + h],
            [x, y + c],
        ];
        this.polygon(path, fill, border, borderWidth);
    }

    /** 体育转播斜切色块（平行四边形） */
    slantBox(
        x: number,
        y: number,
        w: number,
        h: number,
        skew: number,
        fill: Color,
        border?: Color,
        borderWidth = 1.2
    ): void {
        const path: Pair[] = [
            [x + skew, y],
            [x + w, y],
            [x + w - skew, y + h],
            [x, y + h],
        ];
        this.polygon(path, fill, border, borderWidth);
    }

    /** 带厚底立体感与高光斜切的实体游戏按钮 */
    gameButton(
        x: number,
        y: number,
        w: number,
        h: number,
        faceColor: Color,
        depthColor: Color,
        highlightColor: Color,
        cut = 9,
        depth = 4
    ): void {
        // 底部厚影
        this.chamferBox(x, y + depth, w, h, cut, depthColor);
        // 按钮主体
        this.chamferBox(x, y, w, h, cut, faceColor, highlightColor, 1.3);
        // 上半部高光斜带（游戏质感反光）
        const gloss: Pair[] = [
            [x + cut + 2, y + 2],
            [x + w - 2, y + 2],
            [x + w - 2, y + h * 0.42],
            [x + 2, y + h * 0.42],
            [x + 2, y + cut + 2],
        ];
        this.polygon(gloss, new Color(255, 255, 255, 26));
        // 斜向动态反光条
        const sx = x + w * 0.68;
        this.polygon(
            [[sx, y + 2], [sx + 18, y + 2], [sx + 4, y + h - 2], [sx - 14, y + h - 2]],
            new Color(255, 255, 255, 22)
        );
    }

    /** 实况 / FUT 风格金属切角球星卡框 */
    cardFrame(
        x: number,
        y: number,
        w: number,
        h: number,
        stars: 1 | 2 | 3 | 4 | 5,
        selected = false,
        locked = false,
        loaned = false
    ): void {
        const pal = getCardTierPalette(stars);
        const cut = Math.round(Math.min(12, w * 0.13));
        const bCut = Math.round(Math.min(14, w * 0.16));

        // 盾形切角轮廓（顶部左右小切角，底部大倒梯切角）
        const outer: Pair[] = [
            [x + cut, y],
            [x + w - cut, y],
            [x + w, y + cut],
            [x + w, y + h - bCut],
            [x + w - bCut, y + h],
            [x + bCut, y + h],
            [x, y + h - bCut],
            [x, y + cut],
        ];
        this.polygon(outer, locked ? color('#0E1622EA') : pal.bgBottom);

        // 上半部金属光泽底
        const topHalf: Pair[] = [
            [x + cut, y + 1],
            [x + w - cut, y + 1],
            [x + w - 1, y + cut],
            [x + w - 1, y + h * 0.56],
            [x + 1, y + h * 0.56],
            [x + 1, y + cut],
        ];
        this.polygon(topHalf, locked ? color('#162131DC') : pal.bgTop);

        // 斜向球场光斑条纹
        if (!locked) {
            this.polygon(
                [[x + w * 0.18, y + 2], [x + w * 0.42, y + 2], [x + w * 0.15, y + h * 0.72], [x + 2, y + h * 0.72]],
                pal.sheen
            );
            this.polygon(
                [[x + w * 0.58, y + 2], [x + w * 0.72, y + 2], [x + w * 0.45, y + h * 0.72], [x + w * 0.32, y + h * 0.72]],
                pal.sheen
            );
        }

        // 底部铭牌深底区
        const plateY = y + h * 0.64;
        const plate: Pair[] = [
            [x + 2, plateY],
            [x + w - 2, plateY],
            [x + w - 2, y + h - bCut],
            [x + w - bCut, y + h - 2],
            [x + bCut, y + h - 2],
            [x + 2, y + h - bCut],
        ];
        this.polygon(plate, locked ? color('#091019EE') : pal.plateBg);
        // 分割金属细线
        this.line([[x + 6, plateY], [x + w - 6, plateY]], locked ? color('#34465A') : pal.rimOuter, 1);

        // 外框金属边（选中/租借高亮）
        const rimColor = selected
            ? color('#38E8FF')
            : loaned
                ? color('#FFCA4B')
                : locked
                    ? color('#3A4D62')
                    : pal.rimOuter;
        this.outlinePolygon(outer, rimColor, selected ? 2.4 : loaned ? 2.0 : 1.35);

        // 顶部小冠饰高光
        this.line(
            [[x + cut + 4, y + 2.5], [x + w - cut - 4, y + 2.5]],
            selected ? color('#A8F5FF') : locked ? color('#4B5E73') : pal.rimOuter,
            1.6
        );
    }

    /** 实况风分格斜切能量条 */
    segmentedBar(
        x: number,
        y: number,
        width: number,
        height: number,
        ratio: number,
        segments: number,
        track: Color,
        fill: Color
    ): void {
        const clamped = Math.max(0, Math.min(1, ratio));
        const gap = 2;
        const segW = (width - gap * (segments - 1)) / segments;
        const filledCount = clamped * segments;
        for (let i = 0; i < segments; i++) {
            const sx = x + i * (segW + gap);
            const active = i + 0.35 <= filledCount;
            this.slantBox(sx, y, segW, height, 2, active ? fill : track);
        }
    }

    strokeBox(x: number, y: number, width: number, height: number, border: Color, radius = 0, borderWidth = 1.2): void {
        if (radius) this.g.roundRect(x, -y - height, width, height, radius);
        else this.g.rect(x, -y - height, width, height);
        this.g.lineWidth = borderWidth;
        this.g.strokeColor = border;
        this.g.stroke();
    }

    line(path: readonly Pair[], fill: Color, width: number): void {
        if (path.length < 2) return;
        this.g.moveTo(path[0][0], -path[0][1]);
        for (let i = 1; i < path.length; i++) this.g.lineTo(path[i][0], -path[i][1]);
        this.g.strokeColor = fill;
        this.g.lineWidth = width;
        this.g.stroke();
    }

    polygon(path: readonly Pair[], fill: Color, border?: Color, borderWidth = 1.2): void {
        if (path.length < 3) return;
        this.g.moveTo(path[0][0], -path[0][1]);
        for (let i = 1; i < path.length; i++) this.g.lineTo(path[i][0], -path[i][1]);
        this.g.close();
        this.g.fillColor = fill;
        this.g.fill();
        if (border) {
            this.g.strokeColor = border;
            this.g.lineWidth = borderWidth;
            this.g.stroke();
        }
    }

    outlinePolygon(path: readonly Pair[], border: Color, borderWidth = 1): void {
        if (path.length < 3) return;
        this.g.moveTo(path[0][0], -path[0][1]);
        for (let i = 1; i < path.length; i++) this.g.lineTo(path[i][0], -path[i][1]);
        this.g.close();
        this.g.strokeColor = border;
        this.g.lineWidth = borderWidth;
        this.g.stroke();
    }

    ellipse(x: number, y: number, rx: number, ry: number, fill: Color): void {
        this.g.ellipse(x, -y, rx, ry);
        this.g.fillColor = fill;
        this.g.fill();
    }

    ellipseStroke(x: number, y: number, rx: number, ry: number, border: Color, width: number): void {
        this.g.ellipse(x, -y, rx, ry);
        this.g.strokeColor = border;
        this.g.lineWidth = width;
        this.g.stroke();
    }

    ring(x: number, y: number, radius: number, fill: Color, width: number): void {
        this.g.circle(x, -y, radius);
        this.g.strokeColor = fill;
        this.g.lineWidth = width;
        this.g.stroke();
    }

    progressBar(
        x: number,
        y: number,
        width: number,
        height: number,
        ratio: number,
        track: Color,
        fill: Color,
        radius = height / 2
    ): void {
        const clamped = Math.max(0, Math.min(1, ratio));
        this.box(x, y, width, height, track, radius);
        const w = width * clamped;
        if (w >= 1.5) {
            this.box(x, y, w, height, fill, Math.min(radius, w / 2));
        }
    }
}
