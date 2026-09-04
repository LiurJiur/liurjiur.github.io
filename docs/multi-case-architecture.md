# CAT HELP 多章节代码结构规划

## 1. 目标

在保留现有第一章行为和存档的前提下，让每个章节拥有独立的内容、解锁状态、提示、最终推理与结算文案。章节之间只共享用户设置、教学进度和角色基础身份，不共享调查概念或已确认事实。

当前实现适合单案件，但存在以下多章节阻碍：

- `game-engine.js` 直接导入全局 `records`、`facts`、`aliases`。
- `app.js` 直接导入并渲染一组固定的 `profiles`、`locations`、`hintStages`、`eventCards`、`solution`。
- `validateSolution` 写死第一章的六个答案字段和错误文案。
- 存档固定使用 `cat-help-save`，只有一份调查状态。
- 首页、侧栏、结案弹窗和统计文案写死 `CASE #001` 与红球案件内容。
- 内容校验脚本只验证单个 `game-data.js`。

## 2. 建议目录

```text
src/
├── content/
│   ├── case-catalog.js
│   ├── shared/
│   │   └── characters.js
│   └── cases/
│       ├── case-001/
│       │   ├── index.js
│       │   ├── records.js
│       │   └── solution.js
│       └── case-002/
│           ├── index.js
│           ├── records.js
│           └── solution.js
├── engine/
│   ├── game-engine.js
│   ├── save-store.js
│   └── solution-engine.js
├── ui/
│   └── styles.css
└── app.js
```

第一步不必立刻拆分每个内容文件；可以先让现有 `game-data.js` 导出一个完整案件对象，再在第二章内容增长后按目录拆分。这样能减少一次性迁移风险。

## 3. 案件数据契约

建议每章导出统一的 `CaseDefinition`：

```js
export const case001 = {
  id: "case-001",
  number: "001",
  contentVersion: 1,
  title: "玩具球失踪事件",
  subtitle: "一颗红球，六段不完整的记忆",
  duration: "45～60 分钟",
  unlock: { type: "start" },
  presentation: {
    homeEyebrow: "桂花宅智能家庭终端 / CASE #001",
    activeCopy: "……",
    solvedCopy: "……",
    endingTitle: "球找到了！",
    endingBody: "……"
  },
  starterConcepts: ["小酒", "客厅", "红色铃铛球"],
  records,
  aliases,
  profiles,
  locations,
  facts,
  hintStages,
  eventCards,
  solution
};
```

第二章声明：

```js
unlock: { type: "case-solved", caseId: "case-001" }
```

案件目录只负责展示顺序和解锁状态：

```js
export const caseCatalog = [case001, case002];
export const casesById = new Map(caseCatalog.map((item) => [item.id, item]));
```

## 4. 引擎依赖注入

`game-engine.js` 不应再从具体剧情模块导入数据。推荐创建案件绑定引擎：

```js
export function createCaseEngine(caseData) {
  const startIds = getStartIds(caseData.records);
  const conceptIndex = buildConceptIndex(caseData.records, caseData.aliases);

  return {
    createInitialState: () => createInitialState(caseData, startIds),
    openRecord: (state, id) => openRecord(caseData, state, id),
    search: (state, query) => search(caseData, conceptIndex, state, query),
    recompute: (state) => recompute(caseData, state),
    validateSolution: (answer) => validateSolution(caseData.solution, answer)
  };
}
```

也可以给每个函数增加 `caseData` 参数，但绑定式 API 能减少 `app.js` 每次调用时遗漏当前案件的风险。

以下状态必须是案件级：

- `unlocked`
- `read`
- `discovered`
- `collected`
- `searched`
- `confirmedFacts`
- `hints`、`hintCount`
- `history`
- `solved`
- `startedAt`、`solvedAt`

以下状态应为全局偏好：

- 字号
- 减少动画
- 自动教学开关
- 已看教学主题
- 当前选中的案件 ID

## 5. 数据驱动的最终推理

将第一章固定字段改为问题数组，支持 `single`、`multiple` 和 `order` 三种题型：

```js
solution: {
  requiredFacts: ["FACT-01"],
  questions: [
    {
      id: "last-player",
      type: "single",
      prompt: "谁是最后一个正常玩球的猫？",
      options: ["小酒", "铁胆", "小流儿"],
      answer: "小酒",
      error: "最后玩球的猫与 20:07 的目击记录不符。"
    },
    {
      id: "liars",
      type: "multiple",
      prompt: "哪些角色的证词与客观记录冲突？",
      options: ["铁胆", "小流儿", "糖心"],
      answer: ["铁胆", "小流儿"],
      error: "所选角色没有同时满足秘密动机和客观记录反驳。"
    },
    {
      id: "event-order",
      type: "order",
      prompt: "排列事件顺序",
      options: eventCards.map((item) => item.id),
      answer: eventCards.map((item) => item.id),
      error: "事件顺序仍有矛盾。"
    }
  ]
}
```

`solution-engine.js` 统一比较答案：单选直接比较，多选排序后比较集合，排序题按数组位置比较。UI 按题型渲染，不再知道“最后玩球者”之类的案件专有字段。

## 6. 存档结构与迁移

新存档建议使用新键 `cat-help-save-v2`：

```js
{
  schemaVersion: 2,
  activeCaseId: "case-002",
  preferences: {
    settings: { fontScale: 1, reducedMotion: false },
    tutorial: { automatic: true, seen: [] }
  },
  cases: {
    "case-001": {
      contentVersion: 1,
      unlocked: [],
      read: [],
      discovered: [],
      collected: [],
      searched: [],
      confirmedFacts: [],
      hints: {},
      hintCount: 0,
      history: [],
      solved: false,
      startedAt: 0,
      solvedAt: null
    }
  }
}
```

迁移规则：

1. 优先读取 `cat-help-save-v2`。
2. 若不存在但检测到当前 `cat-help-save`，将其完整调查字段迁入 `cases["case-001"]`。
3. 将旧 `settings`、`tutorial` 移入 `preferences`。
4. 成功写入新存档后保留旧键一个版本周期，不立即删除，以便回退。
5. `contentVersion` 只控制单章内容迁移；`schemaVersion` 控制整个存档外壳迁移，二者不要混用。

“清除存档”应拆成两个操作：

- 重新开始当前章节。
- 清除全部章节进度。

两者都继续使用明确的确认提示。

## 7. UI 导航

新增案件选择页或案件抽屉：

- 展示章节号、标题、预计时长、锁定/进行中/已结案状态。
- 第一章默认可进入。
- 第一章结案后，第二章显示“新案件”并可进入。
- 切换案件时保存当前状态，重新绑定当前案件引擎，并清空仅属于当前视图的 `currentRecordId`、筛选器和解题临时排序。
- 顶栏、侧栏案件卡、首页 Hero、统计和结案弹窗全部读取 `caseData.presentation`。
- 教学进度全局共享；第二章只对新增交互显示教学。

不建议把两个案件的记录混在同一个“记录库”中。跨案件搜索会让关键词状态、时间线和证据上下文变得含混。

## 8. 角色数据边界

`shared/characters.js` 只保存跨章稳定身份：

```js
{
  id: "cat-066",
  name: "66",
  aliases: ["六六"],
  coat: "布偶",
  relation: "邻居弟弟"
}
```

每章的 `profiles` 保存当章才允许玩家知道的描述、秘密与解锁条件。这样既能复用头像和称呼，也不会因为第一章已解锁角色档案而提前泄露第二章事实。

## 9. 校验与测试改造

内容校验脚本遍历 `caseCatalog`，逐章执行：

- 记录、事实、事件卡、问题 ID 唯一性检查。
- 解锁条件引用完整性检查。
- 从初始记录开始的概念可达性模拟。
- 必要事实与结案记录可达性检查。
- 最终答案引用有效性检查。
- 未发现词不作为唯一通关路径。

测试至少新增：

- 第一章迁移前后进度一致。
- 两个案件的相同记录 ID 不会串档。
- 切换章节不会共享 `read`、`searched`、`confirmedFacts`。
- 全局设置和教学进度会跨章节保留。
- 第二章仅在第一章 `solved` 后解锁。
- 第二章多选答案忽略选择顺序，事件排序仍严格比较顺序。
- 重开当前章节不影响其他章节。
- 每个案件都能沿已发现概念达到全部必要事实。

## 10. 推荐实施顺序

### 阶段一：建立案件边界

1. 将现有 `game-data.js` 包装为 `case001`，内容和 ID 不变。
2. 让引擎通过 `caseData` 工作，确保第一章测试全部保持通过。
3. 把写死的首页和结案文案移入 `presentation`。

### 阶段二：改造存档与导航

1. 引入 v2 存档外壳和旧存档迁移。
2. 增加案件选择与当前章节重开。
3. 补齐隔离、迁移和解锁测试。

### 阶段三：数据化推理

1. 将第一章答案迁移为问题数组。
2. 实现通用单选、多选、排序渲染与校验。
3. 使用第一章回归测试确认结案行为不变。

### 阶段四：接入第二章

1. 按第二章线索表录入记录和别名。
2. 增加 66 的共享角色身份，并接入小流儿、小酒、糖心、松花、铁胆的第二章档案。
3. 运行逐章可达性校验和完整测试。
4. 完成至少一次无提示试玩后再调整提示层级。

## 11. 暂不建议加入

- 跨章节共享关键词或事实。
- 影响后续主线的多结局。
- 云端账号与同步。
- 为第二章单独复制一套引擎或页面。
- 在第二章内容尚未验证前设计大量第三、第四章专用抽象。

多章节改造的核心边界是“共享引擎与偏好，隔离案件内容与进度”。只要先守住这个边界，后续增加章节不会继续扩大 `app.js` 中的案件特例。
