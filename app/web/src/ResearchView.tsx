import { useEffect, useState } from "react";
import type { GemDataset } from "motsuyoku-sensor-core";
import { useTargetDraft } from "./hooks/useTargetDraft";
import { useResearchSession } from "./hooks/useResearchSession";
import * as researchStore from "./storage/researchHistory";
import { EnemyTabs } from "./components/EnemyTabs";
import { ShapePicker } from "./components/ShapePicker";
import { EffectSlotEditor } from "./components/EffectSlotEditor";
import { FixedSecondaryEditor } from "./components/FixedSecondaryEditor";
import { CursePicker } from "./components/CursePicker";
import { ScoreSelector } from "./components/ScoreSelector";
import { ActiveExperimentBanner } from "./components/ActiveExperimentBanner";
import { RunningExperimentView } from "./components/RunningExperimentView";
import { SurveyForm } from "./components/SurveyForm";
import { ResearchResults } from "./components/ResearchResults";
import { ResearchStatusBar } from "./components/ResearchStatusBar";
import { ResearchHistoryPanel } from "./components/ResearchHistoryPanel";

interface Props {
  datasets: GemDataset[];
  dataset: GemDataset;
  onSelectDataset: (dataset: GemDataset) => void;
}

type LocalStep = "target-setup" | "desire-score";

// 研究モード。experiment_ui_flow_spec.md 3章のフローを、既存のTarget設定UI部品と
// Core(app/core/src/state/researchModeState.js)のExperiment Flowを使って実装する。
export function ResearchView({ datasets, dataset, onSelectDataset }: Props) {
  const [localStep, setLocalStep] = useState<LocalStep>("target-setup");
  const [desireScore, setDesireScore] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
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

  const session = useResearchSession();

  // 研究モードに入り直したら、まだLOCKしていない限りTarget設定からやり直す。
  useEffect(() => {
    setLocalStep("target-setup");
    setDesireScore(null);
  }, [dataset]);

  const eligibleCurseIds = new Set(eligibleCurses.map((c) => c.curseId));

  function handleStartExperiment() {
    if (!target || desireScore === null) return;
    session.startExperiment(dataset, target, desireScore);
  }

  function handleStartNew() {
    session.reset();
    setLocalStep("target-setup");
    setDesireScore(null);
  }

  // --- reload直後: 前回の未完了実験がある場合 ---
  if (session.resumeSnapshot) {
    return (
      <>
        <EnemyTabs datasets={datasets} current={dataset} onSelect={onSelectDataset} />
        <main className="app-layout app-layout--single">
          <ActiveExperimentBanner snapshot={session.resumeSnapshot} onResume={session.resumeExperiment} onDiscard={session.discardResume} />
        </main>
      </>
    );
  }

  // --- 実験中/アンケート中/結果画面: Targetは変更不可 ---
  if (session.uiPhase !== "idle") {
    return (
      <>
        <EnemyTabs datasets={datasets} current={dataset} onSelect={onSelectDataset} />
        <main className="app-layout app-layout--single">
          <ResearchStatusBar phase={session.uiPhase} rollCount={session.rollCount} onOpenHistory={() => setHistoryOpen(true)} />

          {session.saveError && (
            <div className="blocker-box">
              <strong>記録できませんでした:</strong> {session.saveError}
            </div>
          )}

          {(session.uiPhase === "running" || session.uiPhase === "awaiting_survey") && (
            <RunningExperimentView
              dataset={dataset}
              rollCount={session.rollCount}
              elapsedMs={session.elapsedMs}
              isRevealing={session.isRevealing}
              currentBatchRevealed={session.currentBatchRevealed}
              onRevealBatch={session.revealBatch}
              onGiveUp={session.giveUp}
              resumedRollCountReset={session.resumedRollCountReset}
            />
          )}

          {session.uiPhase === "awaiting_survey" && <SurveyForm onSubmit={session.submitSurvey} />}

          {session.uiPhase === "revealed" && session.finalRecord && session.finalProbability && (
            <ResearchResults record={session.finalRecord} probability={session.finalProbability} onStartNew={handleStartNew} />
          )}
        </main>

        <ResearchHistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          listExperiments={researchStore.listExperiments}
          exportJSON={researchStore.exportExperimentsAsJSON}
          exportCSV={researchStore.exportExperimentsAsCSV}
          onDeleteAll={researchStore.deleteAllExperiments}
        />
      </>
    );
  }

  // --- Target設定 → 欲しさ評価 (LOCK前) ---
  return (
    <>
      <EnemyTabs datasets={datasets} current={dataset} onSelect={onSelectDataset} />

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
          <ResearchStatusBar phase="idle" rollCount={0} onOpenHistory={() => setHistoryOpen(true)} />

          <div className="card">
            <h3 className="section-title">狙う血晶（Target Blood Gem）</h3>
            {target ? (
              <p className="hint">Targetが設定されました。下へ進んでください。</p>
            ) : (
              <p className="hint">左側でTarget（形状・1op・2op・許容デメリット）をすべて設定してください。</p>
            )}
          </div>

          {target && localStep === "target-setup" && (
            <div className="card">
              <button type="button" className="primary-button" onClick={() => setLocalStep("desire-score")}>
                次へ（欲しさ評価）
              </button>
            </div>
          )}

          {target && localStep === "desire-score" && (
            <div className="card">
              <h3 className="section-title">この血晶をどのくらい欲しいですか？</h3>
              <ScoreSelector value={desireScore} onChange={setDesireScore} lowLabel="特に欲しくない" highLabel="絶対に欲しい" />
              <button type="button" className="primary-button" disabled={desireScore === null} onClick={handleStartExperiment}>
                実験を開始
              </button>
              <p className="hint">「実験を開始」を押すとTargetが確定し、以後変更できなくなります。</p>
            </div>
          )}
        </section>
      </main>

      <ResearchHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        listExperiments={researchStore.listExperiments}
        exportJSON={researchStore.exportExperimentsAsJSON}
        exportCSV={researchStore.exportExperimentsAsCSV}
        onDeleteAll={researchStore.deleteAllExperiments}
      />
    </>
  );
}
