import { useEffect, useRef } from "react";
import type { GemDataset } from "motsuyoku-sensor-core";
import type { RevealedEntry } from "../hooks/useResearchSession";
import { curseLabel, effectLabel, matchStatusLabel, shapeLabel } from "../i18n/labels";
import { formatEffectValue } from "../lib/format";

interface Props {
  dataset: GemDataset;
  revealed: RevealedEntry[];
}

// 研究上の意図: 10連結果を一気に出すと「140回外れた」という経験が1回の出来事のように
// 見えてしまう。ここでは1件ずつ縦に積み上げて表示し、新しい結果が増えるたびに
// その結果が見える位置までこのカード内部だけをsmooth scrollする(ページ全体は動かさない)。
// 表示の間隔自体はuseResearchSession側(REVEAL_ITEM_DELAY_MS)が制御し、ここでは
// 渡された配列をそのまま描画するだけ(確率・抽選ロジックの再実装はしない)。
export function ResearchRevealList({ dataset, revealed }: Props) {
  const latestRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    latestRef.current?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  }, [revealed.length]);

  if (revealed.length === 0) {
    return (
      <div className="research-reveal-empty">
        <p className="hint">「次の10連」を押す(またはauto条件では自動的に)と、ここに結果が1件ずつ表示されます。</p>
      </div>
    );
  }

  const hasSecondary = dataset.enemy.secondarySlot !== "none";

  return (
    <div className="reveal-list">
      {revealed.map((entry, index) => {
        const { gem } = entry;
        const isLatest = index === revealed.length - 1;
        const primaryValue = formatEffectValue(dataset, "primary", gem.primaryEffectId, gem.primaryValueRank);
        const secondaryValue =
          hasSecondary && gem.secondaryEffectId !== null && gem.secondaryValueRank !== null
            ? formatEffectValue(dataset, "secondary", gem.secondaryEffectId, gem.secondaryValueRank)
            : null;
        return (
          <div
            key={entry.rollCount}
            ref={isLatest ? latestRef : undefined}
            className={`reveal-row ${entry.matched ? "reveal-row--match" : ""}`}
          >
            <span className="reveal-row__index">#{entry.rollCount}</span>
            <span>{shapeLabel(gem.shapeId)}</span>
            <span>
              {effectLabel(gem.primaryEffectId)} {primaryValue.text}
            </span>
            {hasSecondary && <span>{gem.secondaryEffectId ? `${effectLabel(gem.secondaryEffectId)} ${secondaryValue?.text ?? ""}` : "—"}</span>}
            <span>呪い: {curseLabel(gem.curseId)}</span>
            <span className={`reveal-row__badge ${entry.matched ? "reveal-row__badge--match" : "reveal-row__badge--miss"}`}>
              {matchStatusLabel(entry.matched)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
