import type { GemDataset } from "motsuyoku-sensor-core";
import { lookupDisplayValue } from "motsuyoku-sensor-core";

// effectId/curseId/shapeId は Core 側では snake_case の内部IDのまま保持されている
// (Core は表示名辞書を持たない)。ここでは翻訳を捏造せず、見やすさのための
// 機械的な整形(アンダースコア→スペース)のみを行う表示専用ユーティリティ。
export function humanizeId(id: string): string {
  return id.replace(/_/g, " ");
}

export interface FormattedValue {
  text: string;
  verificationStatus: "confirmed" | "provisional" | "unknown";
}

// 1つのrankについて、Coreのvalue/unit/displayFormatをもとに表示用文字列を組み立てる。
// 数値そのものの計算・確定判定はCore(lookupDisplayValue)に委ね、ここでは整形のみ行う。
export function formatEffectValue(dataset: GemDataset, slot: "primary" | "secondary", effectId: string, rank: number): FormattedValue {
  const info = lookupDisplayValue(dataset, slot, effectId, rank);
  if (info.value === null) {
    return { text: `R${rank}（未検証）`, verificationStatus: info.verificationStatus };
  }
  const dp = info.displayFormat?.decimalPlaces;
  let numText = typeof dp === "number" ? info.value.toFixed(dp) : String(info.value);
  if (info.displayFormat?.showSign && info.value > 0 && !numText.startsWith("+")) {
    numText = `+${numText}`;
  }
  const suffix = info.displayFormat?.suffix ?? (info.unit === "percent" ? "%" : info.unit === "percent_reduction" ? "%減" : "");
  return { text: `R${rank} ${numText}${suffix}`, verificationStatus: info.verificationStatus };
}

export function formatProbability(p: number): string {
  if (p <= 0) return "0%（成立しない組み合わせ）";
  if (p >= 0.0001) return `${(p * 100).toPrecision(4)}%`;
  return `${(p * 100).toExponential(3)}%`;
}

export function formatOneInN(approxOneInN: number): string {
  if (!Number.isFinite(approxOneInN)) return "∞分の1";
  return `約 1/${Math.round(approxOneInN).toLocaleString("ja-JP")}`;
}
