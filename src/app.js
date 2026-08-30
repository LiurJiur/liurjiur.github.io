import { eventCards, facts, hintStages, locations, profiles, records, solution } from "./content/game-data.js";
import { collectConcept, createInitialState, loadState, markTutorialSeen, normalize, openRecord, recompute, resetTutorialProgress, saveState, search, shouldShowTutorial, validateSolution } from "./engine/game-engine.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const workspace = $("#main-content");
const modal = $("#modal");
const modalContent = $("#modal-content");
const commandInput = $("#command-input");
const tutorialLayer = $("#tutorial-layer");
const tutorialFocus = $("#tutorial-focus");
const tutorialCard = $("#tutorial-card");
let state = loadState(localStorage);
let currentView = "inbox";
let currentFilter = "全部";
let historyIndex = state.history.length;
const scrambledEvents = () => [eventCards[2], eventCards[0], eventCards[4], eventCards[1], eventCards[3]];
let solveOrder = scrambledEvents();
let tutorialSession = null;
let tutorialTimer = null;
let tutorialReturnFocus = null;

const tutorials = {
  home: [
    { selector: ".hero-actions .primary-button", title: "先读调查委托", copy: "从桂花的委托开始。打开记录后，系统会自动标记已读，并收集里面出现的调查概念。" },
    { selector: ".starter-grid", title: "选择调查方向", copy: "角色、地点和证词都能成为入口。点击卡片会收集概念；再次点击同一概念即可检索相关记录。" },
    { selector: "#command-form", title: "也可以直接输入", copy: "输入名字、地点、时间或物品进行检索。按 / 可快速聚焦输入框，↑↓ 可以翻阅命令历史。" },
  ],
  records: [
    { selector: ".filters", title: "按类型筛选", copy: "记录多起来后，可以只看证词、设备日志或现场记录。筛选不会改变调查进度。" },
    { selector: ".record-grid", title: "优先查看未读", copy: "带“未读”标记的卡片可能解锁新线索。点击任意卡片即可打开全文。" },
  ],
  record: [
    { selector: ".document-body", title: "阅读并交叉核对", copy: "首次打开会自动记录阅读进度。正文中的高亮概念可以点击收集，再点一次便会检索。" },
    { selector: ".concept-strip", title: "收集调查概念", copy: "文末汇总了本记录涉及的人物、地点、物品和时间。先收集，再检索，沿着线索继续追查。" },
  ],
  search: [
    { selector: ".page-head", title: "查看检索反馈", copy: "系统会把别名和近似说法归到标准概念；没有命中时，也会给出可尝试的相近词。" },
    { selector: ".record-grid, .empty-state", title: "打开检索结果", copy: "这里只展示当前已解锁的相关记录。随着阅读和检索推进，同一个概念可能出现更多结果。" },
  ],
  map: [
    { selector: ".map-wrap", title: "点击房间调查", copy: "地图上的每个房间都是可收集、可检索的地点概念。它也能帮助你理解球的移动路线。" },
  ],
  timeline: [
    { selector: ".timeline, .empty-state", title: "只看已确认事实", copy: "时间线只收录被多条证据互相印证的事实。空白时继续阅读证词、现场和设备日志即可。" },
  ],
  notes: [
    { selector: ".profile-grid, .empty-state", title: "系统自动整理笔记", copy: "读到新角色后，档案会自动出现；下方概念也可以点击收集或再次检索。" },
  ],
  hint: [
    { selector: "[data-action=\"hint\"]", title: "需要时再获取提示", copy: "每个调查阶段有方向、关键词和具体操作三层提示。使用提示不会影响结局。" },
  ],
  solve: [
    { selector: "[data-action=\"solve\"]", title: "提交最终推理", copy: "选择每道题的答案，并用 ↑↓ 排列事件。核心事实未集齐时可以先预览，但不能提交。" },
  ],
  settings: [
    { selector: "[data-action=\"settings\"]", title: "调整阅读与教学偏好", copy: "这里可以调整字号和动画；教学中心还可关闭自动教学或重置学习进度。" },
  ],
};

const tutorialCatalog = [
  ["home", "开始调查", "阅读委托、选择入口和使用检索框"],
  ["records", "记录库", "筛选记录、识别未读内容"],
  ["record", "阅读记录", "收集高亮概念并继续追查"],
  ["search", "检索", "理解结果、别名和相近词"],
  ["map", "宅邸地图", "点击房间并理解移动路线"],
  ["timeline", "已知时间线", "区分证词和已确认事实"],
  ["notes", "调查笔记", "查看角色和已发现概念"],
  ["hint", "渐进提示", "每个阶段有三层提示，可重复获取"],
  ["solve", "最终推理", "选择答案并用箭头排列事件"],
  ["settings", "设置", "调整字号、动画和教学偏好"],
];

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const getRecord = (id) => records.find((item) => item.id === id);
const unlockedRecords = () => records.filter((item) => state.unlocked.includes(item.id));
const unreadRecords = () => state.unlocked.filter((id) => !state.read.includes(id) && id !== "SYS-00");

function persist() {
  saveState(localStorage, state);
  const status = $("#save-status");
  status.textContent = "● 进度已自动保存";
}

function setState(next) {
  state = next;
  persist();
  updateChrome();
}

function finishTutorial(topic, message) {
  clearTimeout(tutorialTimer);
  tutorialLayer.hidden = true;
  tutorialSession = null;
  if (!state.tutorial.seen.includes(topic)) setState(markTutorialSeen(state, topic));
  if (message) toast(message);
  if (tutorialReturnFocus?.isConnected) tutorialReturnFocus.focus();
  tutorialReturnFocus = null;
}

function positionTutorial() {
  if (!tutorialSession) return;
  const step = tutorials[tutorialSession.topic][tutorialSession.index];
  const target = $(step.selector);
  if (!target) {
    tutorialFocus.hidden = true;
    tutorialCard.style.left = "50%";
    tutorialCard.style.top = "50%";
    tutorialCard.style.bottom = "auto";
    tutorialCard.style.transform = "translate(-50%, -50%)";
    return;
  }
  target.scrollIntoView({ block: "nearest", behavior: state.settings.reducedMotion ? "auto" : "smooth" });
  requestAnimationFrame(() => {
    if (!tutorialSession) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      tutorialFocus.hidden = true;
      tutorialCard.style.left = "50%";
      tutorialCard.style.top = "50%";
      tutorialCard.style.bottom = "auto";
      tutorialCard.style.transform = "translate(-50%, -50%)";
      return;
    }
    const padding = 7;
    tutorialFocus.hidden = false;
    tutorialFocus.style.left = `${Math.max(5, rect.left - padding)}px`;
    tutorialFocus.style.top = `${Math.max(5, rect.top - padding)}px`;
    tutorialFocus.style.width = `${Math.min(innerWidth - 10, rect.width + padding * 2)}px`;
    tutorialFocus.style.height = `${Math.min(innerHeight - 10, rect.height + padding * 2)}px`;
    tutorialCard.style.transform = "none";
    const cardWidth = Math.min(370, innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), innerWidth - cardWidth - 12);
    const placeBelow = rect.bottom + 210 < innerHeight || rect.top < 230;
    tutorialCard.style.left = `${left}px`;
    tutorialCard.style.top = placeBelow ? `${Math.min(innerHeight - 190, rect.bottom + 16)}px` : "auto";
    tutorialCard.style.bottom = placeBelow ? "auto" : `${Math.max(12, innerHeight - rect.top + 16)}px`;
  });
}

function renderTutorialStep() {
  const steps = tutorials[tutorialSession.topic];
  const step = steps[tutorialSession.index];
  $("#tutorial-progress").textContent = `操作教学 ${tutorialSession.index + 1} / ${steps.length}`;
  $("#tutorial-title").textContent = step.title;
  $("#tutorial-copy").textContent = step.copy;
  $("[data-tutorial-prev]").hidden = tutorialSession.index === 0;
  $("[data-tutorial-next]").textContent = tutorialSession.index === steps.length - 1 ? "完成" : "下一步";
  positionTutorial();
  $("[data-tutorial-next]").focus();
}

function startTutorial(topic, force = false) {
  if (!tutorials[topic] || modal.open || (!force && !shouldShowTutorial(state, topic))) return;
  tutorialReturnFocus = document.activeElement;
  tutorialSession = { topic, index: 0 };
  tutorialLayer.hidden = false;
  renderTutorialStep();
}

function queueTutorial(topic) {
  clearTimeout(tutorialTimer);
  tutorialTimer = setTimeout(() => startTutorial(topic), 180);
}

function inlineTutorial(topic, title, copy) {
  if (!shouldShowTutorial(state, topic)) return "";
  setState(markTutorialSeen(state, topic));
  return `<aside class="inline-tutorial"><span aria-hidden="true">✦</span><div><b>${escapeHtml(title)}</b><p>${escapeHtml(copy)}</p></div></aside>`;
}

function showTutorialCenter() {
  const completed = state.tutorial.seen.length;
  modalContent.innerHTML = `<div class="modal-inner"><div class="modal-head"><div><p class="eyebrow-dark">LEARNING CENTER</p><h2>操作教学</h2></div><button class="close-button" data-close aria-label="关闭">×</button></div>
    <p class="modal-intro">每项操作在第一次使用时都会主动讲解，也可以从这里随时重看。已学习 ${completed} / ${tutorialCatalog.length} 项。</p>
    <div class="tutorial-list">${tutorialCatalog.map(([id, title, copy]) => `<article><span class="tutorial-status ${state.tutorial.seen.includes(id) ? "done" : ""}">${state.tutorial.seen.includes(id) ? "✓" : "·"}</span><span><b>${title}</b><small>${copy}</small></span><button type="button" class="secondary-button" data-tutorial-start="${id}">重看</button></article>`).join("")}</div>
    <label class="setting-row"><span><b>自动显示首次教学</b><br><small>关闭后仍可从教学中心重看</small></span><input id="automatic-tutorial" type="checkbox" ${state.tutorial.automatic ? "checked" : ""}></label>
    <button type="button" class="secondary-button" data-action="reset-tutorial">重置教学进度</button></div>`;
  modal.showModal();
}

function formatBody(body) {
  return body.trim().split(/\n\n+/).map((paragraph) => {
    let output = escapeHtml(paragraph);
    output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\[([^\]]+)\]/g, (_, concept) => `<button type="button" class="concept-link" data-search="${escapeHtml(concept)}">${escapeHtml(concept)}</button>`);
    output = output.replace(/\n/g, "<br>");
    return `<p>${output}</p>`;
  }).join("");
}

function recordIcon(type) {
  return ({ "系统": "⌘", "委托": "✉", "群聊": "◌", "物品": "◆", "地图": "⌂", "证词": "❝", "传感器": "⌁", "设备日志": "▦", "设备档案": "▣", "现场记录": "◎", "已确认事实": "✓", "结案": "★" })[type] || "▤";
}

function updateChrome() {
  const confirmed = facts.filter((fact) => state.confirmedFacts.includes(fact.id));
  const progress = Math.round((confirmed.length / facts.length) * 100);
  $("#progress-text").textContent = `${progress}%`;
  $("#progress-bar").style.width = `${progress}%`;
  $("#case-stats").textContent = `已读 ${state.read.length} / ${records.length} 条记录`;
  $("#unread-badge").textContent = unreadRecords().length;
  $("#unread-badge").hidden = unreadRecords().length === 0;
  $("#facts-count").textContent = `${confirmed.length} / ${facts.length}`;
  $("#facts-list").innerHTML = facts.map((fact, index) => {
    const done = state.confirmedFacts.includes(fact.id);
    return `<li class="${done ? "done" : ""}"><i>${done ? "✓" : index + 1}</i><span><b>${done ? escapeHtml(fact.title) : "待确认事实"}</b>${done ? escapeHtml(fact.detail) : "继续交叉核对记录"}</span></li>`;
  }).join("");
  const concepts = state.discovered.slice(-12).reverse();
  $("#recent-concepts").innerHTML = concepts.length ? concepts.map((concept) => `<button class="chip" data-search="${escapeHtml(concept)}">${escapeHtml(concept)}</button>`).join("") : "<small>阅读记录后，关键词会出现在这里。</small>";
  const hintStage = hintStages.find((stage) => !state.confirmedFacts.includes(stage.until));
  $("#suggestion-text").textContent = state.solved ? "事件已结案。红球平安回到了小酒身边。" : (hintStage?.hints[0] || "证据已经齐全，可以提交最终推理了。");
  $("#concept-suggestions").innerHTML = state.discovered.map((concept) => `<option value="${escapeHtml(concept)}"></option>`).join("");
  document.documentElement.style.setProperty("--font-scale", state.settings.fontScale);
  document.body.classList.toggle("reduce-motion", state.settings.reducedMotion);
}

function toast(message) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  $("#toast-region").append(element);
  setTimeout(() => element.remove(), 3500);
}

function announceUnlocks(ids) {
  const visible = ids.filter((id) => !id.startsWith("SUM-"));
  if (visible.length) toast(`新解锁 ${visible.length} 条记录：${visible.map((id) => getRecord(id)?.title).join("、")}`);
  const summaries = ids.filter((id) => id.startsWith("SUM-"));
  if (summaries.length) toast(`证据互相印证，生成 ${summaries.length} 条阶段结论。`);
}

function setView(view) {
  currentView = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "inbox") renderHome();
  if (view === "records") renderRecords();
  if (view === "map") renderMap();
  if (view === "timeline") renderTimeline();
  if (view === "notes") renderNotes();
  workspace.scrollTop = 0;
  queueTutorial(view === "inbox" ? "home" : view);
}

function renderHome() {
  const reqRead = state.read.includes("REQ-01");
  workspace.innerHTML = `
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow-dark">桂花宅智能家庭终端 / CASE #001</p>
        <h1>${state.solved ? "玩具球已经<em>找回</em>" : "一颗红球，<br>六段<em>不完整</em>的记忆"}</h1>
        <p>${state.solved ? "每一只猫都推了小意外一爪，但没有真正的坏猫。你已经还原了红球从客厅到洗衣阳台的完整路线。" : "晚饭后，小酒最心爱的红色铃铛球不见了。检索聊天、证词和设备日志，找出它怎样穿过了半栋房子。这里没有危险，也没有真正的坏猫。"}</p>
        <div class="hero-actions">
          <button class="primary-button" data-open="${state.solved ? "END-01" : "REQ-01"}">${state.solved ? "重温结案记录" : reqRead ? "继续调查" : "阅读桂花的委托"}</button>
          <button class="secondary-button" data-open="SYS-00">如何调查？</button>
        </div>
      </div>
    </section>
    <div class="starter-grid" aria-label="推荐调查入口">
      <button class="starter-card" data-search="小酒"><span>🐈‍⬛</span><span><b>从角色开始</b><small>问问最后玩球的小酒</small></span></button>
      <button class="starter-card" data-search="客厅"><span>⌂</span><span><b>从现场开始</b><small>查看客厅留下的声音</small></span></button>
      <button class="starter-card" data-open="CHAT-01"><span>◌</span><span><b>从证词开始</b><small>谁的话互相矛盾？</small></span></button>
    </div>`;
}

function renderRecords() {
  const types = ["全部", ...new Set(unlockedRecords().map((item) => item.type))];
  if (!types.includes(currentFilter)) currentFilter = "全部";
  const visible = unlockedRecords().filter((item) => currentFilter === "全部" || item.type === currentFilter);
  workspace.innerHTML = `
    <div class="page-head"><div><p class="eyebrow-dark">AUTHORIZED ARCHIVE</p><h1>已解锁记录</h1></div><p>打开记录会发现新的可检索概念。带“未读”标记的内容可能让证据链继续前进。</p></div>
    <div class="filters">${types.map((type) => `<button class="filter ${type === currentFilter ? "active" : ""}" data-filter="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join("")}</div>
    <div class="record-grid">${visible.map((item) => `
      <button class="record-card ${state.read.includes(item.id) ? "" : "unread"}" data-open="${item.id}">
        <span class="record-icon">${recordIcon(item.type)}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.type)}</small><code>${item.id}</code></span>
      </button>`).join("")}</div>`;
}

function renderRecord(id) {
  const result = openRecord(state, id);
  if (!result.opened) return toast("该记录尚未解锁。");
  setState(result.state);
  announceUnlocks(result.newIds);
  currentView = "record";
  $$(".nav-item").forEach((button) => button.classList.remove("active"));
  const item = result.opened;
  workspace.innerHTML = `<article class="document">
    <button class="back-button" data-view="records">← 返回记录库</button>
    <header class="document-head"><div class="document-meta"><span class="type-pill">${recordIcon(item.type)} ${escapeHtml(item.type)}</span><span>${item.id}</span></div><h1>${escapeHtml(item.title)}</h1></header>
    <div class="document-body">${formatBody(item.body)}</div>
    <footer class="concept-strip"><b>本记录涉及的概念</b><div class="chip-cloud">${item.concepts.map((concept) => `<button class="chip" data-search="${escapeHtml(concept)}">${escapeHtml(concept)}</button>`).join("")}</div></footer>
  </article>`;
  workspace.scrollTop = 0;
  queueTutorial("record");
}

function performSearch(rawQuery) {
  const result = search(state, rawQuery);
  setState(result.state);
  announceUnlocks(result.newIds);
  currentView = "search";
  $$(".nav-item").forEach((button) => button.classList.remove("active"));
  const query = result.concept || rawQuery;
  workspace.innerHTML = `<div class="page-head"><div><p class="eyebrow-dark">SEARCH RESULT</p><h1>检索：${escapeHtml(query)}</h1></div><p>${result.concept ? `找到 ${result.results.length} 条当前有权查看的相关记录。` : "没有识别出这个概念。试试下方建议，或从已发现关键词继续。"}</p></div>
    ${result.results.length ? `<div class="record-grid">${result.results.map((item) => `<button class="record-card ${state.read.includes(item.id) ? "" : "unread"}" data-open="${item.id}"><span class="record-icon">${recordIcon(item.type)}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.type)}</small><code>${item.id}</code></span></button>`).join("")}</div>` : `<div class="empty-state"><span>⌕</span><p>${result.suggestions.length ? "你是不是想找：" : "先阅读已有记录，寻找新的名字、地点、物品或时间。"}</p><div class="chip-cloud" style="justify-content:center">${result.suggestions.map((item) => `<button class="chip" data-search="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div></div>`}`;
  workspace.scrollTop = 0;
  queueTutorial("search");
}

function handleConceptClick(rawConcept) {
  const result = collectConcept(state, rawConcept);
  if (!result.collected) return performSearch(rawConcept);
  setState(result.state);
  toast(`已收集概念：${result.concept}。再次点击即可检索。`);
}

function renderMap() {
  workspace.innerHTML = `<div class="page-head"><div><p class="eyebrow-dark">GROUND FLOOR</p><h1>桂花宅一层</h1></div><p>房间可以点击检索。走廊连接了球失踪路线上的大部分地点。</p></div>
    <div class="map-wrap" aria-label="桂花宅房间示意图">${locations.map((place) => `<button class="room" data-search="${place.name}" style="left:${place.x}%;top:${place.y}%;width:${place.w}%;height:${place.h}%"><span><b>${place.name}</b><small>${place.note}</small></span></button>`).join("")}</div>`;
}

function renderTimeline() {
  const confirmed = facts.filter((fact) => state.confirmedFacts.includes(fact.id));
  workspace.innerHTML = `<div class="page-head"><div><p class="eyebrow-dark">CONFIRMED EVENTS</p><h1>已知时间线</h1></div><p>这里只记录被多条证据互相印证的事实，单只猫的说法不会自动成为结论。</p></div>
    ${confirmed.length ? `<div class="timeline">${confirmed.map((fact) => `<article class="timeline-item"><time>${fact.time}</time><h3>${escapeHtml(fact.title)}</h3><p>${escapeHtml(fact.detail)}</p></article>`).join("")}</div>` : `<div class="empty-state"><span>◷</span>还没有确认事实。先打开记录并交叉核对证词与设备日志。</div>`}`;
}

function renderNotes() {
  const visibleProfiles = profiles.filter((profile) => state.discovered.includes(profile.name));
  workspace.innerHTML = `<div class="page-head"><div><p class="eyebrow-dark">INVESTIGATION NOTES</p><h1>调查笔记</h1></div><p>系统自动整理已经读到的角色和概念。点击关键词可再次检索。</p></div>
    <h2>角色档案</h2>
    ${visibleProfiles.length ? `<div class="profile-grid">${visibleProfiles.map((profile) => `<article class="profile-card"><span class="profile-avatar">${profile.icon}</span><span><h3>${profile.name}</h3><small>${profile.role}</small></span><p>${profile.detail}</p></article>`).join("")}</div>` : `<div class="empty-state">阅读家庭群聊后会出现角色档案。</div>`}
    <h2 style="margin-top:32px">已发现概念</h2><div class="chip-cloud">${state.discovered.map((concept) => `<button class="chip" data-search="${escapeHtml(concept)}">${escapeHtml(concept)}</button>`).join("")}</div>`;
}

function showHint() {
  if (state.solved) return toast("案件已经结案。辛苦了，调查员！");
  const stageIndex = hintStages.findIndex((stage) => !state.confirmedFacts.includes(stage.until));
  if (stageIndex < 0) return toast("证据已经齐全，可以提交最终推理了。");
  const key = hintStages[stageIndex].until;
  const level = Math.min(state.hints[key] || 0, 2);
  const next = structuredClone(state);
  next.hints[key] = level + 1;
  next.hintCount += 1;
  setState(next);
  const lesson = inlineTutorial("hint", "提示会逐层加强", "同一调查阶段共有方向、关键词和具体操作三层提示。使用提示不会影响结局。");
  modalContent.innerHTML = `<div class="modal-inner"><div class="modal-head"><div><p class="eyebrow-dark">HINT LEVEL ${level + 1} / 3</p><h2>调查提示</h2></div><button class="close-button" data-close aria-label="关闭">×</button></div>${lesson}<p style="font-size:1.05rem;line-height:1.8">${hintStages[stageIndex].hints[level]}</p><button class="primary-button" data-close>继续调查</button></div>`;
  modal.showModal();
}

function showHelp() {
  modalContent.innerHTML = `<div class="modal-inner"><div class="modal-head"><div><p class="eyebrow-dark">COMMAND GUIDE</p><h2>终端命令</h2></div><button class="close-button" data-close aria-label="关闭">×</button></div>
    <div class="document-body"><p><strong>inbox</strong> 调查首页　<strong>list</strong> 已解锁记录　<strong>open ID</strong> 打开记录</p><p><strong>search 关键词</strong> 检索概念　<strong>profile 名字</strong> 查看角色　<strong>map</strong> 地图</p><p><strong>timeline</strong> 已确认时间线　<strong>notes</strong> 笔记　<strong>hint</strong> 提示　<strong>solve</strong> 最终推理</p><p>也可直接输入任何名字、地点、时间或物品。所有核心操作都能点击完成。</p></div></div>`;
  modal.showModal();
}

function showSettings() {
  const lesson = inlineTutorial("settings", "按自己的习惯阅读", "字号和减少动画会立即生效。教学开关与重置入口在教学中心，清除存档则会重开整个案件。");
  modalContent.innerHTML = `<div class="modal-inner"><div class="modal-head"><div><p class="eyebrow-dark">PREFERENCES</p><h2>终端设置</h2></div><button class="close-button" data-close aria-label="关闭">×</button></div>
    ${lesson}
    <label class="setting-row"><span><b>文字大小</b><br><small>立即应用到所有记录</small></span><select id="font-scale"><option value="0.9">较小</option><option value="1">标准</option><option value="1.12">较大</option><option value="1.25">特大</option></select></label>
    <label class="setting-row"><span><b>减少动画</b><br><small>关闭移动与过渡效果</small></span><input id="reduce-motion" type="checkbox" ${state.settings.reducedMotion ? "checked" : ""}></label>
    <button class="danger-button" data-action="reset">清除存档并重新开始</button></div>`;
  modal.showModal();
  $("#font-scale").value = String(state.settings.fontScale);
}

function showSolve() {
  const missing = solution.requiredFacts.filter((id) => !state.confirmedFacts.includes(id));
  if (state.solved) return renderRecord("END-01");
  solveOrder = scrambledEvents();
  const lesson = inlineTutorial("solve", "用全部证据完成复盘", "先选择每道题的答案，再用 ↑↓ 调整事件顺序。核心事实未集齐时可以预览题目，但不能提交。");
  modalContent.innerHTML = `<form id="solve-form" class="modal-inner"><div class="modal-head"><div><p class="eyebrow-dark">FINAL DEDUCTION</p><h2>提交最终推理</h2></div><button type="button" class="close-button" data-close aria-label="关闭">×</button></div>
    ${lesson}
    ${missing.length ? `<div class="solve-feedback">还有 ${missing.length} 个核心事实未确认。你仍可查看题目，但需要让证词、现场与设备记录互相印证后才能提交。</div>` : ""}
    <div class="question"><label for="last-player">1. 最后一个正常玩球的是谁？</label><select id="last-player" required><option value="">请选择</option>${profiles.filter((p) => p.name !== "小扫").map((p) => `<option>${p.name}</option>`).join("")}</select></div>
    <div class="question"><label for="first-taker">2. 小酒之后，谁第一次主动拿走球？</label><select id="first-taker" required><option value="">请选择</option>${profiles.filter((p) => p.name !== "小扫").map((p) => `<option>${p.name}</option>`).join("")}</select></div>
    <div class="question"><b>3. 哪两只猫为掩盖秘密而提供了与记录冲突的证词？</b><div class="check-grid">${["小酒", "铁胆", "小流儿", "糖心", "松花"].map((name) => `<label class="check-option"><input type="checkbox" name="liars" value="${name}"> ${name}</label>`).join("")}</div></div>
    <div class="question"><label for="carrier">4. 什么最终带走了球？</label><select id="carrier" required><option value="">请选择</option><option>铁胆</option><option>小流儿</option><option>小扫</option><option>暖气垫</option></select></div>
    <div class="question"><label for="location">5. 球现在在哪里？</label><select id="location" required><option value="">请选择</option><option>厨房门边</option><option>蓝色纸箱</option><option>客厅沙发底</option><option>洗衣阳台的小扫后篮</option></select></div>
    <div class="question"><b>6. 按时间排列事件</b><div id="event-order" class="event-order"></div></div>
    <div id="solve-feedback"></div><button class="primary-button" type="submit" ${missing.length ? "disabled" : ""}>核对证据并结案</button></form>`;
  renderEventOrder();
  modal.showModal();
}

function renderEventOrder() {
  const container = $("#event-order");
  if (!container) return;
  container.innerHTML = solveOrder.map((event, index) => `<div class="event-row"><span>${index + 1}</span><span>${event.text}</span><span class="move-buttons"><button type="button" data-move="up" data-index="${index}" aria-label="向前移动" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" data-index="${index}" aria-label="向后移动" ${index === solveOrder.length - 1 ? "disabled" : ""}>↓</button></span></div>`).join("");
}

function finishGame() {
  modalContent.innerHTML = `<div class="modal-inner ending"><div class="ending-icon">🔔</div><p class="eyebrow-dark">CASE CLOSED</p><h2>球找到了！</h2><blockquote>“检测到可移动障碍物。”——小扫，在红球响起以后</blockquote><p>球安静地待在洗衣阳台的小扫后篮里。铁胆承认偷吃，小流儿公开宝物馆，小酒也坦白撞到了零食罐。</p><p>使用提示：${state.hintCount} 次　·　已读记录：${state.read.length} 条</p><button class="primary-button" data-close data-open="END-01">阅读完整结案记录</button></div>`;
}

function handleCommand(raw) {
  const value = raw.trim();
  if (!value) return;
  const next = structuredClone(state);
  next.history.push(value);
  if (next.history.length > 30) next.history.shift();
  setState(next);
  historyIndex = state.history.length;
  commandInput.value = "";
  const [command, ...rest] = value.split(/\s+/);
  const argument = rest.join(" ");
  const normalizedCommand = normalize(command);
  if (["help", "帮助", "?"].includes(normalizedCommand)) return showHelp();
  if (["inbox", "home", "首页"].includes(normalizedCommand)) return setView("inbox");
  if (["list", "记录", "记录库"].includes(normalizedCommand)) return setView("records");
  if (["map", "地图"].includes(normalizedCommand)) return setView("map");
  if (["timeline", "时间线"].includes(normalizedCommand)) return setView("timeline");
  if (["notes", "笔记"].includes(normalizedCommand)) return setView("notes");
  if (["hint", "提示"].includes(normalizedCommand)) return showHint();
  if (["solve", "推理", "结案"].includes(normalizedCommand)) return showSolve();
  if (["open", "打开"].includes(normalizedCommand)) return renderRecord(argument.toUpperCase());
  if (["search", "搜索", "检索"].includes(normalizedCommand)) return performSearch(argument);
  if (["profile", "档案"].includes(normalizedCommand)) { setView("notes"); return; }
  performSearch(value);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.tutorialNext !== undefined && tutorialSession) {
    const steps = tutorials[tutorialSession.topic];
    if (tutorialSession.index === steps.length - 1) finishTutorial(tutorialSession.topic, "本节教学已完成，可在“教学”中随时重看。");
    else { tutorialSession.index += 1; renderTutorialStep(); }
    return;
  }
  if (target.dataset.tutorialPrev !== undefined && tutorialSession) {
    tutorialSession.index = Math.max(0, tutorialSession.index - 1);
    renderTutorialStep();
    return;
  }
  if (target.dataset.tutorialSkip !== undefined && tutorialSession) {
    finishTutorial(tutorialSession.topic, "已跳过本节教学。");
    return;
  }
  if (target.dataset.tutorialStart) {
    const topic = target.dataset.tutorialStart;
    const topicViews = { home: "inbox", records: "records", map: "map", timeline: "timeline", notes: "notes" };
    modal.close();
    if (topicViews[topic]) setView(topicViews[topic]);
    clearTimeout(tutorialTimer);
    setTimeout(() => startTutorial(topic, true), 80);
    return;
  }
  if (target.dataset.view) setView(target.dataset.view);
  if (target.dataset.open) {
    if (modal.open) modal.close();
    renderRecord(target.dataset.open);
  }
  if (target.dataset.search) handleConceptClick(target.dataset.search);
  if (target.dataset.filter) { currentFilter = target.dataset.filter; renderRecords(); }
  if (target.dataset.close !== undefined) modal.close();
  if (target.dataset.action === "home") setView("inbox");
  if (target.dataset.action === "hint") showHint();
  if (target.dataset.action === "tutorial") showTutorialCenter();
  if (target.dataset.action === "settings") showSettings();
  if (target.dataset.action === "solve") showSolve();
  if (target.dataset.action === "reset-tutorial") {
    setState(resetTutorialProgress(state));
    modal.close();
    setView("inbox");
    toast("教学进度已重置，将重新显示首次教学。");
  }
  if (target.dataset.action === "reset") {
    if (window.confirm("确定清除全部调查进度吗？此操作无法撤销。")) {
      localStorage.removeItem("cat-help-save");
      state = createInitialState();
      persist();
      modal.close();
      updateChrome();
      setView("inbox");
      toast("存档已清除，调查重新开始。");
    }
  }
  if (target.dataset.move) {
    const index = Number(target.dataset.index);
    const destination = target.dataset.move === "up" ? index - 1 : index + 1;
    [solveOrder[index], solveOrder[destination]] = [solveOrder[destination], solveOrder[index]];
    renderEventOrder();
  }
});

$("#command-form").addEventListener("submit", (event) => { event.preventDefault(); handleCommand(commandInput.value); });
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" && state.history.length) { event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); commandInput.value = state.history[historyIndex] || ""; }
  if (event.key === "ArrowDown" && state.history.length) { event.preventDefault(); historyIndex = Math.min(state.history.length, historyIndex + 1); commandInput.value = state.history[historyIndex] || ""; }
});
document.addEventListener("keydown", (event) => {
  if (tutorialSession && event.key === "Tab") {
    const controls = $$('button:not([hidden]):not([disabled])', tutorialCard);
    const nextIndex = (controls.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault();
    controls[nextIndex].focus();
    return;
  }
  if (event.key === "/" && document.activeElement !== commandInput && !modal.open && !tutorialSession) { event.preventDefault(); commandInput.focus(); }
  if ((event.key === "h" || event.key === "H") && document.activeElement !== commandInput && !modal.open && !tutorialSession) showHint();
  if (event.key === "Escape" && tutorialSession) finishTutorial(tutorialSession.topic, "已跳过本节教学。");
  else if (event.key === "Escape" && modal.open) modal.close();
});
window.addEventListener("resize", positionTutorial);
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });
modal.addEventListener("change", (event) => {
  if (event.target.id === "font-scale") { const next = structuredClone(state); next.settings.fontScale = Number(event.target.value); setState(next); }
  if (event.target.id === "reduce-motion") { const next = structuredClone(state); next.settings.reducedMotion = event.target.checked; setState(next); }
  if (event.target.id === "automatic-tutorial") { const next = structuredClone(state); next.tutorial.automatic = event.target.checked; setState(next); }
});
modal.addEventListener("submit", (event) => {
  if (event.target.id !== "solve-form") return;
  event.preventDefault();
  const answer = {
    lastPlayer: $("#last-player").value,
    firstTaker: $("#first-taker").value,
    liars: $$("input[name=liars]:checked").map((input) => input.value),
    carrier: $("#carrier").value,
    location: $("#location").value,
    order: solveOrder.map((item) => item.id),
  };
  const result = validateSolution(answer, solution);
  if (!result.correct) {
    $("#solve-feedback").innerHTML = `<div class="solve-feedback"><b>还有矛盾：</b><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>`;
    return;
  }
  const next = structuredClone(state);
  next.solved = true;
  setState(recompute(next));
  finishGame();
});

updateChrome();
setView(state.solved ? "inbox" : currentView);
