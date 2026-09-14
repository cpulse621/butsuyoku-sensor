import { useCallback, useEffect, useRef, useState } from "react";
import type { BloodGem, GemDataset, TargetBloodGem } from "motsuyoku-sensor-core";
import { isMatch } from "motsuyoku-sensor-core";
import * as historyStore from "../storage/simulationHistory";
import { toStoredTarget, summarizeTarget } from "../lib/targetSummary";

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

// ブラウザlocalStorageへの記録機能。保存処理自体はstorage/simulationHistory.tsに隔離し、
// このhookはReact向けの薄いオーケストレーション(いつ新sessionを作るか/表示用stateの更新)のみを担う。
// 個々のdraw結果はここでは保存しない(session要約のみをstorageへ渡す)。
export function useSimulationHistory(dataset: GemDataset, target: TargetBloodGem | null, theoreticalProbability: number | null) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTotalDraws, setSessionTotalDraws] = useState(0);
  const [sessionMatchCount, setSessionMatchCount] = useState(0);
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
      setSessionMatchCount(0);
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

      const matchCount = gems.filter((gem) => isMatch(gem, target)).length; // TargetMatcherの結果をそのまま集計(再計算しない)
      const result = historyStore.recordBatchSummary(sessionId, gems.length, matchCount);
      if (!result.ok) {
        setLastError(result.error ?? "記録できませんでした");
        return;
      }
      setLastError(null);
      setSessionTotalDraws((n) => n + gems.length);
      setSessionMatchCount((n) => n + matchCount);
    },
    [dataset, target, theoreticalProbability, currentSessionId]
  );

  const clearHistory = useCallback((): StorageResultLike => {
    const result = historyStore.deleteAllHistory();
    if (result.ok) {
      setCurrentSessionId(null);
      setSessionTotalDraws(0);
      setSessionMatchCount(0);
    }
    return result;
  }, []);

  return {
    sessionTotalDraws,
    sessionMatchCount,
    lastError,
    recordBatch,
    clearHistory,
    listSessions: historyStore.listSessions,
    exportJSON: historyStore.exportSessionsAsJSON,
    exportCSV: historyStore.exportSessionsAsCSV,
  };
}

type StorageResultLike = { ok: boolean; error?: string };
