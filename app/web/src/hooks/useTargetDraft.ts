import { useEffect, useMemo, useState } from "react";
import type { CursePoolEntry, GemDataset, ResearchTargetCatalogEntry, TargetBloodGem } from "motsuyoku-sensor-core";
import { getEligibleCurses, getResearchTargetCatalog } from "motsuyoku-sensor-core";

// 「Target設定の整合性」: enemy/primary/secondary effectを変更した際に、
// 以前の選択肢に由来する無効な値をstateに残さないための一元管理フック。
// 確率計算・排他ロジック自体はここでは一切行わず、常にCoreの
// getResearchTargetCatalog / getEligibleCurses を再取得して従うだけ。
//
// 値(Rank)選択の方針(女幽霊2opの指示を一般化したルール):
//   - Coreカタログ上 exactValueSelectable な効果 → 利用可能な確定値(confirmedRanks)の中から
//     複数選択できる。利用可能な値が1つしかなければ自動的にそれだけを選択する。
//   - exactValueSelectable でない効果 → 具体的な数値がまだ確定していないため、
//     rankTiers全体を「rank不問(effectId一致のみ)」として自動的に採用する(仕様書7.1節)。

interface TargetDraft {
  acceptedShapes: string[];
  primaryEffectId: string | null;
  acceptedPrimaryRanks: number[];
  secondaryEffectId: string | null;
  acceptedSecondaryRanks: number[];
  acceptedCurses: string[];
}

function emptyDraft(dataset: GemDataset): TargetDraft {
  return {
    acceptedShapes: [],
    primaryEffectId: null,
    acceptedPrimaryRanks: [],
    secondaryEffectId: dataset.enemy.secondarySlot === "fixed" ? dataset.enemy.fixedSecondaryEffectId ?? null : null,
    acceptedSecondaryRanks: [],
    acceptedCurses: [],
  };
}

function defaultRanksFor(entry: ResearchTargetCatalogEntry | undefined, fallbackRankTiers: number[]): number[] {
  if (entry?.exactValueSelectable) {
    return entry.confirmedRanks.map((r) => r.rank);
  }
  return [...fallbackRankTiers];
}

export function useTargetDraft(dataset: GemDataset) {
  const [draft, setDraft] = useState<TargetDraft>(() => emptyDraft(dataset));

  // enemy(dataset)が変わったら、Targetを丸ごと作り直す。
  useEffect(() => {
    setDraft(emptyDraft(dataset));
  }, [dataset]);

  const primaryCatalog = useMemo(() => getResearchTargetCatalog(dataset, "primary"), [dataset]);
  const secondaryCatalog = useMemo(() => getResearchTargetCatalog(dataset, "secondary"), [dataset]);

  // primary effectが変わったら、対応する既定rankを再取得。
  // 併せて、selectableなsecondaryがprimaryと同じeffectId(=不成立の組み合わせ)になっていれば解除する。
  useEffect(() => {
    if (!draft.primaryEffectId) {
      if (draft.acceptedPrimaryRanks.length > 0) {
        setDraft((d) => ({ ...d, acceptedPrimaryRanks: [] }));
      }
      return;
    }
    const entry = primaryCatalog.find((c) => c.effectId === draft.primaryEffectId);
    const nextRanks = defaultRanksFor(entry, dataset.primaryRankTiers);
    setDraft((d) => {
      const needsSecondaryClear =
        dataset.enemy.secondarySlot === "selectable" && !dataset.enemy.allowDuplicateSecondary && d.secondaryEffectId === d.primaryEffectId;
      return {
        ...d,
        acceptedPrimaryRanks: nextRanks,
        secondaryEffectId: needsSecondaryClear ? null : d.secondaryEffectId,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.primaryEffectId, dataset]);

  // secondary effectが変わったら、対応する既定rankを再取得(fixedスロットも含む)。
  useEffect(() => {
    if (dataset.enemy.secondarySlot === "none") return;
    if (!draft.secondaryEffectId) {
      if (draft.acceptedSecondaryRanks.length > 0) {
        setDraft((d) => ({ ...d, acceptedSecondaryRanks: [] }));
      }
      return;
    }
    const entry = secondaryCatalog.find((c) => c.effectId === draft.secondaryEffectId);
    const nextRanks = defaultRanksFor(entry, dataset.secondaryRankTiers ?? []);
    setDraft((d) => ({ ...d, acceptedSecondaryRanks: nextRanks }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.secondaryEffectId, dataset]);

  // 呪いの排他(Coreの既存ロジックをそのまま利用): primary/secondaryの組み合わせから
  // 成立しないcurseを除外し、選択済みcurseが不適格になった場合は自動解除する。
  const eligibleCurses: CursePoolEntry[] = useMemo(() => {
    if (!draft.primaryEffectId) return [];
    const secondaryForCurses = dataset.enemy.secondarySlot === "fixed" ? dataset.enemy.fixedSecondaryEffectId : draft.secondaryEffectId ?? undefined;
    return getEligibleCurses(dataset, draft.primaryEffectId, secondaryForCurses);
  }, [dataset, draft.primaryEffectId, draft.secondaryEffectId]);

  useEffect(() => {
    const eligibleIds = new Set(eligibleCurses.map((c) => c.curseId));
    setDraft((d) => {
      const pruned = d.acceptedCurses.filter((id) => eligibleIds.has(id));
      if (pruned.length === d.acceptedCurses.length) return d;
      return { ...d, acceptedCurses: pruned };
    });
  }, [eligibleCurses]);

  // selectable secondaryのカタログから、primaryと同一effectId(不成立の組み合わせ)を除外して提示する。
  const secondaryCatalogForUi = useMemo(() => {
    if (dataset.enemy.secondarySlot !== "selectable" || dataset.enemy.allowDuplicateSecondary) return secondaryCatalog;
    return secondaryCatalog.filter((c) => c.effectId !== draft.primaryEffectId);
  }, [secondaryCatalog, dataset.enemy, draft.primaryEffectId]);

  function toggleShape(shapeId: string) {
    setDraft((d) => ({
      ...d,
      acceptedShapes: d.acceptedShapes.includes(shapeId) ? d.acceptedShapes.filter((s) => s !== shapeId) : [...d.acceptedShapes, shapeId],
    }));
  }

  function setAllShapes(shapeIds: string[]) {
    setDraft((d) => ({ ...d, acceptedShapes: shapeIds }));
  }

  function setPrimaryEffect(effectId: string | null) {
    setDraft((d) => ({ ...d, primaryEffectId: effectId }));
  }

  function togglePrimaryRank(rank: number) {
    setDraft((d) => ({
      ...d,
      acceptedPrimaryRanks: d.acceptedPrimaryRanks.includes(rank) ? d.acceptedPrimaryRanks.filter((r) => r !== rank) : [...d.acceptedPrimaryRanks, rank],
    }));
  }

  function setSecondaryEffect(effectId: string | null) {
    setDraft((d) => ({ ...d, secondaryEffectId: effectId }));
  }

  function toggleSecondaryRank(rank: number) {
    setDraft((d) => ({
      ...d,
      acceptedSecondaryRanks: d.acceptedSecondaryRanks.includes(rank)
        ? d.acceptedSecondaryRanks.filter((r) => r !== rank)
        : [...d.acceptedSecondaryRanks, rank],
    }));
  }

  function toggleCurse(curseId: string) {
    setDraft((d) => ({
      ...d,
      acceptedCurses: d.acceptedCurses.includes(curseId) ? d.acceptedCurses.filter((c) => c !== curseId) : [...d.acceptedCurses, curseId],
    }));
  }

  function setAllCurses(curseIds: string[]) {
    setDraft((d) => ({ ...d, acceptedCurses: curseIds }));
  }

  const target: TargetBloodGem | null = useMemo(() => {
    if (draft.acceptedShapes.length === 0) return null;
    if (!draft.primaryEffectId || draft.acceptedPrimaryRanks.length === 0) return null;
    if (draft.acceptedCurses.length === 0) return null;
    if (dataset.enemy.secondarySlot !== "none") {
      if (!draft.secondaryEffectId || draft.acceptedSecondaryRanks.length === 0) return null;
    }
    const base: TargetBloodGem = {
      datasetId: dataset.datasetId,
      acceptedShapes: draft.acceptedShapes,
      primaryEffectId: draft.primaryEffectId,
      acceptedPrimaryRanks: draft.acceptedPrimaryRanks,
      acceptedCurses: draft.acceptedCurses,
    };
    if (dataset.enemy.secondarySlot !== "none") {
      base.secondaryEffectId = draft.secondaryEffectId!;
      base.acceptedSecondaryRanks = draft.acceptedSecondaryRanks;
    }
    return base;
  }, [dataset, draft]);

  return {
    draft,
    primaryCatalog,
    secondaryCatalog: secondaryCatalogForUi,
    eligibleCurses,
    target,
    toggleShape,
    setAllShapes,
    setPrimaryEffect,
    togglePrimaryRank,
    setSecondaryEffect,
    toggleSecondaryRank,
    toggleCurse,
    setAllCurses,
  };
}
