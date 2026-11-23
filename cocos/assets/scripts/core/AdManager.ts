/**
 * 微信小游戏纯激励视频广告管理器（零插屏、零 Banner，保持画面极致清爽）。
 * 上线前将 AD_UNIT_IDS 中的占位符替换为微信公众平台后台生成的真实广告位 ID 即可生效。
 */

export type AdPlacement =
    | 'var_mulligan'  // S1: VAR 判定重罚本球（每局限 1 次）
    | 'loan_legend'   // S2: 传奇球星单场租借体验
    | 'double_xp'     // S3: 精彩局经验 ×2 暴击
    | 'scout_intel'   // S4: 赛前球探情报 + 黄金脚感
    | 'daily_retry';  // S5: 每日传奇挑战加赛

export interface AdPlacementMeta {
    readonly id: AdPlacement;
    readonly title: string;
    readonly rewardSummary: string;
}

export const AD_PLACEMENTS: Record<AdPlacement, AdPlacementMeta> = {
    var_mulligan: {
        id: 'var_mulligan',
        title: 'VAR 裁判回看重罚',
        rewardSummary: '门将疑似提前移动，立即重罚这一球',
    },
    loan_legend: {
        id: 'loan_legend',
        title: '传奇球星 2 场限时租借',
        rewardSummary: '连续 2 场启用未解锁的 95+ 顶级传奇核心主罚',
    },
    double_xp: {
        id: 'double_xp',
        title: '赛后经验 ×2 暴击',
        rewardSummary: '立即双倍领取本局声望经验，加速升段',
    },
    scout_intel: {
        id: 'scout_intel',
        title: '球探绝密情报',
        rewardSummary: '2 球门将弱侧提示 + 本场散布圈缩小 18%',
    },
    daily_retry: {
        id: 'daily_retry',
        title: '每日传奇再战一次',
        rewardSummary: '解锁本场每日传奇挑战加赛机会',
    },
};

/** 微信后台激励视频广告位 ID（可全复用 1 个主 ID 或按场景拆分统计 eCPM） */
export const AD_UNIT_IDS: Record<AdPlacement, string> = {
    var_mulligan: '',
    loan_legend: '',
    double_xp: '',
    scout_intel: '',
    daily_retry: '',
};

export type AdShowStatus = 'rewarded' | 'closed_early' | 'unavailable';

export interface AdShowResult {
    readonly placement: AdPlacement;
    readonly status: AdShowStatus;
    readonly message: string;
}

interface WxRewardedVideoAd {
    load: () => Promise<void>;
    show: () => Promise<void>;
    onClose: (cb: (res?: { isEnded?: boolean }) => void) => void;
    offClose?: (cb: (res?: { isEnded?: boolean }) => void) => void;
    onError: (cb: (err: unknown) => void) => void;
    offError?: (cb: (err: unknown) => void) => void;
}

interface WxAdRuntime {
    createRewardedVideoAd?: (options: { adUnitId: string }) => WxRewardedVideoAd;
}

export type SimulatedAdHandler = (meta: AdPlacementMeta) => Promise<boolean>;

export class AdManager {
    private readonly instances = new Map<string, WxRewardedVideoAd>();
    private readonly unitIds: Record<AdPlacement, string>;
    private busy = false;
    private simulatedHandler: SimulatedAdHandler | null = null;

    constructor(unitIds: Record<AdPlacement, string> = AD_UNIT_IDS) {
        this.unitIds = unitIds;
    }

    /** 注册非微信环境（Web/编辑器）的激励视频模拟弹窗回调 */
    setSimulatedHandler(handler: SimulatedAdHandler | null): void {
        this.simulatedHandler = handler;
    }

    get isBusy(): boolean {
        return this.busy;
    }

    private getWx(): WxAdRuntime | undefined {
        return (globalThis as typeof globalThis & { wx?: WxAdRuntime }).wx;
    }

    private getOrCreateWxAd(unitId: string): WxRewardedVideoAd | null {
        const wx = this.getWx();
        if (!wx?.createRewardedVideoAd || !unitId) return null;
        let ad = this.instances.get(unitId);
        if (!ad) {
            ad = wx.createRewardedVideoAd({ adUnitId: unitId });
            ad.onError(() => { /* 无填充降级由 show 流程统一处理 */ });
            this.instances.set(unitId, ad);
        }
        return ad;
    }

    /** 预加载指定广告位（在微信环境中无感缓存视频） */
    preload(placement: AdPlacement): void {
        const unitId = this.unitIds[placement];
        const ad = this.getOrCreateWxAd(unitId);
        if (!ad) return;
        void ad.load().catch(() => { /* 忽略预加载失败 */ });
    }

    /**
     * 展示激励视频广告并严格校验是否完整观看。
     * 1. 若配置了真实微信 adUnitId 且处于微信小游戏环境 -> 拉起真实微信激励视频。
     * 2. 若未配置 adUnitId 或处于 Web/编辑器预览 -> 走模拟激励视频弹窗，方便完整验收所有钩子。
     */
    async showRewarded(placement: AdPlacement): Promise<AdShowResult> {
        if (this.busy) {
            return { placement, status: 'unavailable', message: '广告加载中，请稍候' };
        }
        const meta = AD_PLACEMENTS[placement];
        const unitId = this.unitIds[placement];
        const wxAd = this.getOrCreateWxAd(unitId);

        this.busy = true;
        try {
            if (wxAd) {
                return await this.runWxRewarded(placement, wxAd);
            }
            if (this.simulatedHandler) {
                const completed = await this.simulatedHandler(meta);
                return completed
                    ? { placement, status: 'rewarded', message: '已完整观看，奖励生效！' }
                    : { placement, status: 'closed_early', message: '未完整观看视频，未发放奖励' };
            }
            // 无模拟处理器且无微信 SDK 时（如单元测试），默认直接降级不可用
            return { placement, status: 'unavailable', message: '暂无球探赞助视频' };
        } finally {
            this.busy = false;
        }
    }

    private runWxRewarded(placement: AdPlacement, ad: WxRewardedVideoAd): Promise<AdShowResult> {
        return new Promise(resolve => {
            let settled = false;
            const finish = (status: AdShowStatus, message: string) => {
                if (settled) return;
                settled = true;
                ad.offClose?.(onClose);
                ad.offError?.(onError);
                resolve({ placement, status, message });
            };
            const onClose = (res?: { isEnded?: boolean }) => {
                const ended = !res || Boolean(res.isEnded);
                if (ended) finish('rewarded', '奖励已发放');
                else finish('closed_early', '需看完视频才能领取奖励');
            };
            const onError = () => {
                finish('unavailable', '当前暂无可用视频，请稍后再试');
            };

            ad.onClose(onClose);
            ad.onError(onError);
            ad.show().catch(() => {
                ad.load()
                    .then(() => ad.show())
                    .catch(() => finish('unavailable', '当前暂无可用视频，请稍后再试'));
            });
        });
    }
}
