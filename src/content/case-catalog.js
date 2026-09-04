import { case001 } from "./cases/case-001/index.js";
import { case002 } from "./cases/case-002/index.js";

export const caseCatalog = [case001, case002];
export const casesById = new Map(caseCatalog.map((item) => [item.id, item]));

export function isCaseUnlocked(caseData, cases) {
  if (caseData.unlock.type === "start") return true;
  if (caseData.unlock.type === "case-solved") return Boolean(cases[caseData.unlock.caseId]?.solved);
  return false;
}
