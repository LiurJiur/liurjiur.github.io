# CAT HELP 多章节代码结构规划

## 1. 目标

在保留现有第一章行为和存档的前提下，让每个章节拥有独立的内容、解锁状态、提示、最终推理与结算文案。章节之间只共享用户设置、教学进度和角色基础身份，不共享调查概念或已确认事实。

最初的单案件实现存在以下多章节阻碍：

- `game-engine.js` 直接导入全局 `records`、`facts`、`aliases`。
- `app.js` 直接导入并渲染一组固定的 `profiles`、`locations`、`hintStages`、`eventCards`、`solution`。
- `validateSolution` 写死第一章的六个答案字段和错误文案。
- 存档固定使用 `cat-help-save`，只有一份调查状态。
- 首页、侧栏、结案弹窗和统计文案写死 `CASE #001` 与红球案件内容。
- 内容校验脚本只验证单个 `game-data.js`。

> 状态更新：当前仓库已经拥有 `case-catalog.js`、案件绑定引擎、`save-store.js`、`solution-engine.js` 和可运行的 `case-001`、`case-002`；校验脚本也已按案件遍历。第三章应沿用现有案件接口增量接入，不再重复执行第一、二阶段迁移。

## 2. 当前结构与第三章目标

```text
src/
├── content/
│   ├── case-catalog.js
│   ├── game-data.js        # 第一章旧内容数据，暂由 case-001 包装
│   └── cases/
│       ├── case-001/
│       │   └── index.js
│       ├── case-002/
│       │   └── index.js
│       └── case-003/
│           └── index.js
├── engine/
│   ├── game-engine.js
│   ├── save-store.js
│   └── solution-engine.js
├── ui/
│   └── styles.css
└── app.js
```

第三章先按已经建立的单文件案件模式实现 `case-003/index.js`，与第二章保持一致。若单个案件文件后续明显影响维护，再统一把三个案件拆成 `records.js`、`profiles.js` 和 `solution.js`；不要只为第三章建立一套不同目录。

共享角色代码目前尚未独立建立。第三章接入时可以先在案件内声明五名角色，同时以[角色设定基准](./character-bible.md)约束稳定外貌；等跨章头像或角色主页真正需要复用时，再提取 `content/shared/characters.js`。

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

第三章沿用同一规则：

```js
unlock: { type: "case-solved", caseId: "case-002" }
```

案件目录只负责展示顺序和解锁状态：

```js
export const caseCatalog = [case001, case002, case003];
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

### 5.1 记录内图形题

当前 `app.js` 的 `renderPuzzle` 只支持第二章的四位数字图案密码，并写死了标题、四枚图标、数字输入规则和错误提示。第三章需要先把记录内谜题改成按 `puzzle.type` 分发的通用组件：

```js
puzzle: {
  type: "order", // 省略表示旧版 symbol-code；也支持 order | code | choice
  prompt: "按真实行走顺序排列四张足迹卡",
  answer: "CADB",
  unlocks: ["FILE-04"],
  hints: ["比较泥迹变化", "检查前后爪交替", "正确顺序是 C-A-D-B"],
  items: [{ id: "C", text: "纹理 4；从翻倒猫草盆开始……" }]
}
```

建议渲染器拆为：

- 省略 `type`：保留第二章现有四位数字图案密码。
- `order`：用按钮上下移动卡片，提交有序 ID 拼接结果。
- `code`：显示方向图、方向文字与九宫格，仍使用数字输入框。
- `choice`：显示带文字说明的路线卡，使用单选提交。

界面把谜题成功统一转换为 `answer` 概念并触发普通解锁条件。调整中的临时顺序不属于案件事实；只有确实需要离开页面后继续排列时，才将其存入 `puzzleDrafts`。

内容校验需按题型验证：

- `answer` 的格式与题型一致。
- `order` 答案完整覆盖所有卡片且没有重复。
- `code` 答案为四位数字。
- `choice` 答案属于可选路线。
- 第三章题目都有正文或选项文字等价描述、三级 `hints` 和有效 `unlocks`。
- 标记为可选的题目，其解锁目标还存在至少一条不经过该题的路径。

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

共享角色表还应保存跨章节不得漂移的视觉特征，例如小流儿的蓝黄异瞳、小酒儿的黄眼睛与肌肉体型，以及第三章三姐妹的毛色、服装和身体特征。完整基准见[角色设定基准](./character-bible.md)。角色在某章的嫌疑、秘密和证词不进入共享表。

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
- 第三章仅在第二章 `solved` 后解锁。
- 第三章内容校验应断言角色集合严格为小流儿、小酒儿、屁屁、臭臭、香香。
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

### 阶段五：接入第三章

1. 按第三章线索表录入五名角色、阳台地图、足迹、泥样和门锁记录。
2. 将小流儿、小酒儿的新增外貌写入共享角色表，增加屁屁、臭臭、香香。
3. 复用数据驱动的单选与排序题，不为“没有陌生猫”增加新的题型。
4. 将记录内谜题渲染从写死的四位密码扩展为 `symbol-code`、`tile-order`、`direction-code`、`route-choice`。
5. 增加角色集合、谜题答案、无障碍文本、替代解锁路径、痕迹方向和事实可达性校验。
6. 试玩时重点观察玩家能否区分“足迹向内”与“足迹来自室内”，以及三道图形题是否打断调查节奏。

## 11. 暂不建议加入

- 跨章节共享关键词或事实。
- 影响后续主线的多结局。
- 云端账号与同步。
- 为第二章单独复制一套引擎或页面。
- 在第二章内容尚未验证前设计大量第三、第四章专用抽象。

多章节改造的核心边界是“共享引擎与偏好，隔离案件内容与进度”。只要先守住这个边界，后续增加章节不会继续扩大 `app.js` 中的案件特例。
