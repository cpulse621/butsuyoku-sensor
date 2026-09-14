// 重み付き抽選の共通ユーティリティ。
// entry.weight（raw weight）を優先し、なければ entry.probabilityPct を使う
// （仕様書 Fidelity Contract: 「同一プール内でweight方式とpercent方式を混在させない」）。
// どちらも無い場合は「データが無い」ことを意味するので、黙って0扱いにせず例外を投げる。

export function effectiveWeight(entry) {
  if (typeof entry.weight === "number") return entry.weight;
  if (typeof entry.probabilityPct === "number") return entry.probabilityPct;
  return null;
}

export function totalWeight(entries) {
  let sum = 0;
  for (const e of entries) {
    const w = effectiveWeight(e);
    if (w === null) {
      const id = e.effectId ?? e.curseId ?? e.shapeId ?? "?";
      throw new Error(`weightedPick: entry "${id}" has no usable weight/probabilityPct`);
    }
    sum += w;
  }
  return sum;
}

export function weightedPick(entries, rng) {
  if (!entries || entries.length === 0) {
    throw new Error("weightedPick: entries is empty");
  }
  const total = totalWeight(entries);
  if (!(total > 0)) {
    throw new Error("weightedPick: total weight is not positive");
  }
  let r = rng.next() * total;
  for (const e of entries) {
    const w = effectiveWeight(e);
    if (r < w) return e;
    r -= w;
  }
  // 浮動小数点誤差の保険として最後の要素を返す
  return entries[entries.length - 1];
}
