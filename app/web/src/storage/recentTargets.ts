// 「最近使ったTarget」の保存。Target設定を高速化するための補助機能。
// 内部的にはeffectId等のIDのみを保存し、日本語ラベル文字列はここには一切保存しない
// (表示時にi18n/labelsで都度変換する)。

import type { StoredTarget } from "./simulationHistory";

const STORAGE_KEY = "motsuyoku_sensor_recent_targets_v1";
const MAX_RECENT = 8;

export interface RecentTargetEntry {
  saved_at: string;
  dataset_id: string;
  target: StoredTarget;
}

function readAll(): RecentTargetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentTargetEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 保存できなくても致命的ではない(単なる利便性機能のため)。
  }
}

function targetSignature(datasetId: string, target: StoredTarget): string {
  return JSON.stringify({
    datasetId,
    shape: [...target.shape].sort(),
    primary: target.primary_effect_id,
    primaryRanks: [...target.primary_allowed_ranks].sort((a, b) => a - b),
    secondary: target.secondary_effect_id,
    secondaryRanks: target.secondary_allowed_ranks ? [...target.secondary_allowed_ranks].sort((a, b) => a - b) : null,
    curses: [...target.accepted_curse_ids].sort(),
  });
}

export function addRecentTarget(datasetId: string, target: StoredTarget): void {
  const all = readAll();
  const signature = targetSignature(datasetId, target);
  const deduped = all.filter((e) => targetSignature(e.dataset_id, e.target) !== signature);
  deduped.unshift({ saved_at: new Date().toISOString(), dataset_id: datasetId, target });
  writeAll(deduped.slice(0, MAX_RECENT));
}

export function listRecentTargets(datasetId: string): RecentTargetEntry[] {
  return readAll().filter((e) => e.dataset_id === datasetId);
}
