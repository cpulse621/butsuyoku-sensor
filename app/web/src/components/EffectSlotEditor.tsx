import { useMemo, useState } from "react";
import type { GemDataset, ResearchTargetCatalogEntry } from "motsuyoku-sensor-core";
import { effectProbability } from "motsuyoku-sensor-core";
import { effectLabel } from "../i18n/labels";
import { groupEffectIdsByCategory } from "../i18n/effectCategories";
import { RankMultiSelect } from "./RankMultiSelect";

interface Props {
  dataset: GemDataset;
  slot: "primary" | "secondary";
  title: string;
  catalog: ResearchTargetCatalogEntry[];
  selectedEffectId: string | null;
  onSelectEffect: (effectId: string) => void;
  selectedRanks: number[];
  onToggleRank: (rank: number) => void;
  fallbackRankTiers: number[];
}

// primary、および貞子のような selectable secondary の効果選択UI。
// カテゴリ分け・検索により目的の効果を素早く見つけられるようにする(表示専用の分類・並び替え)。
// 「Valueを1つ以上持つeffectを優先表示」の指示に従い、exactValueSelectableな効果を先に並べる。
export function EffectSlotEditor({
  dataset,
  slot,
  title,
  catalog,
  selectedEffectId,
  onSelectEffect,
  selectedRanks,
  onToggleRank,
  fallbackRankTiers,
}: Props) {
  const [query, setQuery] = useState("");

  const pool = slot === "primary" ? dataset.effectPools.primary : dataset.effectPools.secondary;
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.effectId, c])), [catalog]);

  // カテゴリ内の並び順: 数値検証済みを優先し、次に既知の出現確率が高い順(研究モードでも
  // 並び順にのみ使い、数値そのものはここでは表示しない)。
  function compareEntries(idA: string, idB: string): number {
    const a = catalogById.get(idA);
    const b = catalogById.get(idB);
    if (a?.exactValueSelectable !== b?.exactValueSelectable) return a?.exactValueSelectable ? -1 : 1;
    const probA = pool ? effectProbability(pool, idA) : 0;
    const probB = pool ? effectProbability(pool, idB) : 0;
    if (probA !== probB) return probB - probA;
    return idA.localeCompare(idB);
  }

  const allIds = catalog.map((c) => c.effectId);
  const normalizedQuery = query.trim();
  const filteredIds = normalizedQuery ? allIds.filter((id) => effectLabel(id).includes(normalizedQuery)) : allIds;

  const groups = normalizedQuery
    ? [{ name: "検索結果", effectIds: [...filteredIds].sort(compareEntries) }]
    : groupEffectIdsByCategory(allIds).map((g) => ({ name: g.name, effectIds: [...g.effectIds].sort(compareEntries) }));

  const selectedEntry = selectedEffectId ? catalogById.get(selectedEffectId) : undefined;

  return (
    <div className="card">
      <h3 className="section-title">{title}</h3>

      <input
        type="text"
        className="effect-search-input"
        placeholder="日本語名で検索（例: 物理、劇毒）"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={`${title}の検索`}
      />

      <div className="effect-category-list">
        {groups.map((group) => (
          <div key={group.name} className="effect-category">
            <div className="effect-category__label">{group.name}</div>
            <div className="chip-row effect-category__chips">
              {group.effectIds.map((effectId) => {
                const entry = catalogById.get(effectId);
                if (!entry) return null;
                return (
                  <button
                    key={effectId}
                    type="button"
                    className={`chip ${selectedEffectId === effectId ? "chip--selected" : ""} ${!entry.exactValueSelectable ? "chip--muted" : ""}`}
                    aria-pressed={selectedEffectId === effectId}
                    title={entry.exactValueSelectable ? "数値検証済みの値あり" : "数値未検証（effectId一致のみで選択可）"}
                    onClick={() => onSelectEffect(effectId)}
                  >
                    {effectLabel(effectId)}
                    {!entry.exactValueSelectable && <span className="chip-badge">未検証</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.every((g) => g.effectIds.length === 0) && <p className="hint">該当する効果が見つかりません。</p>}
      </div>

      {selectedEffectId && (
        <div className="rank-section">
          <span className="rank-label">許容Value:</span>
          <RankMultiSelect
            dataset={dataset}
            slot={slot}
            effectId={selectedEffectId}
            catalogEntry={selectedEntry}
            fallbackRankTiers={fallbackRankTiers}
            selectedRanks={selectedRanks}
            onToggleRank={onToggleRank}
          />
        </div>
      )}
    </div>
  );
}
