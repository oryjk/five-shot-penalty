# 足球洞察 · 实况点球大师（微信小游戏）

使用 **Cocos Creator 3.8.8 + TypeScript** 开发的竖屏实况风格点球微信小游戏。

## 核心玩法与重构亮点

1. **真实点球物理与门将心理博弈**（[ShotPhysics.ts](cocos/assets/scripts/core/ShotPhysics.ts)、[KeeperAI.ts](cocos/assets/scripts/core/KeeperAI.ts)）
   - **四区间发力与动态散布圆**：轻巧推射（极准/中路触发勺子挑射）、黄金发力、强力抽射、过载红区（发力过猛附带上扬偏移与散布失控，低精度球员极易打飞）。
   - **单指手势深度**：直线滑动抽射/推射、弯曲轨迹搓出真实香蕉球弧线、滑动中变向停顿触发假动作骗门将重心。
   - **真实三阶段门将 AI**：按 7 种性格流派（新手/均衡/站桩/激进赌徒/读心记忆/威慑狮王/传奇全知）独立预判与反应，不再作弊直读落点，且包含擦柱入网与砸框弹出判定。
2. **实况足球（PES）风格球员素质表**（[Attributes.ts](cocos/assets/scripts/core/Attributes.ts)、[Roster.ts](cocos/assets/scripts/core/Roster.ts)、[RosterPanel.ts](cocos/assets/scripts/view/RosterPanel.ts)、[RadarChart.ts](cocos/assets/scripts/view/RadarChart.ts)）
   - 8 个职业级别（Lv.1 街头青训 → Lv.8 传奇殿堂），共 16 名特色球员与 8 级守门员随等级逐步解锁。
   - 每名球员具备总评 OVR、星级、惯用脚、6 维雷达图 + 实况色阶数值条（FIN/KPW/CRL/CMP/DEC/WKF）与专属特技（重炮手/弧线魔法师/大心脏/勺子艺术家/节奏大师/死角猎手），每一项均真实参与射门与门将博弈计算。
   - 支持 **5 人点球大名单** 与 **单人包办主力** 一键切换，赛前提供对手门将球探简报与弱点提示。
3. **纯激励视频强钩子变现**（[AdManager.ts](cocos/assets/scripts/core/AdManager.ts)）
   - 零强制插屏、零 Banner，含新手前 2 局免打扰保护。
   - 内置 5 大强情绪钩子：VAR 关键球重罚（每局限 1 次）、未解锁 95+ 传奇单场租借、精彩局经验 ×2 暴击（含“翻倍即触发晋级战”提示）、Lv.3+ 球探绝密情报、每日传奇加赛。
   - 上线前只需在 [AdManager.ts](cocos/assets/scripts/core/AdManager.ts) 的 `AD_UNIT_IDS` 中填入微信小游戏后台激励视频广告位 ID 即可生效；本地 Web/编辑器预览自动使用 2 秒模拟激励视频弹窗方便验收。

## 本地验证与构建发布

```sh
# 运行核心物理、门将 AI、成长与广告单元测试（Node.js 22.18+）
npm test --prefix cocos

# 构建 Web Mobile 预览
creator="$HOME/Applications/CocosCreator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator"
"$creator" --project "$PWD/cocos" --build "configPath=$PWD/cocos/config/web-mobile.json"
```

### 上传微信开发版本

1. 在装有 Cocos Creator 3.8.8 的 Mac 上更新 `cocos/package.json` 的 `version`，然后从仓库根目录运行 `npm run wx:build`。脚本运行游戏测试，重新生成 `wx-minigame/` 和 `wx-build.json`。如果 Creator 安装在其他位置，用 `COCOS_CREATOR` 指定可执行文件。
2. 将源码、`wx-minigame/` 和 `wx-build.json` 一起提交并推送到 `origin/main`。也可以先将 `wx-minigame/` 导入微信开发者工具进行真机测试。
3. 在 `local233` 同步并运行上传脚本。首次安装或依赖锁文件变更后运行 `npm ci`。

```sh
ssh local233 'cd ~/projects/five-shot-penalty && git pull --ff-only && npm ci --no-audit --no-fund && npm run wx:release -- --dry-run'
ssh local233 'cd ~/projects/five-shot-penalty && git pull --ff-only && npm run wx:release -- --desc "本次变更说明"'
```

`npm run wx:verify` 校验本地构建包。`wx:release` 还会检查当前工作区干净且 `HEAD` 与远端 `main` 完全一致，再从该提交提取 `wx-minigame/`。`--dry-run` 会检查私钥并初始化微信 CI 项目。

上传使用 `robot=1`，体验版专用槽位可传 `--robot 2`。上传结果出现在微信公众平台的「版本管理 → 开发版本」。首次使用槽位 2 时，可在后台选为体验版。提审和正式发布在微信公众平台完成。

`local233` 的私钥存放在 `~/.config/five-shot-penalty/private.<appid>.key`。本机也可使用项目根目录下的同名文件，或通过 `MINI_CI_PRIVATE_KEY_PATH` 指定路径。微信代码上传 IP 白名单需允许 `local233` 的出口 IP。
