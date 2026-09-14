import { useCallback, useEffect, useRef, useState } from "react";
import type { BloodGem, GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { isMatch, lookupDisplayValue } from "motsuyoku-sensor-core";
import * as historyStore from "../storage/simulationHistory";
import type { StoredDraw, StoredTarget } from "../storage/simulationHistory";

// Target(および敵/dataset)の内容が変わったかどうかを判定するための署名。
// 「異なるTargetのdrawを既存sessionへ混在させない」ための唯一の判定材料にする。
function targetSignature(datasetId: string, target: TargetBloodGem): string {
  return JSON.stringify({
    datasetId,
    shapes: [...target.acceptedShapes].sort(),
    primary: target.primaryEffectId,
    primaryRanks: [...target.acceptedPrimaryRanks].sort((a, b) => a - b),
    secondary: target.secondaryEffectId ?? null,
    secondaryRanks: target.acceptedSecondaryRanks ? [...target.acceptedSecondaryRanks].sort((a, b) => a - b) : null,
    curses: [...target.acceptedCurses].sort(),
  });
}

function toStoredTarget(target: TargetBloodGem): StoredTarget {
  return {
    shape: target.acceptedShapes,
    primary_effect_id: target.primaryEffectId,
    primary_allowed_ranks: target.acceptedPrimaryRanks,
    secondary_effect_id: target.secondaryEffectId ?? null,
    secondary_allowed_ranks: target.acceptedSecondaryRanks ?? null,
    accepted_curse_ids: target.acceptedCurses,
  };
}

function summarizeTarget(target: TargetBloodGem): string {
  const parts = [target.primaryEffectId];
  if (target.secondaryEffectId) parts.push(`2op:${target.secondaryEffectId}`);
  parts.push(`curse:${target.acceptedCurses.length}種`);
  return parts.join(" / ");
}

// ブラウザlocalStorageへの記録機能。保存処理自体はstorage/simulationHistory.tsに隔離し、
// このhookはReact向けの薄いオーケストレーション(いつ新sessionを作るか/表示用stateの更新)のみを担う。
export function useSimulationHistory(dataset: GemDataset, target: TargetBloodGem | null, theoreticalProbability: number | null) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTotalDraws, setSessionTotalDraws] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const signatureRef = useRef<string | null>(null);

  const targetSig = target ? targetSignature(dataset.datasetId, target) : null;

  // 敵またはTarget条件が変わったら、表示上のセッションをリセットする。
  // 実際にstorageへ新sessionを作るのは、次に「10連する」が押された時(recordBatch内)。
  useEffect(() => {
    if (targetSig !== signatureRef.current) {
      signatureRef.current = targetSig;
      setCurrentSessionId(null);
      setSessionTotalDraws(0);
    }
  }, [targetSig]);

  const recordBatch = useCallback(
    (gems: BloodGem[]) => {
      if (!target) return; // Target未設定時は記録しない(matched自体が定義できないため)

      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        const created = historyStore.createSession({
          sessionId,
          enemyId: dataset.enemy.enemyId,
          enemyDisplayName: dataset.enemy.displayName,
          datasetId: dataset.datasetId,
          target: toStoredTarget(target),
          targetSummary: summarizeTarget(target),
          theoreticalProbability,
        });
        if (!created.ok) {
          setLastError(created.error ?? "記録できませんでした");
          return;
        }
        setCurrentSessionId(sessionId);
      }

      const existing = historyStore.getSession(sessionId);
      const baseSeq = existing?.total_draws ?? 0;

      const storedDraws: StoredDraw[] = gems.map((gem, i) => {
        const primaryValue = lookupDisplayValue(dataset, "primary", gem.primaryEffectId, gem.primaryValueRank).value;
        const secondaryValue =
          gem.secondaryEffectId !== null && gem.secondaryValueRank !== null
            ? lookupDisplayValue(dataset, "secondary", gem.secondaryEffectId, gem.secondaryValueRank).value
            : null;
        return {
          sequence_number: baseSeq + i + 1,
          shape: gem.shapeId,
          primary_effect_id: gem.primaryEffectId,
          primary_rank: gem.primaryValueRank,
          primary_value: primaryValue,
          secondary_effect_id: gem.secondaryEffectId,
          secondary_rank: gem.secondaryValueRank,
          secondary_value: secondaryValue,
          curse_id: gem.curseId,
          matched: isMatch(gem, target), // TargetMatcherの結果をそのまま保存(再計算しない)
        };
      });

      const appended = historyStore.appendDraws(sessionId, storedDraws);
      if (!appended.ok) {
        setLastError(appended.error ?? "記録できませんでした");
        return;
      }
      setLastError(null);
      setSessionTotalDraws(baseSeq + storedDraws.length);
    },
    [dataset, target, theoreticalProbability, currentSessionId]
  );

  const clearHistory = useCallback((): StorageResultLike => {
    const result = historyStore.deleteAllHistory();
    if (result.ok) {
      setCurrentSessionId(null);
      setSessionTotalDraws(0);
    }
    return result;
  }, []);

  return {
    sessionTotalDraws,
    lastError,
    recordBatch,
    clearHistory,
    listSessionSummaries: historyStore.listSessionSummaries,
  };
}

type StorageResultLike = { ok: boolean; error?: string };
