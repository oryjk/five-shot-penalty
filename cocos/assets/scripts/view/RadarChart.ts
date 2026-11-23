import { Color, Label, Node } from 'cc';
import { clamp, ratingColorHex, STAT_KEYS, STAT_LABELS } from '../core/Attributes';
import type { PlayerStats } from '../core/Attributes';
import { child, color, Drawing, Pair, text } from './Drawing';

const AXES = 6;
const WEB_OUTER = color('#5882A8E0');
const WEB_INNER = color('#2E4A66B0');
const SPOKE_COLOR = color('#355370AA');
const LABEL_CODE = color('#B6CCE0');

/**
 * 实况足球（PES / eFootball）风格战术六维能力雷达图。
 */
export class RadarChart {
    readonly root: Node;
    private readonly draw: Drawing;
    private readonly valueLabels: Label[] = [];
    private readonly cx: number;
    private readonly cy: number;
    private readonly radius: number;

    constructor(parent: Node, name: string, cx: number, cy: number, radius: number) {
        this.root = child(parent, name);
        this.cx = cx;
        this.cy = cy;
        this.radius = radius;
        this.draw = new Drawing(this.root, 'Radar canvas');

        for (let i = 0; i < AXES; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI * 2) / AXES;
            const key = STAT_KEYS[i];
            const lx = cx + Math.cos(angle) * (radius + 22);
            const ly = cy + Math.sin(angle) * (radius + 18);
            text(this.root, 'Axis ' + key, STAT_LABELS[key].code, lx, ly - 6, 9, LABEL_CODE, 'center', 40, true);
            const val = text(this.root, 'Val ' + key, '70', lx, ly + 6, 11.5, color('#FFFFFF'), 'center', 42, true, true);
            this.valueLabels.push(val);
        }
    }

    render(stats: PlayerStats, accentHex: string): void {
        this.draw.clear();

        // 底座六边形微光底板
        const bgPoly: Pair[] = [];
        for (let i = 0; i < AXES; i++) {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / AXES;
            bgPoly.push([this.cx + Math.cos(a) * this.radius, this.cy + Math.sin(a) * this.radius]);
        }
        this.draw.polygon(bgPoly, color('#0A1828B8'));

        // 3 层正六边形战术网格
        for (const scale of [0.36, 0.68, 1.0]) {
            const ring: Pair[] = [];
            for (let i = 0; i < AXES; i++) {
                const a = -Math.PI / 2 + (i * Math.PI * 2) / AXES;
                ring.push([this.cx + Math.cos(a) * this.radius * scale, this.cy + Math.sin(a) * this.radius * scale]);
            }
            this.draw.outlinePolygon(ring, scale === 1.0 ? WEB_OUTER : WEB_INNER, scale === 1.0 ? 1.4 : 0.9);
        }

        // 径向轴线
        for (let i = 0; i < AXES; i++) {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / AXES;
            this.draw.line(
                [[this.cx, this.cy], [this.cx + Math.cos(a) * this.radius, this.cy + Math.sin(a) * this.radius]],
                SPOKE_COLOR,
                0.9
            );
        }

        // 能力多边形（40..99 映射到 0.18..1.00，高分球员呈压迫感满格六边形）
        const poly: Pair[] = [];
        for (let i = 0; i < AXES; i++) {
            const key = STAT_KEYS[i];
            const v = stats[key];
            const ratio = clamp(0.18 + ((v - 40) / 59) * 0.82, 0.18, 1.0);
            const a = -Math.PI / 2 + (i * Math.PI * 2) / AXES;
            poly.push([this.cx + Math.cos(a) * this.radius * ratio, this.cy + Math.sin(a) * this.radius * ratio]);
            this.valueLabels[i].string = String(v);
            this.valueLabels[i].color = color(ratingColorHex(v));
        }

        const stroke = color(accentHex);
        const fill = new Color(stroke.r, stroke.g, stroke.b, 96);
        this.draw.polygon(poly, fill, stroke, 2.0);

        for (let i = 0; i < poly.length; i++) {
            const key = STAT_KEYS[i];
            this.draw.ellipse(poly[i][0], poly[i][1], 3.1, 3.1, color(ratingColorHex(stats[key])));
        }
    }
}
