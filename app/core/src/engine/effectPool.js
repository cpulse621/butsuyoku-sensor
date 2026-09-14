// EffectPool操作ユーティリティ。__blocked プールへのアクセスをここで一元的にガードする。

import { MissingPoolDataError } from "../errors.js";
import { effectiveWeight, totalWeight } from "./weightedPick.js";

export function allEntries(pool) {
  if (pool.__blocked) {
    throw new MissingPoolDataError(
      `EffectPool "${pool.effectPoolId}" is blocked: ${pool.__blockedReason ?? "missing data"}`,
      { effectPoolId: pool.effectPoolId }
    );
  }
  return [...(pool.nativeEntries ?? []), ...(pool.ooeEntries ?? [])];
}

export function findEntry(pool, effectId) {
  return allEntries(pool).find((e) => e.effectId === effectId) ?? null;
}

// そのプール内での effectId の（排他前の）raw確率
export function effectProbability(pool, effectId) {
  const entries = allEntries(pool);
  const total = totalWeight(entries);
  const entry = entries.find((e) => e.effectId === effectId);
  if (!entry) return 0;
  return effectiveWeight(entry) / total;
}
