import { aliases, eventCards, facts, hintStages, locations, profiles, records } from "../../game-data.js";

const characterOptions = profiles.filter((item) => item.name !== "小扫").map((item) => item.name);
const questions = [
  { id: "last-player", type: "single", prompt: "最后一个正常玩球的是谁？", options: characterOptions, answer: "小酒", error: "最后玩球的猫与 20:07 的目击记录不符。" },
  { id: "first-taker", type: "single", prompt: "小酒之后，谁第一次主动拿走球？", options: characterOptions, answer: "小流儿", error: "第一个主动拿球的角色无法解释 20:17 后的路线。" },
  { id: "liars", type: "multiple", prompt: "哪两只猫为掩盖秘密而提供了与记录冲突的证词？", options: ["小酒", "铁胆", "小流儿", "糖心", "松花"], answer: ["铁胆", "小流儿"], error: "证词冲突者没有同时满足“秘密”和“客观记录反驳”。" },
  { id: "carrier", type: "single", prompt: "什么最终带走了球？", options: ["铁胆", "小流儿", "小扫", "暖气垫"], answer: "小扫", error: "带走球的对象无法解释 20:33 的第二次铃声。" },
  { id: "location", type: "single", prompt: "球现在在哪里？", options: ["厨房门边", "蓝色纸箱", "客厅沙发底", "洗衣阳台的小扫后篮"], answer: "洗衣阳台的小扫后篮", error: "最终位置与返航记录或收纳结构不符。" },
  { id: "event-order", type: "order", prompt: "按时间排列事件", options: eventCards.map((item) => item.id), answer: eventCards.map((item) => item.id), error: "事件顺序仍有矛盾，请重新比较时间戳。" },
];

export const case001 = {
  id: "case-001", number: "001", contentVersion: 1, title: "玩具球失踪事件",
  subtitle: "一颗红球，六段不完整的记忆", duration: "45～60 分钟", unlock: { type: "start" },
  presentation: {
    homeEyebrow: "桂花宅智能家庭终端 / CASE #001",
    homeTitle: "一颗红球，<br>六段<em>不完整</em>的记忆",
    homeBody: "晚饭后，小酒最心爱的红色铃铛球不见了。检索聊天、证词和设备日志，找出它怎样穿过了半栋房子。这里没有危险，也没有真正的坏猫。",
    solvedTitle: "玩具球已经<em>找回</em>", solvedBody: "每一只猫都推了小意外一爪，但没有真正的坏猫。你已经还原了红球从客厅到洗衣阳台的完整路线。",
    activeCopy: "失物调查进行中", solvedCopy: "玩具球失踪事件已结案", suggestionSolved: "事件已结案。红球平安回到了小酒身边。",
    endingIcon: "🔔", endingTitle: "球找到了！", endingQuote: "“检测到可移动障碍物。”——小扫，在红球响起以后",
    endingBody: "球安静地待在洗衣阳台的小扫后篮里。铁胆承认偷吃，小流儿公开宝物馆，小酒也坦白撞到了零食罐。",
    mapEyebrow: "GROUND FLOOR", mapTitle: "桂花宅一层", mapBody: "首次点击房间会收集地点并解锁相关记录，再次点击才检索。走廊连接了球失踪路线上的大部分地点。",
    starterCards: [
      { icon: "🐈‍⬛", title: "从角色开始", copy: "问问最后玩球的小酒", search: "小酒" },
      { icon: "⌂", title: "从现场开始", copy: "查看客厅留下的声音", search: "客厅" },
      { icon: "◌", title: "从证词开始", copy: "谁的话互相矛盾？", open: "CHAT-01" },
    ],
  },
  aliases, profiles, locations, facts, hintStages, eventCards, records,
  solution: { requiredFacts: facts.map((item) => item.id), questions },
};
