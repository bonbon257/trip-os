# Travel / Weekend 场景隔离改造方案

> 本文是基于当前代码的**审计结论 + 改造方案**，不含业务代码。
> 确认后再进入实施。

---

## 0. 审计结论摘要

### 0.1 一句话诊断

当前产品是 **「一个旅行 App + 一个通用 /discover 容器 + 一个半成品周末页」**。

具体表现为三条结构性错位：

| 错位 | 证据 | 后果 |
|---|---|---|
| Travel 子页混入全局导航 | `layout/index.tsx:19-21` 把 `行程/地图/预算` 作为一级项 | 无当前旅行时是「点了跳首页」的死项 |
| Global Home 被旅行驾驶舱殖民 | `HomePage.tsx:33` 首屏渲染 `<TripCockpit>`（含预算/预订/清单/焦点日） | 首页回答不了「我该进旅行还是周末」 |
| Weekend 是 Travel 的简化版 | `WeekendPage.tsx:137-140` 用 Travel 的 `DESTINATIONS` 算距离；`WeekendPlanPage.tsx:129` 硬用 MockMap | 周末没有自己的数据与体验 |

### 0.2 五个致命问题（按严重度）

**① 实体识别与路由断裂 —— 「说日本跳杭州」的根因**

`intent.ts` 只输出 `scene / mode / energy`，**不产出任何目的地实体**（`intent.ts:82-87` 的 `IntentRoute` 接口里没有 destination 字段）。
能产出实体的 `destinationsInText`（`queryIntent.ts:25`）**根本不参与路由**，只在 ComparePage / CreateTripPage / QuizPage 里被零散调用。

于是链路变成：
```
「我下个月想去日本」→ intent.ts 只识别到「日本」是个布尔信号 → 硬跳 /destinations?q=...
→ RecommendPage.tsx:28-33 用 text.includes(d.country) 二次反查
→ 命中为空时 displayRecs = recs（:65）→ 回落到 store.quiz.recs
→ 默认 [] 或上一次的推荐 → 用户看到杭州（DESTINATIONS 第一条，destinations.ts:14）
```

**② 城市词表存在命名陷阱，北京/上海无法作为目的地**

已核实：`cities-cn.ts` 里**有**北京和上海，但 `name` 分别是 `'北京城区'`（`cities-cn.ts:161`）和 `'上海城区'`（`:125`）。
而匹配方向是 `text.includes(d.name)`（`queryIntent.ts:29`）——即**文本必须包含城市全名**。

```
"北京有什么好玩的".includes("北京城区")  →  false
```

结果：北京只存在于 `ORIGINS`（`taxonomy.ts:97`，仅 8 城），**结构上永远只能被识别为出发地**。
「北京有什么好玩的」→ 无任何 travel 提示词命中（"好玩"不在 `TRAVEL_HINTS`）→ `scene = null` → 扔进 `/discover`。

> 附带风险：广州的 `highlights` 里有「北京路」（`cities-cn.ts:39`），若改成反向包含会误伤。

**③ 「附近看看」是假的**

WeekendPage 的 `nearby` 模式实为**全城关键词搜索**（`WeekendPage.tsx:34,212`）：
- 无定位：`navigator.geolocation` 全项目零调用
- 无半径：后端 POI 只支持 `city + keywords`（`server/src/routes/map.ts:107-152`，走 `/place/text`），**没有 `/place/around`**
- 无当前时间 / 周末日期 / 天气 / 营业状态参与
- 后端其实返回了 `openTime`（`map.ts:146`），但前端 `PoiCandidate`（`WeekendPage.tsx:78-85`）**没这个字段，直接丢弃**

**④ 已建成的 AMap 资产大面积闲置**

| 能力 | 位置 | 状态 |
|---|---|---|
| `/api/map/route` 真实路径规划 | `server/src/routes/map.ts:159` | 前端封装 `planRoute`（`services/amap.ts:213`）**零调用**（已 grep 验证） |
| `/api/map/geocode` | `map.ts:76` | `world/index.ts:17` 的 provider 是 null，**零调用** |
| POI `types` 分类码 | `map.ts:112` | 前端从不传，只能靠关键词猜 |
| POI `openTime` 营业时间 | `map.ts:146` | 前端丢弃 |
| `AMapView` 真实地图 + 路径规划 | `AMapView.tsx:19-21,349-363` | 周末侧完全没用 |
| `world/` 7 个 Provider | `world/types.ts:51-97` | 只有 weather 落地，其余 6 个全空 |

另外 `weatherFor()`（`world/index.ts:47-49`）**硬编码 `return []`**，却被 `ai/orchestrator.ts:78` 调用——是个死桩。

**⑤ 「加入周末计划」后能力归零**

`addToPlan`（`WeekendPage.tsx:288-297`）= 建计划 + 写 discoveredPlaces + `setPlaceState(WANTED)` + toast，**结束**。
`WeekendPlanPage` 仅有：列表、时间线（`travelMin = km*4` 拍脑袋，`:63`）、上移/下移/移出、导航第一站。
要求的「附近有什么 / 吃什么 / 喝什么 / 玩什么 / 路线 / 时间安排 / AI 优化」**全部缺失**。`activityIds` 在 `store.ts:936` 创建时恒为 `[]` 且无写入口。

### 0.3 顺带查出的死代码

- **完全无消费者的 store action**：`regenerateDays:393`、`deleteDay:455`、`clearDay:589`、`updateBooking:713`
  （`updateBooking` 意味着**预订一旦创建就无法编辑**）
- **AI 层永不产出的空壳 action**：`createTrip`、`createDay`、`addPlace`、`removePlace`、`createExpense`、`generateDestinationRecommendation`
  （最后者是**唯一能写 `db.destinationPicks` 的路径**，该集合因此恒为空）
- **未接线的安全门禁**：`settings.confirmHighRisk`（`store.ts:80,217`）全库零读取，`ProposalPanel.tsx:33` 只用 `risk==='high'` 染色——**高危操作确认实际不存在**
- **两套互不相通的意图体系**：路由层 `intent.ts`（travel/weekend）与行程层 `orchestrator.detectIntent:124-138`（12 个正则意图）之间无任何共享实体
- **默认零 LLM**：`settings.aiAssist` 默认 `false`（`store.ts:220`），且 LLM 只在 `intent === 'unknown'` 时才调（`orchestrator.ts:879`）

---

## 1. 代码归属盘点

### 1.1 明确属于 Travel（不要动）

| 范围 | 位置 | 说明 |
|---|---|---|
| Trip 工作台 12 页 | `src/pages/trip/*.tsx` | 全部 `useTripContext(tripId)`，只读当前 tripId，**数据隔离干净** |
| TripCockpit / TripBits / LifecycleBanner | `src/components/travel/` | 成熟组件 |
| Trip 数据模型 | `types/index.ts:164-230`（Trip/Day/Activity） | |
| AI 编排层 | `src/ai/orchestrator.ts` + `actions.ts` | 流程完整，保留 |
| 决策链 6 页 | Quiz / QuizResult / Recommend / Compare / Random / CreateTrip / DestinationDetail | 数据完整、支持 `?q=`，但**路由位置错了** |

### 1.2 明确属于 Weekend

| 范围 | 位置 |
|---|---|
| 周末决策 | `src/pages/WeekendPage.tsx` |
| 周末计划 | `src/pages/WeekendPlanPage.tsx` |
| 周末数据 | `types/index.ts:457-475` WeekendPlan、`store.ts:918-952` 三个 action |
| 计划适配层 | `src/services/plan.ts`、`src/services/placeState.ts` |

### 1.3 实为 Travel 却挂在全局（必须下沉）

```
/quiz            → Travel 决策（layout 全局路由，App.tsx:174）
/quiz/result     → Travel 决策
/destinations    → Travel 目的地推荐
/destinations/:id→ Travel 目的地详情
/random          → Travel 抽签
/compare         → Travel 对比
/trips/new       → Travel 创建
/assistant       → Travel AI 助手（AssistantPage.tsx:11-14 无 tripId 时回落）
```

加上 NAV 里的 `行程/地图/预算`（`layout/index.tsx:19-21`）——**共 8 处 Travel 专属能力占据全局位置**。
只有 `/trips/:tripId` 这一处是真正隔离的。

### 1.4 Shared Core（可复用，不含业务语义）

`Place` / `PlaceState`（已有 `containerType`，`types/index.ts:436`）/ `Activity` / `AMap` 服务 / `route.ts` / `AI` 编排 / `recommendation` / `intelligence` / `world/`

> 注意：`ContextType = 'TRAVEL'|'WEEKEND'|'NOW'`（`types/index.ts:419`）**已定义但无处使用**；`services/plan.ts` 提到的 PlanView adapter 也只做了一半——抽象层搭了但没接上。

---

## 2. 十二问

### Q1 当前哪些代码属于 Travel
见 §1.1。核心是 `/trips/:tripId/*` 工作台 + 6 个决策页 + Trip 数据模型 + AI 编排层。

### Q2 当前哪些代码属于 Weekend
见 §1.2。仅 2 个页面 + 3 个 store action + 2 个 service，**且严重依赖 Travel 的静态数据**。

### Q3 哪些页面实际上仍然是 Travel 页面
见 §1.3 的 8 处。此外 **`/discover` 本身是 Travel 思维的超集**：它的 travel 分支（`DiscoverPage.tsx:210-238`）直接指向 quiz/compare/random/trips/new。

### Q4 当前 Weekend 缺什么
对照 PRD 第二十节的 9 项：

| 应有 | 现状 |
|---|---|
| 周末首页 Cockpit | ❌ 只有候选列表 |
| 这周末去哪 | ⚠️ 有（place 模式） |
| 附近看看 | ❌ 假的（全城关键词） |
| 吃什么 | ❌ 无独立页 |
| 玩什么 | ❌ 无独立页 |
| 商圈探索 | ❌ 无 |
| 周末计划 | ⚠️ 有但无后续 |
| 随机大转盘 | ❌ `MODE_KEYWORDS` 无 random 档，`WeekendPage.tsx:195` 引用了但无入口产生 |
| AI 安排 | ⚠️ 纯前端拍脑袋估算（`WeekendPage.tsx:313-315`），不调路径 API，结果不落库 |

### Q5 哪些静态数据需要移除 / 修正

| 数据 | 问题 | 处理 |
|---|---|---|
| `places.ts:121-156` `synthesize()` | 用 hash 在市中心 ±0.15° **合成假 POI**，名字取 highlights +「当地菜市场」 | **移除**，周末侧不得使用 |
| `cities-cn.ts` 的 `北京城区`/`上海城区` 命名 | 导致 `text.includes` 匹配失败 | 建立 **alias 表**（北京↔北京城区），而非改数据（文件头注明自动生成） |
| `DESTINATIONS` 只有 21 条 | `WeekendPage.tsx:137-140` 用它算距离，默认城市「上海」不在其中 → `distanceKm` 恒 undefined | 周末侧**改用当前定位/地理编码**取城市中心，不再查 `DESTINATIONS` |
| `home.ts` 模板/灵感（`:4-77`） | 静态卡片墙 | 周末侧移除；旅行侧可保留为「灵感」但需标注 |
| `taxonomy.ts` ORIGINS 仅 8 城 | 出发地词表过小 | 扩到 `cities-cn` 全量 |
| `world/index.ts:47` `weatherFor` 返回 `[]` | 死桩 | 接真实 provider 或明确返回 null + UI 不显示 |

### Q6 AMap 可以复用什么
见 §0.4。最高性价比三项：
1. `planRoute` + `/api/map/route`（补 waypoints 即可出真实多站点路线）
2. POI `openTime`（营业状态筛选）
3. POI `types` 分类码（精确分类，不用猜关键词）

**需新增**：`/api/map/around`（高德 `/place/around`，`location + radius`）——这是「附近看看」名副其实的前提。

### Q7 哪些组件可以 Shared
`PlaceState` 机制、`CandidateCard`、`ContextHint`、`Section/Card/Chip/Button` UI 套件、`AMapView`、`route.ts` 的 `geoKmBetween`、`AI` 编排与确认流程、`world/` Provider 接口。

### Q8 哪些组件必须 Context-specific
- **TripCockpit** → Travel 专属，**从 HomePage 移除**
- **Weekend Cockpit** → 新建，周末专属
- **候选生成逻辑**：Travel 走 `recommend()` 静态打分；Weekend 走 AMap POI + 实时约束
- **地图**：Travel 用 PlacePool + 空间规划；Weekend 用当前定位 + 半径 + 营业状态
- **计划 Workspace**：`TripItinerary` vs `WeekendPlanWorkspace` 各一套

### Q9 哪些 Store 数据需要增加 context / container

| 数据 | 现状 | 需要 |
|---|---|---|
| `PlaceState` | ✅ 已有 `containerType: TRIP\|WEEKEND` | 保持 |
| `WeekendPlan` | ❌ 无 context 字段 | 加 `context: 'WEEKEND'`（或由集合名隐含，二选一，倾向不加冗余字段） |
| `Trip` | ❌ 无 context 字段 | 同上 |
| `WeekendPlan.activityIds` | 恒 `[]` | 需要写入口（周末活动） |
| `discoveredPlaces` | Travel/Weekend 混在一个集合 | **这是最大的污染源**——建议加 `source: 'TRAVEL'\|'WEEKEND'\|'NOW'` 或按 container 拆分 |
| `destinationPicks` | 恒空 | 让 `generateDestinationRecommendation` 真正被 orchestrator 产出，或删除 |

### Q10 如何保证现有 Trip 不受影响
1. **`/trips/:tripId/*` 路由与页面一行不改**——只改「怎么进去」，不改「进去后是什么」
2. 新建 `/travel/*` 命名空间，**不重命名 `/trips/*`**
3. `TripCockpit` 从 HomePage 摘除后仍被 `TripOverviewPage` 使用，组件本身不改
4. FocusLayout 的返回逻辑改为**按路由层级推导 context**，不再依赖 `?from=discover`
5. 每一步都跑 `npm run typecheck && npm run build && npm run smoke:all`（当前 187 项基线）
6. 视觉回归覆盖 `/trips/:id` 的 8 个子 tab

### Q11 如何让自然语言真正进入正确 Context

**替换现有的「关键词 → 硬跳 URL」为结构化管线**（详见 §4）：
```
User Input
 → Entity Extraction（先抽实体，城市/国家/POI 类别，带 alias 表）
 → Context Detection（TRAVEL / WEEKEND / NOW）
 → Intent Recognition（8 类）
 → Constraint Extraction（时间/强度/距离/同行人/预算）
 → Confidence 判定 → 低置信走 ClarifyFlow，不硬跳
 → Route Resolution（context + intent → 具体页面 + 参数）
```

**关键改动**：`intentRoute` 不再直接返回 `href` 让 `IntentInput` 立刻 `navigate()`，而是返回结构化 `ParsedIntent`，由统一的 resolver 决定去向，且**允许先弹澄清**。

### Q12 Weekend Plan 如何形成完整闭环

```
选地点 → Place Detail（Weekend Context）
         ├ 这个地方有什么：吃 / 喝 / 玩 / 逛（AMap around + types）
         └ 这个地方怎么玩：按同行人生成方案模板
              ├ 情侣：下午茶 → 逛街 → 展览 → 晚餐 → 夜景
              ├ 朋友：吃饭 → 商圈 → 娱乐 → 咖啡/酒吧
              ├ 家人：交通方便 → 景点 → 午餐 → 公园/商场 → 提前返程
              └ 一个人：咖啡 → 书店 → 展览 → 散步
                 ↓
         加入 Weekend Plan → WeekendPlan Workspace
                 ├ 时间线（可拖动改时间）+ 真实地图 + 真实路线
                 ├ 智能提示：附近还有什么 / 是否绕路 / 是否太赶 / 距离过远 / 需预约 / 天气是否适合
                 ├ 操作：添加 / 删除 / 替换 / 移动 / 调整时间 / 重新规划
                 └ AI 优化（走现有 AI Action 确认流程）
```

---

## 3. 目标结构

### 3.1 全局导航（5 项）

```
首页  /  旅行  /  周末  /  Journey  /  更多
```

- **首页**：`TripCockpit` 摘除，只保留「当前状态 / AI 自然输入 / 快捷入口」
- **旅行**：有 `activeTripId` → 直达 `/trips/:id`；无 → `/travel`（旅行首页）
- **周末**：`/weekend`
- **Journey**：`/journey`（从 `/trips/:id/journey` 提升为全局，需聚合旅行 + 周末记录）
- **更多**：设置 + 原 MORE_LINKS 中真正通用的项

### 3.2 Travel 子导航（进入旅行后出现）

```
旅行首页 / 行程 / 地图 / 预算 / 清单 / 预订 / AI规划 / 今天 / 更多
```
> 补齐当前 TripLayout tabs 缺失的 `bookings / files / members / assistant`（`layout/index.tsx:455-464` 只有 8 项）

### 3.3 Weekend 子导航（进入周末后出现）

```
周末首页 / 去哪玩 / 附近 / 吃什么 / 玩什么 / 商圈 / 周末计划 / AI安排 / 更多
```

### 3.4 路由映射（现状 → 目标）

| 现状 | 目标 | 动作 |
|---|---|---|
| `/` | `/` | 改造内容 |
| `/discover` | **删除** | 内容下沉至 `/travel` 与 `/weekend`；保留 301 重定向 |
| `/discover/travel` | `/travel` | |
| `/discover/weekend` | `/weekend` | |
| `/quiz` | `/travel/quiz` | 重命名 + 旧路径重定向 |
| `/quiz/result` | `/travel/quiz/result` | |
| `/destinations` | `/travel/destinations` | |
| `/destinations/:id` | `/travel/destinations/:id` | |
| `/compare` | `/travel/compare` | |
| `/random` | `/travel/random` | |
| `/trips/new` | `/travel/new` | |
| `/trips/:tripId/*` | **不变** | 一行不动 |
| `/weekend` | `/weekend` | 改造为 Cockpit |
| `/weekend/plan` | `/weekend/plan` | 改造为 Workspace |
| — | `/weekend/where` 🆕 | 这周末去哪 |
| — | `/weekend/nearby` 🆕 | 附近看看（真定位 + 半径） |
| — | `/weekend/food` 🆕 | 吃什么 |
| — | `/weekend/fun` 🆕 | 玩什么 |
| — | `/weekend/areas` 🆕 | 商圈探索 |
| — | `/weekend/random` 🆕 | 随机大转盘 |
| — | `/weekend/ai` 🆕 | AI 安排 |
| `/trips/:id/journey` | `/journey` | 提升为全局 |

### 3.5 FocusLayout 改造

当前返回逻辑硬依赖 `from === 'discover'`（`layout/index.tsx:413`）——Discover 一下沉，所有 Travel 决策页的返回就断了。

改为：**按路由路径推导 context 与返回目标**
```
/travel/*  → 返回 /travel
/weekend/* → 返回 /weekend
```
`?from=` 退化为可选覆盖，不再是唯一来源。

---

## 4. 意图识别管线（P0 核心）

### 4.1 目标数据结构

```ts
type AppContext = 'TRAVEL' | 'WEEKEND' | 'NOW';

type IntentType =
  | 'DESTINATION_DISCOVERY'   // 不知道去哪（日本 → 东京/大阪/京都）
  | 'ACTIVITY_DISCOVERY'      // 已定城市，看有什么好玩（北京）
  | 'DESTINATION_COMPARE'     // 几个备选比一比
  | 'RANDOM_DISCOVERY'        // 随便抽一个
  | 'TRIP_CREATE'             // 已经决定了
  | 'WEEKEND_DISCOVERY'       // 这周末去哪
  | 'FOOD_DISCOVERY'          // 吃什么
  | 'FUN_DISCOVERY'           // 玩什么
  | 'NEARBY_DISCOVERY'        // 附近看看
  | 'AREA_DISCOVERY';         // 商圈探索

interface ParsedIntent {
  context: AppContext;
  intent: IntentType;
  entities: {
    country?: string;      // 日本
    city?: string;         // 北京 / 深圳
    category?: string;     // 商圈 / 咖啡 / 展览
    origin?: string;       // 出发地
  };
  time?: { kind: 'weekend' | 'tonight' | 'next_month' | 'today'; date?: string };
  constraints: {
    intensity?: 'low' | 'medium' | 'high';   // 不想太累
    distance?: 'near' | 'far';
    budget?: 'low' | 'medium' | 'high';
    companion?: 'solo' | 'couple' | 'friends' | 'family';
  };
  confidence: number;      // 0-1
  needsClarify: boolean;
  clarifyQuestion?: string;
}
```

### 4.2 解析顺序（关键：实体优先于场景）

```
1. 抽实体（先于场景判断）
   - 国家：白名单 + 别名表（日本 / Japan / 霓虹）
   - 城市：cities-cn 全量 + DESTINATIONS + alias 表（北京 ↔ 北京城区）
   - POI 类别：商圈 / 咖啡 / 餐厅 / 展览 / 公园 / 酒吧 ...
   - 匹配方向改为「双向 + 最长优先」，但用 alias 表规避「北京路」误伤

2. 判 Context
   - 有国家/境外城市实体        → TRAVEL
   - 有「周末/今晚/今天/附近」   → WEEKEND / NOW（优先级高于城市）
   - 有城市 + 「有什么好玩/景点」→ TRAVEL
   - 有城市 + 「商圈/吃饭/喝」   → WEEKEND
   - 都不明确 → needsClarify

3. 抽约束（时间 / 强度 / 距离 / 同行人 / 预算）

4. 置信度
   - 高（有明确实体 + 明确意图）→ 直接路由
   - 低 → ClarifyFlow，最多问 1-2 个必要问题（不机械问 9 问）

5. 路由解析：context + intent → 路径 + 参数
```

### 4.3 六条验收场景的目标行为

| 输入 | 目标 |
|---|---|
| 我下个月想去日本，但不知道去哪 | `TRAVEL / DESTINATION_DISCOVERY / country=日本` → `/travel/destinations?country=日本` → 东京/大阪/京都/北海道/福冈/冲绳 |
| 我已经决定去北京，有什么好玩的 | `TRAVEL / ACTIVITY_DISCOVERY / city=北京` → `/travel/destinations/beijing` |
| 这周末不想太累 | `WEEKEND / WEEKEND_DISCOVERY / intensity=low` → `/weekend/where?intensity=low` |
| 今晚想吃点不一样的 | `NOW / FOOD_DISCOVERY` → `/weekend/food?time=tonight` |
| 深圳有哪些著名商圈？随机给我一个 | `WEEKEND / AREA_DISCOVERY + RANDOM / city=深圳` → `/weekend/random?city=深圳&category=商圈` |
| 加入某公园到周末计划 | → `/weekend/plan`，继续提供附近/吃/喝/玩/路线/时间/AI 优化 |

---

## 5. 实施优先级

### P0 — 先解决架构和场景错误

| # | 任务 | 涉及文件 | 验收 |
|---|---|---|---|
| P0-1 | Global Home 与 Trip Overview 分离：`HomePage` 摘除 `TripCockpit`，改为「当前状态卡（轻量）+ AI 输入 + 快捷入口」 | `HomePage.tsx` 新建 `CurrentStatusCard` | 首页不再出现预算/清单/焦点日 |
| P0-2 | 全局导航改为 首页/旅行/周末/Journey/更多；`行程/地图/预算` 从 NAV 移除 | `layout/index.tsx:15-23` | 无当前旅行时无死项 |
| P0-3 | 建立 `/travel` 与 `/weekend` 命名空间，迁移 8 条 Travel 路由，加旧路径重定向 | `App.tsx` | 旧链接不 404 |
| P0-4 | 删除 `/discover` 超级容器，内容下沉 | `DiscoverPage.tsx` | `/discover` 重定向到 `/` |
| P0-5 | FocusLayout 改为按路由推导 context | `layout/index.tsx:406-428` | 所有决策页有正确返回 |
| P0-6 | 新建意图管线 `src/utils/parseIntent.ts`（实体优先 + alias 表 + 置信度 + 澄清） | 新建 | 六条验收场景全部正确 |
| P0-7 | 修实体词表：alias 表（北京↔北京城区）、ORIGINS 扩到全量、国家→城市映射 | `data/` 新建 `cityAlias.ts`、`data/countries.ts` | 「北京」可被识别为目的地 |
| P0-8 | 移除明显的静态错误推荐：周末侧不再查 `DESTINATIONS`；`places.ts` 合成 POI 不进周末链路 | `WeekendPage.tsx`、`places.ts` | 周末不再出现写死地点 |

**P0 完成标准**：六条验收场景的**路由与实体**全部正确（内容可以是 Phase 1 实现，但去向不能错）。

### P1 — 完善 Weekend

| # | 任务 | 依赖 |
|---|---|---|
| P1-1 | 周末首页 Cockpit（本周末计划 + 推荐分区 + 快捷入口） | P0-3 |
| P1-2 | 定位能力：`useLocation`（geolocation + IP 兜底 + homeCity 兜底） | — |
| P1-3 | 新增 `/api/map/around`（location + radius + types），前端封装 | 后端 |
| P1-4 | 附近看看：真定位 + 半径 + 营业状态 + 距离 | P1-2/3 |
| P1-5 | 吃什么 / 玩什么 / 商圈探索（复用 around + types 分类码） | P1-3 |
| P1-6 | 随机大转盘（Decision Starter，随机后继续「这里怎么玩」） | P1-5 |
| P1-7 | Place Detail（Weekend）：这个地方有什么（吃/喝/玩） | P1-5 |
| P1-8 | 同行人方案模板（情侣/朋友/家人/一个人） | P1-7 |
| P1-9 | WeekendPlan Workspace：时间线 + 真实地图 + 真实路线 | P1-3 |
| P1-10 | 智能提示：绕路/太赶/过远/预约/天气 | P1-9 + 天气 |
| P1-11 | AI 安排：接 `planRoute` 出真实路线，结果落库 | P1-9 |
| P1-12 | fallback 标注：AMap 不可用时明确标为「随机探索」 | P1-4 |

### P2 — 增强 Travel Decision

| # | 任务 |
|---|---|
| P2-1 | 国家 → 城市决策页（日本 → 东京/大阪/京都/北海道/福冈/冲绳），每城展示适合谁/几天/节奏/预算级别 |
| P2-2 | 城市活动探索（北京 → 景点/商圈/玩法），实体驱动不跑偏 |
| P2-3 | 多目的地比较 → 决定 → 创建 Trip |
| P2-4 | `/quiz` 保留为 Phase 1 |
| P2-5 | ClarifyFlow（动态追问，不机械 9 问） |

### P3 — World Intelligence

| # | 任务 |
|---|---|
| P3-1 | 修 `weatherFor` 死桩，接真实天气到周末推荐 |
| P3-2 | `world/` 补齐 POI / Route / Geocode Provider（复用已有后端接口，成本很低） |
| P3-3 | 营业状态 / 活动 / 新店等扩展源 |
| P3-4 | Journey 全局化 + 从历史行为学偏好 |

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 改导航破坏现有旅行体验 | `/trips/:tripId/*` 一行不改；每步跑 187 项 smoke + 视觉回归覆盖 8 个 tab |
| `/discover` 下沉打断返回路径 | P0-5 先于删除执行，FocusLayout 改为路由推导 |
| 实体 alias 表引入新误伤（如「北京路」） | 双向匹配 + 最长优先 + 人工校验高频词；先覆盖 30 个主要城市 |
| AMap QPS 限流（已知偶发 502） | 复用现有节流 + 重试 + 早停；新增 around 接口同样处理 |
| 定位权限被拒 | 三级兜底：geolocation → IP → homeCity 设置；明确标注数据可信度 |
| 范围过大 | 严格按 P0 → P1 推进，P0 只保证「去向正确」，内容可用 Phase 1 实现 |

---

## 7. 建议的交付节奏

1. **P0 一次做完**（8 项），交付后逐条验证六条验收场景的**去向**
2. **P1 分批**：第一批 P1-1~P1-6（周末有内容），第二批 P1-7~P1-12（闭环）
3. **P2 / P3** 视实际情况推进

每个批次结束都跑：`typecheck` + `build` + `smoke:all` + 视觉回归。

---

## 8. 需要你确认的 3 个决策点

1. **`/discover` 是保留为兼容重定向，还是彻底删除？**
   （方案建议：路由保留重定向，组件删除）

2. **`discoveredPlaces` 被 Travel/Weekend 共用**——是加 `source` 字段区分，还是拆成两个集合？
   （方案建议：加 `source` 字段，避免迁移成本）

3. **Journey 全局化**是否在本轮做？它会把 `/trips/:id/journey` 提升为 `/journey`，涉及聚合旅行与周末记录。
   （方案建议：P0 先在导航挂 `/journey` 占位指向现有实现，聚合留到 P3）
