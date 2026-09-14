import { useEffect, useMemo, useState } from "react";
import type { BloodGem, GemDataset } from "motsuyoku-sensor-core";
import { EvilSpiritDataset, MadmanDataset, WatchersDataset, draw } from "motsuyoku-sensor-core";
import { useTargetDraft } from "./hooks/useTargetDraft";
import { useSimulationHistory } from "./hooks/useSimulationHistory";
import { safeComputeProbability } from "./lib/probability";
import { EnemyTabs } from "./components/EnemyTabs";
import { ShapePicker } from "./components/ShapePicker";
import { EffectSlotEditor } from "./components/EffectSlotEditor";
import { FixedSecondaryEditor } from "./components/FixedSecondaryEditor";
import { CursePicker } from "./components/CursePicker";
import { ProbabilityPanel } from "./components/ProbabilityPanel";
import { DrawResultsGrid } from "./components/DrawResultsGrid";
import { RecordingStatusBar } from "./components/RecordingStatusBar";
import { HistoryPanel } from "./components/HistoryPanel";

const DATASETS: GemDataset[] = [WatchersDataset, MadmanDataset, EvilSpiritDataset];

export default function App() {
  const [dataset, setDataset] = useState<GemDataset>(WatchersDataset);
  const [pullGems, setPullGems] = useState<BloodGem[]>([]);
  const [pullBatchCount, setPullBatchCount] = useState(0);
  const [pullError, setPullError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const {
    draft,
    primaryCatalog,
    secondaryCatalog,
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
  } = useTargetDraft(dataset);

  const probabilityOutcome = useMemo(() => safeComputeProbability(dataset, target), [dataset, target]);
  const theoreticalProbability = probabilityOutcome.status === "ok" ? probabilityOutcome.result.p : null;

  const { sessionTotalDraws, lastError: recordingError, recordBatch, clearHistory, listSessionSummaries } = useSimulationHistory(
    dataset,
    target,
    theoreticalProbability
  );

  // 敵を切り替えたら、10連結果もリセットする(別データセットの結果を混在させない)。
  useEffect(() => {
    setPullGems([]);
    setPullBatchCount(0);
    setPullError(null);
  }, [dataset]);

  function handlePull() {
    try {
      const gems = draw(dataset, 10);
      setPullGems(gems);
      setPullBatchCount((c) => c + 1);
      setPullError(null);
      recordBatch(gems); // localStorageへ記録(storage/simulationHistory.ts経由。Target未設定時は内部で何もしない)
    } catch (err) {
      setPullError(err instanceof Error ? err.message : String(err));
    }
  }

  const eligibleCurseIds = new Set(eligibleCurses.map((c) => c.curseId));

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>物欲センサー シミュレーター</h1>
        <p className="app-subtitle">シミュレーターモード MVP（DrawEngine / ProbabilityEngine / TargetMatcher は app/core に委譲）</p>
      </header>

      <EnemyTabs datasets={DATASETS} current={dataset} onSelect={setDataset} />

      <main className="app-layout">
        <section className="app-layout__left">
          <ShapePicker dataset={dataset} selected={draft.acceptedShapes} onToggle={toggleShape} onSetAll={setAllShapes} />

          <EffectSlotEditor
            dataset={dataset}
            slot="primary"
            title="1op（Primary Effect）"
            catalog={primaryCatalog}
            selectedEffectId={draft.primaryEffectId}
            onSelectEffect={setPrimaryEffect}
            selectedRanks={draft.acceptedPrimaryRanks}
            onToggleRank={togglePrimaryRank}
            fallbackRankTiers={dataset.primaryRankTiers}
          />

          {dataset.enemy.secondarySlot === "selectable" && (
            <EffectSlotEditor
              dataset={dataset}
              slot="secondary"
              title="2op（Secondary Effect）"
              catalog={secondaryCatalog}
              selectedEffectId={draft.secondaryEffectId}
              onSelectEffect={setSecondaryEffect}
              selectedRanks={draft.acceptedSecondaryRanks}
              onToggleRank={toggleSecondaryRank}
              fallbackRankTiers={dataset.secondaryRankTiers ?? []}
            />
          )}

          {dataset.enemy.secondarySlot === "fixed" && draft.secondaryEffectId && (
            <FixedSecondaryEditor
              dataset={dataset}
              effectId={draft.secondaryEffectId}
              catalogEntry={secondaryCatalog.find((c) => c.effectId === draft.secondaryEffectId)}
              selectedRanks={draft.acceptedSecondaryRanks}
              onToggleRank={toggleSecondaryRank}
              fallbackRankTiers={dataset.secondaryRankTiers ?? []}
            />
          )}

          <CursePicker
            allCurses={dataset.cursePool.entries}
            eligibleCurseIds={eligibleCurseIds}
            primarySelected={!!draft.primaryEffectId}
            selected={draft.acceptedCurses}
            onToggle={toggleCurse}
            onSetAll={setAllCurses}
          />
        </section>

        <section className="app-layout__right">
          <RecordingStatusBar sessionTotalDraws={sessionTotalDraws} lastError={recordingError} onOpenHistory={() => setHistoryOpen(true)} />

          <ProbabilityPanel dataset={dataset} target={target} />

          <div className="card pull-controls">
            <button type="button" className="primary-button" onClick={handlePull}>
              10連する
            </button>
            <span className="hint">このセッションでの実行回数: {pullBatchCount}</span>
            {pullError && (
              <div className="blocker-box">
                <strong>BLOCKER:</strong> {pullError}
              </div>
            )}
          </div>

          <DrawResultsGrid dataset={dataset} gems={pullGems} target={target} />
        </section>
      </main>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        listSessionSummaries={listSessionSummaries}
        onDeleteAll={clearHistory}
      />
    </div>
  );
}
