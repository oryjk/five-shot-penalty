import test from 'node:test';
import assert from 'node:assert/strict';

import { ratingColorHex } from '../assets/scripts/core/Attributes';
import {
    DIVISIONS,
    KEEPERS,
    PLAYERS,
    getKeeperForLevel,
    getPlayerById,
    getUnlockedPlayers,
    buildRecommendedSquad,
} from '../assets/scripts/core/Roster';
import {
    SwipeInput,
    aimFromSwipe,
    aimFromTrail,
    computeSpread,
    evaluateGoalFrame,
} from '../assets/scripts/core/ShotPhysics';
import { resolveShot } from '../assets/scripts/core/KeeperAI';
import {
    applyDoubleXpReward,
    createDefaultProgress,
    getMatchLineup,
    isNewbieProtected,
    settleMatch,
} from '../assets/scripts/core/Progression';
import { PenaltyMatch, TOTAL_SHOTS } from '../assets/scripts/core/PenaltyMatch';
import { AdManager } from '../assets/scripts/core/AdManager';

function makeSeededRng(seed = 123456789) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

const origin = { x: 195, y: 660 };
const toPoint = (dx, dy) => ({ x: origin.x + dx, y: origin.y + dy });

test('roster integrity: 8 divisions, 8 keepers, 16 PES-rated players unlocked progressively', () => {
    assert.equal(DIVISIONS.length, 8);
    assert.equal(KEEPERS.length, 8);
    assert.equal(PLAYERS.length, 16);
    assert.equal(getUnlockedPlayers(1).length, 2);
    assert.equal(getUnlockedPlayers(4).length, 8);
    assert.equal(getUnlockedPlayers(8).length, 16);
    assert.equal(ratingColorHex(97), '#FF5C72');
    assert.equal(ratingColorHex(91), '#28E4FF');
    assert.equal(ratingColorHex(84), '#46E484');
    assert.equal(ratingColorHex(76), '#F7D44C');
    assert.equal(ratingColorHex(68), '#F49642');
    assert.equal(ratingColorHex(60), '#9AA8B8');
});

test('single-finger swipe captures power zones, banana curl, feint direction switch, and panenka chip', () => {
    const swipe = new SwipeInput();
    assert.equal(swipe.start(1, origin, 0), true);
    assert.equal(swipe.start(2, origin, 10), false);
    assert.equal(swipe.move(2, toPoint(0, -100), 20), null);

    // 轻巧中路 -> 勺子点球
    const panenka = aimFromSwipe(origin, toPoint(4, -56));
    assert.ok(panenka);
    assert.equal(panenka.zone, 'finesse');
    assert.equal(panenka.isPanenka, true);

    // 弯曲轨迹 -> 弧线搓射
    const curved = aimFromTrail([
        { x: 195, y: 660, t: 0 },
        { x: 148, y: 600, t: 90 },
        { x: 170, y: 555, t: 180 },
    ]);
    assert.ok(curved);
    assert.ok(curved.curve > 0.25, `expected positive right-bending curve, got ${curved.curve}`);

    // 先瞄左再甩向右 -> 变向假动作
    const feint = aimFromTrail([
        { x: 195, y: 660, t: 0 },
        { x: 145, y: 600, t: 140 },
        { x: 150, y: 590, t: 340 },
        { x: 245, y: 555, t: 460 },
    ]);
    assert.ok(feint);
    assert.ok(feint.feintScore > 0.45, `expected high feintScore, got ${feint.feintScore}`);
    assert.equal(feint.initialSide, -1);

    // 拉满力量 -> 过载红区
    const overload = aimFromSwipe(origin, toPoint(-45, -195));
    assert.ok(overload);
    assert.equal(overload.zone, 'overload');
});

test('realistic physics: overload power can sky over crossbar while finesse & higher FIN tighten spread', () => {
    const rookie = getPlayerById('lin_chen');       // OVR 63, FIN 65
    const legend = getPlayerById('pelegrino_oro');  // OVR 99, FIN 99
    const gk1 = getKeeperForLevel(1);
    const gk7 = getKeeperForLevel(7);

    const overloadAim = aimFromSwipe(origin, toPoint(-35, -210));
    const goldenAim = aimFromSwipe(origin, toPoint(-48, -110));
    assert.ok(overloadAim && goldenAim);

    const rookieOverloadSpread = computeSpread(overloadAim, { player: rookie, keeper: gk1, isClutchShot: false });
    const rookieGoldenSpread = computeSpread(goldenAim, { player: rookie, keeper: gk1, isClutchShot: false });
    const legendOverloadSpread = computeSpread(overloadAim, { player: legend, keeper: gk1, isClutchShot: false });

    // 1. 过载发力的散布与上扬远大于黄金区，证明“不是力量越大越容易进”
    assert.ok(rookieOverloadSpread.radiusX > rookieGoldenSpread.radiusX * 2);
    assert.ok(rookieOverloadSpread.skyLift > 0.35);

    // 2. 顶级传奇球员的散布明显小于青训球员，素质表真实影响手感
    assert.ok(legendOverloadSpread.radiusX < rookieOverloadSpread.radiusX * 0.65);
    assert.ok(legendOverloadSpread.skyLift < rookieOverloadSpread.skyLift * 0.7);

    // 3. Lv.7 威慑门神会让低冷静新秀产生明显压力抖动，而 98 冷静球王几乎免疫
    const rookiePressure = computeSpread(goldenAim, { player: rookie, keeper: gk7, isClutchShot: true });
    const legendPressure = computeSpread(goldenAim, { player: legend, keeper: gk7, isClutchShot: true });
    assert.ok(rookiePressure.pressureJitter > 0.12);
    assert.ok(legendPressure.pressureJitter < 0.05);

    // 4. 蒙特卡洛验证：青训球员无脑拉满红区，大量打飞/失手；黄金力度控角进球率远高于无脑满力！
    const rng = makeSeededRng(42);
    let overloadSkies = 0;
    let overloadGoals = 0;
    let goldenGoals = 0;
    let rookieVsLv2Goals = 0;
    let legendVsLv2Goals = 0;
    const gk2 = getKeeperForLevel(2);
    const N = 300;
    for (let i = 0; i < N; i++) {
        const sOver = resolveShot({ aim: overloadAim, player: rookie, keeper: gk1, readyTime: 0.3, isClutchShot: false, historySides: [], rng });
        if (sOver.verdictTag === 'miss_sky') overloadSkies++;
        if (sOver.outcome === 'goal') overloadGoals++;

        const sGold = resolveShot({ aim: goldenAim, player: rookie, keeper: gk1, readyTime: 0.3, isClutchShot: false, historySides: [], rng });
        if (sGold.outcome === 'goal') goldenGoals++;

        const rLv2 = resolveShot({ aim: goldenAim, player: rookie, keeper: gk2, readyTime: 0.3, isClutchShot: false, historySides: [], rng });
        if (rLv2.outcome === 'goal') rookieVsLv2Goals++;

        const lLv2 = resolveShot({ aim: goldenAim, player: legend, keeper: gk2, readyTime: 0.3, isClutchShot: false, historySides: [], rng });
        if (lLv2.outcome === 'goal') legendVsLv2Goals++;
    }
    assert.ok(overloadSkies > N * 0.35, `expected frequent sky misses on overload, got ${overloadSkies}/${N}`);
    assert.ok(goldenGoals > overloadGoals, `expected golden shot (${goldenGoals}) to beat reckless overload (${overloadGoals})`);
    // 难度曲线校验：63分青训面对 Lv.2 门将应该明显遇到阻力（不会被轻松 100% 射穿），而 99分传奇明显压制！
    assert.ok(rookieVsLv2Goals < N * 0.72, `Lv.2 keeper should challenge rookie, got ${rookieVsLv2Goals}/${N}`);
    assert.ok(legendVsLv2Goals > rookieVsLv2Goals + 25, `Legend (${legendVsLv2Goals}) should clearly outperform rookie (${rookieVsLv2Goals})`);
});

test('keeper styles create genuine tactical counters: panenka destroys gambler but loses to anchor', () => {
    const panenkaMaster = getPlayerById('anton_panek');
    const anchorGk = getKeeperForLevel(3);   // 站桩稳健型
    const gamblerGk = getKeeperForLevel(4);  // 激进飞扑型
    const panenkaAim = aimFromSwipe(origin, toPoint(0, -56));
    assert.ok(panenkaAim && panenkaAim.isPanenka);

    const rng = makeSeededRng(99);
    let goalsVsGambler = 0;
    let goalsVsAnchor = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
        const rG = resolveShot({ aim: panenkaAim, player: panenkaMaster, keeper: gamblerGk, readyTime: 0.2, isClutchShot: false, historySides: [], rng });
        if (rG.outcome === 'goal') goalsVsGambler++;

        const rA = resolveShot({ aim: panenkaAim, player: panenkaMaster, keeper: anchorGk, readyTime: 0.2, isClutchShot: false, historySides: [], rng });
        if (rA.outcome === 'goal') goalsVsAnchor++;
    }
    assert.ok(goalsVsGambler > N * 0.72, `panenka should crush gambler keeper, got ${goalsVsGambler}/${N}`);
    assert.ok(goalsVsAnchor < goalsVsGambler - 50, `anchor keeper should counter panenka (${goalsVsAnchor} vs ${goalsVsGambler})`);
});

test('post physics distinguishes inner-edge post_in goal vs outer post_out miss', () => {
    assert.equal(evaluateGoalFrame(3.60, 1.2), 'post_in');
    assert.equal(evaluateGoalFrame(3.70, 1.2), 'post_out');
    assert.equal(evaluateGoalFrame(0, 2.85), 'sky_over');
});

test('VAR mulligan hook triggers on high-stakes miss, rolls back cleanly, and is capped at 1 per match', () => {
    const lineup = buildRecommendedSquad(3).map(getPlayerById);
    const keeper = getKeeperForLevel(3);
    const match = new PenaltyMatch({
        level: 3,
        mode: 'promotion',
        lineup,
        keeper,
        newbieProtected: false,
        rng: makeSeededRng(7),
    });

    // 故意用偏出界外的射门模拟晋级赛前 3 球失误 -> 第 3 球后已不可能凑够 3 球（还剩 2 球）-> 触发 VAR！
    const wideAim = aimFromSwipe(origin, toPoint(170, -50));
    assert.ok(wideAim);

    for (let i = 0; i < 3; i++) {
        assert.equal(match.kick(wideAim, 0.2), true);
        match.advance(match.shot.duration + 2);
    }
    assert.equal(match.stage, 'var_offer');
    assert.equal(match.shots.length, 3);

    // 看完激励视频重罚第 3 球
    assert.equal(match.acceptVarMulligan(), true);
    assert.equal(match.varUsed, true);
    assert.equal(match.stage, 'ready');
    assert.equal(match.shots.length, 2);

    // 再次踢偏不再重复弹窗（每局限 1 次）
    assert.equal(match.kick(wideAim, 0.2), true);
    match.advance(match.shot.duration + 2);
    assert.equal(match.stage, 'ready');
});

test('career progression, promotion win unlocks next level players, and double-XP can trigger promoReady', () => {
    const progress = createDefaultProgress(new Date('2026-11-22T12:00:00Z'));
    assert.equal(isNewbieProtected(progress), true);

    const rookie = getPlayerById('lin_chen');
    const gk1 = getKeeperForLevel(1);
    const rng = makeSeededRng(2026);
    const fakeGoal = resolveShot({
        aim: aimFromSwipe(origin, toPoint(-42, -108)),
        player: rookie,
        keeper: gk1,
        readyTime: 0.2,
        isClutchShot: false,
        historySides: [],
        rng,
    });
    const goalShot = { ...fakeGoal, outcome: 'goal', contact: 'net', verdictTag: 'clean_goal' };

    // 第 1 局：5/5 满贯直接触发晋级战，不再卡在差几分尴尬推广告！
    const r1 = settleMatch(progress, [goalShot, goalShot, goalShot, goalShot, goalShot], 'career', false);
    assert.ok(r1.breakdown.totalXp > 150);
    assert.equal(progress.totalMatches, 1);
    assert.equal(progress.promoReady, true);
    assert.equal(r1.isEligibleForDoubleXp, false);

    // 赢下晋级赛 -> 升至 Lv.2 并解锁 2 名新球员；已胜利晋级时不弹结算广告打扰！
    const promo = settleMatch(progress, [goalShot, goalShot, goalShot, goalShot, goalShot], 'promotion', true);
    assert.equal(promo.promoted, true);
    assert.equal(progress.level, 2);
    assert.equal(promo.newlyUnlocked.length, 2);
    assert.equal(promo.isEligibleForScoutLegendHook, false);
    assert.equal(promo.isEligibleForDoubleXp, false);
    assert.equal(getMatchLineup(progress, 'leo_lapa')[0].id, 'leo_lapa');

    // 验证低分局（只进 1 球被 Lv.2 门将压制）触发破局租借传奇钩子！
    const missShot = { ...fakeGoal, outcome: 'save', contact: 'glove', verdictTag: 'saved_reflex' };
    const tough = settleMatch(progress, [goalShot, missShot, missShot, missShot, missShot], 'career', false);
    assert.equal(tough.isEligibleForScoutLegendHook, true);

    // 验证普通局（进 3 球）在剩余经验缺口较大时正常触发双倍 XP 暴击钩子
    progress.xp = 0;
    const r2 = settleMatch(progress, [goalShot, goalShot, goalShot, missShot, missShot], 'career', false);
    assert.equal(progress.promoReady, false);
    assert.equal(r2.isEligibleForDoubleXp, true);
    const dbl = applyDoubleXpReward(progress, r2.breakdown.totalXp);
    assert.equal(dbl.triggeredPromoReady, true);
});

test('AdManager pure rewarded video handles rewarded, closed_early, and graceful unavailable fallback', async () => {
    const ad = new AdManager();
    const unavail = await ad.showRewarded('var_mulligan');
    assert.equal(unavail.status, 'unavailable');

    ad.setSimulatedHandler(async () => false);
    const early = await ad.showRewarded('double_xp');
    assert.equal(early.status, 'closed_early');

    ad.setSimulatedHandler(async () => true);
    const ok = await ad.showRewarded('loan_legend');
    assert.equal(ok.status, 'rewarded');
});
