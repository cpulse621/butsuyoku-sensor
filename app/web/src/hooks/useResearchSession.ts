import { useCallback, useEffect, useRef, useState } from "react";
import type { BloodGem, GemDataset, ProbabilityResult, TargetBloodGem } from "motsuyoku-sensor-core";
import { GemDatasets, ResearchModePhases, createDefaultRng, createResearchModeSession } from "motsuyoku-sensor-core";
import * as researchStore from "../storage/researchHistory";
import type { ActiveExperimentSnapshot, ResearchExperiment } from "../storage/researchHistory";
import { toStoredTarget, storedTargetToTarget } from "../lib/targetSummary";
import { submitExperiment } from "../services/researchSubmission";

// app/core/package.json のバージョンをそのまま研究ログのengine_versionとして使う
// (Coreは変更していないため、ここは既知の実値であり創作ではない)。
const ENGINE_VERSION = "motsuyoku-sensor-core@0.1.0";

export type UiPhase = "idle" | "running" | "awaiting_survey" | "revealed";

export interface RevealedEntry {
  gem: BloodGem;
  rollCount: number;
  matched: boolean;
}

export interface SurveyAnswers {
  tediousnessScore: 1 | 2 | 3 | 4 | 5;
  painIfRepeatedScore: 1 | 2 | 3 | 4 | 5;
  sensorScore: 1 | 2 | 3 | 4 | 5;
}

type CoreSession = ReturnType<typeof createResearchModeSession>;

// 研究モードのExperiment Flow(画面遷移・累計roll_count・survey gating)は、
// Core(app/core/src/state/researchModeState.js)がすでに実装済みのため、それをそのまま使う。
// このhookはCoreセッションのReact向けラッパーと、実験結果のlocalStorage保存(researchHistory.ts)
// ・reload復旧(active experiment)のオーケストレーションのみを担当する。
export function useResearchSession() {
  const [uiPhase, setUiPhase] = useState<UiPhase>("idle");
  const [rollCount, setRollCount] = useState(0);
  const [currentBatchRevealed, setCurrentBatchRevealed] = useState<RevealedEntry[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finalRecord, setFinalRecord] = useState<ResearchExperiment | null>(null);
  const [finalProbability, setFinalProbability] = useState<ProbabilityResult | null>(null);
  const [resumedRollCountReset, setResumedRollCountReset] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const [resumeSnapshot] = useState<ActiveExperimentSnapshot | null>(() => researchStore.loadActiveExperiment());
  const [resumeHandled, setResumeHandled] = useState(false);

  const sessionRef = useRef<CoreSession | null>(null);
  const metaRef = useRef<{
    experimentId: string;
    participantId: string;
    dataset: GemDataset;
    target: TargetBloodGem;
    startedAtMs: number;
    batchCount: number;
  } | null>(null);

  // 実験中は「経過時間」表示のために1秒ごとに再計算する。
  useEffect(() => {
    if (uiPhase !== "running") return;
    const id = window.setInterval(() => {
      if (metaRef.current) setElapsedMs(Date.now() - metaRef.current.startedAtMs);
    }, 1000);
    return () => window.clearInterval(id);
  }, [uiPhase]);

  function beginSession(dataset: GemDataset, target: TargetBloodGem, desireScore: 1 | 2 | 3 | 4 | 5, experimentId: string, participantId: string, startedAtMs: number, resumed: boolean) {
    const session = createResearchModeSession({ dataset, target, desireScore, rng: createDefaultRng() });
    session.start();
    sessionRef.current = session;
    metaRef.current = { experimentId, participantId, dataset, target, startedAtMs, batchCount: 0 };

    researchStore.saveActiveExperiment({
      experiment_id: experimentId,
      participant_id: participantId,
      started_at: new Date(startedAtMs).toISOString(),
      dataset_id: dataset.datasetId,
      enemy_id: dataset.enemy.enemyId,
      enemy_display_name: dataset.enemy.displayName,
      target: toStoredTarget(target),
      desire_score: desireScore,
    });

    setResumedRollCountReset(resumed);
    setRollCount(0);
    setCurrentBatchRevealed([]);
    setElapsedMs(0);
    setSaveError(null);
    setUiPhase("running");
  }

  const startExperiment = useCallback((dataset: GemDataset, target: TargetBloodGem, desireScore: 1 | 2 | 3 | 4 | 5) => {
    const experimentId = crypto.randomUUID();
    const participantId = researchStore.getOrCreateParticipantId();
    beginSession(dataset, target, desireScore, experimentId, participantId, Date.now(), false);
  }, []);

  // reload後、activeExperimentスナップショットから再開する。
  // Coreセッションの内部状態(乱数消費位置等)はシリアライズできないため、新しいCoreセッションを
  // 作り直す形になる(roll_countは0から)。この制約はUI側に必ず明示する(resumedRollCountReset)。
  const resumeExperiment = useCallback(() => {
    if (!resumeSnapshot) return;
    const dataset = GemDatasets[resumeSnapshot.dataset_id];
    if (!dataset) {
      // 未知のdataset_id(壊れたデータ)は復旧不能として破棄する。
      researchStore.clearActiveExperiment();
      setResumeHandled(true);
      return;
    }
    const target = storedTargetToTarget(dataset.datasetId, resumeSnapshot.target);
    beginSession(
      dataset,
      target,
      resumeSnapshot.desire_score,
      resumeSnapshot.experiment_id,
      resumeSnapshot.participant_id,
      new Date(resumeSnapshot.started_at).getTime(),
      true
    );
    setResumeHandled(true);
  }, [resumeSnapshot]);

  const discardResume = useCallback(() => {
    researchStore.clearActiveExperiment();
    setResumeHandled(true);
  }, []);

  // 「10回抽選」: Core側は内部で10件生成し、最初のMATCHを見つけた位置で以降を開示しない。
  // 表示は1件ずつテンポよく進める。
  const revealBatch = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.phase !== ResearchModePhases.RUNNING) return;
    if (metaRef.current) metaRef.current.batchCount += 1;

    setIsRevealing(true);
    setCurrentBatchRevealed([]);
    const revealedThisBatch: RevealedEntry[] = [];

    for (let i = 0; i < 10; i++) {
      if (session.phase !== ResearchModePhases.RUNNING) break;
      const { gem, rollCount: newRollCount, matched } = session.revealNext();
      const entry: RevealedEntry = { gem, rollCount: newRollCount, matched };
      revealedThisBatch.push(entry);
      setCurrentBatchRevealed([...revealedThisBatch]);
      setRollCount(newRollCount);
      if (matched) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    setIsRevealing(false);
    const phaseAfterBatch: string = session.phase;
    if (phaseAfterBatch === ResearchModePhases.AWAITING_SURVEY) {
      setUiPhase("awaiting_survey");
    }
  }, []);

  function finalize(session: CoreSession) {
    const summary = session.getSummary();
    const meta = metaRef.current;
    if (!meta) return;

    const probability = session.getTheoreticalProbability(); // REVEALED到達後のみ呼べる(Core側でgate済み)
    setFinalProbability(probability);

    const finishedAtMs = summary.finishedAt ?? Date.now();
    const record: ResearchExperiment = {
      experiment_id: meta.experimentId,
      participant_id: meta.participantId,
      started_at: new Date(summary.startedAt ?? meta.startedAtMs).toISOString(),
      finished_at: new Date(finishedAtMs).toISOString(),
      duration_ms: finishedAtMs - (summary.startedAt ?? meta.startedAtMs),
      dataset_id: meta.dataset.datasetId,
      enemy_id: meta.dataset.enemy.enemyId,
      enemy_display_name: meta.dataset.enemy.displayName,
      target: toStoredTarget(meta.target),
      desire_score: summary.desireScore,
      success: summary.matched,
      censored: summary.censored,
      roll_count: summary.matched ? summary.rollCount : null,
      cutoff_draws: summary.censored ? summary.rollCount : null,
      batch_count: meta.batchCount,
      theoretical_probability: probability.p,
      expected_draws: Number.isFinite(probability.approxOneInN) ? probability.approxOneInN : null,
      tedious_score: summary.survey?.tediousnessScore ?? null,
      real_game_burden_score: summary.survey?.painIfRepeatedScore ?? null,
      sensor_score: summary.survey?.sensorScore ?? null,
      engine_version: ENGINE_VERSION,
      data_version: meta.dataset.dataVersion,
      submission_status: "local_only",
    };

    const saved = researchStore.addExperiment(record);
    if (!saved.ok) {
      setSaveError(saved.error ?? "記録できませんでした");
    } else {
      setSaveError(null);
    }
    researchStore.clearActiveExperiment();
    setFinalRecord(record);
    setUiPhase("revealed");

    // Google Sheets等の送信先が設定されていない限り、常にlocal_onlyのまま(ネットワークアクセスなし)。
    void submitExperiment(record).then((outcome) => {
      if (outcome.status !== "local_only") {
        researchStore.updateExperimentSubmissionStatus(record.experiment_id, outcome.status);
        setFinalRecord((prev) => (prev && prev.experiment_id === record.experiment_id ? { ...prev, submission_status: outcome.status } : prev));
      }
    });
  }

  const submitSurvey = useCallback((answers: SurveyAnswers) => {
    const session = sessionRef.current;
    if (!session || session.phase !== ResearchModePhases.AWAITING_SURVEY) return;
    session.submitSurvey(answers);
    finalize(session);
  }, []);

  const giveUp = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.phase !== ResearchModePhases.RUNNING) return;
    session.giveUp();
    finalize(session);
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    metaRef.current = null;
    setUiPhase("idle");
    setRollCount(0);
    setCurrentBatchRevealed([]);
    setFinalRecord(null);
    setFinalProbability(null);
    setResumedRollCountReset(false);
    setElapsedMs(0);
  }, []);

  return {
    // reload復旧
    resumeSnapshot: resumeHandled ? null : resumeSnapshot,
    resumeExperiment,
    discardResume,

    // 実験フロー
    uiPhase,
    rollCount,
    currentBatchRevealed,
    isRevealing,
    elapsedMs,
    resumedRollCountReset,
    startExperiment,
    revealBatch,
    giveUp,
    submitSurvey,
    reset,

    // 結果
    finalRecord,
    finalProbability,
    saveError,
  };
}
