import { useCallback, useEffect, useRef, useState } from "react";
import type { BloodGem, GemDataset, ProbabilityResult, TargetBloodGem } from "motsuyoku-sensor-core";
import { GemDatasets, ResearchModePhases, createDefaultRng, createResearchModeSession } from "motsuyoku-sensor-core";
import * as researchStore from "../storage/researchHistory";
import type { ActiveExperimentSnapshot, DrawAdvanceMode, ExitReason, ResearchExperiment } from "../storage/researchHistory";
import { toStoredTarget, storedTargetToTarget } from "../lib/targetSummary";
import { attemptSubmission, isSubmissionConfigured } from "../services/researchSubmission";

// app/core/package.json のバージョンをそのまま研究ログのengine_versionとして使う
// (Coreは変更していないため、ここは既知の実値であり創作ではない)。
const ENGINE_VERSION = "motsuyoku-sensor-core@0.1.0";

// auto条件での固定間隔。研究中はUIから変更できない(指示: 速度変更は研究中には不可)。
export const AUTO_INTERVAL_MS = 10000;

export type UiPhase = "idle" | "running" | "awaiting_survey" | "awaiting_exit_reason" | "revealed";

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
// ・reload復旧(active experiment)・manual/auto進行・途中終了時アンケートのオーケストレーションを担当する。
//
// 途中終了(give up)時もCoreの giveUp() を「即座には」呼ばない点に注意:
// Coreの giveUp() は RUNNING → REVEALED (survey無し) へ直接遷移する設計だが、
// 今回の要件では途中終了時も必ず事後アンケート(+退出理由)を経由させる必要がある。
// Coreを変更する代わりに、Web側で「giveUpボタン押下 → 自前でawaiting_survey相当のUIへ遷移
// → アンケート回答 → 退出理由 → その時点で初めてCoreのgiveUp()を呼ぶ」という順序に組み替えている。
// giveUp()を呼ぶまでの間はCore側のphaseはRUNNINGのままだが、revealBatch/自動進行はどちらも
// 独自のuiPhaseガードで停止するため、Coreの抽選が余分に進むことはない。
export function useResearchSession() {
  const [uiPhase, setUiPhase] = useState<UiPhase>("idle");
  const [rollCount, setRollCount] = useState(0);
  const [currentBatchRevealed, setCurrentBatchRevealed] = useState<RevealedEntry[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finalRecord, setFinalRecord] = useState<ResearchExperiment | null>(null);
  const finalRecordRef = useRef<ResearchExperiment | null>(null);
  useEffect(() => {
    finalRecordRef.current = finalRecord;
  }, [finalRecord]);
  const [finalProbability, setFinalProbability] = useState<ProbabilityResult | null>(null);
  const [resumedProgressReset, setResumedProgressReset] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRetiring, setIsRetiring] = useState(false); // 途中終了操作中(survey/退出理由待ち)かどうか。UIでTarget再編集不可の判定等に使う。

  // manual/auto(研究条件)
  const [drawAdvanceMode, setDrawAdvanceMode] = useState<DrawAdvanceMode | null>(null);
  const [autoRemainingMs, setAutoRemainingMs] = useState(AUTO_INTERVAL_MS);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  // pauseCount/pausedDurationMsはUIへライブ表示しないため、stateではなくrefで持つ。
  // (finalize/giveUp/submitSurvey等はuseCallback([])で作られ、Reactのstateクロージャが
  //  古いままになるため、常に最新値を読めるrefを使う。)
  const pauseCountRef = useRef(0);
  const pausedDurationMsRef = useRef(0);

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
    drawAdvanceMode: DrawAdvanceMode;
  } | null>(null);
  const pendingGiveUpRef = useRef(false);
  const pendingSurveyAnswersRef = useRef<SurveyAnswers | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);

  // 実験中は「経過時間」表示のために1秒ごとに再計算する。
  useEffect(() => {
    if (uiPhase !== "running") return;
    const id = window.setInterval(() => {
      if (metaRef.current) setElapsedMs(Date.now() - metaRef.current.startedAtMs);
    }, 1000);
    return () => window.clearInterval(id);
  }, [uiPhase]);

  function beginSession(
    dataset: GemDataset,
    target: TargetBloodGem,
    desireScore: 1 | 2 | 3 | 4 | 5,
    experimentId: string,
    participantId: string,
    startedAtMs: number,
    mode: DrawAdvanceMode,
    resumed: boolean
  ) {
    const session = createResearchModeSession({ dataset, target, desireScore, rng: createDefaultRng() });
    session.start();
    sessionRef.current = session;
    metaRef.current = { experimentId, participantId, dataset, target, startedAtMs, batchCount: 0, drawAdvanceMode: mode };
    pendingGiveUpRef.current = false;
    pendingSurveyAnswersRef.current = null;
    pauseStartedAtRef.current = null;
    stopRequestedRef.current = false;

    researchStore.saveActiveExperiment({
      experiment_id: experimentId,
      participant_id: participantId,
      started_at: new Date(startedAtMs).toISOString(),
      dataset_id: dataset.datasetId,
      enemy_id: dataset.enemy.enemyId,
      enemy_display_name: dataset.enemy.displayName,
      target: toStoredTarget(target),
      desire_score: desireScore,
      draw_advance_mode: mode,
      auto_interval_ms: mode === "auto" ? AUTO_INTERVAL_MS : null,
    });

    setDrawAdvanceMode(mode);
    setAutoRemainingMs(AUTO_INTERVAL_MS);
    setIsAutoPaused(false);
    pauseCountRef.current = 0;
    pausedDurationMsRef.current = 0;
    setResumedProgressReset(resumed);
    setRollCount(0);
    setCurrentBatchRevealed([]);
    setElapsedMs(0);
    setIsRetiring(false);
    setSaveError(null);
    setUiPhase("running");
  }

  const startExperiment = useCallback((dataset: GemDataset, target: TargetBloodGem, desireScore: 1 | 2 | 3 | 4 | 5) => {
    const experimentId = crypto.randomUUID();
    const participantId = researchStore.getOrCreateParticipantId();
    // 参加者には選択させず、実験開始時にランダムへ割り当てる(比較したい要因: 次の10連を自分でクリックするかどうか)。
    const mode: DrawAdvanceMode = Math.random() < 0.5 ? "manual" : "auto";
    beginSession(dataset, target, desireScore, experimentId, participantId, Date.now(), mode, false);
  }, []);

  // reload後、activeExperimentスナップショットから再開する。
  // Coreセッションの内部状態(乱数消費位置等)はシリアライズできないため、新しいCoreセッションを
  // 作り直す形になる(roll_count・経過時間・一時停止回数は0から)。draw_advance_modeは
  // 元の割り当てをそのまま引き継ぐ(再度ランダム化はしない)。
  const resumeExperiment = useCallback(() => {
    if (!resumeSnapshot) return;
    const dataset = GemDatasets[resumeSnapshot.dataset_id];
    if (!dataset) {
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
      resumeSnapshot.draw_advance_mode,
      true
    );
    setResumeHandled(true);
  }, [resumeSnapshot]);

  const discardResume = useCallback(() => {
    researchStore.clearActiveExperiment();
    setResumeHandled(true);
  }, []);

  // 「10回抽選」(manual: ボタン押下 / auto: カウントダウン満了)で呼ばれる。
  // Core側は内部で10件生成し、最初のMATCHを見つけた位置で以降を開示しない。表示は1件ずつ進める。
  const revealBatch = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || uiPhase !== "running") return;
    if (metaRef.current) metaRef.current.batchCount += 1;
    stopRequestedRef.current = false;

    setIsRevealing(true);
    setCurrentBatchRevealed([]);
    const revealedThisBatch: RevealedEntry[] = [];

    for (let i = 0; i < 10; i++) {
      if (stopRequestedRef.current) break; // 途中終了ボタンが押された
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
    } else if (metaRef.current?.drawAdvanceMode === "auto" && !stopRequestedRef.current) {
      setAutoRemainingMs(AUTO_INTERVAL_MS); // MATCHなし・途中終了もされなかった場合、次のバッチへ向けて再カウントダウン
    }
  }, [uiPhase]);

  // auto条件: 前バッチが終わってから一定時間後に自動で次の10連を開始する。
  useEffect(() => {
    if (uiPhase !== "running") return;
    if (drawAdvanceMode !== "auto") return;
    if (isRevealing) return;
    if (isAutoPaused) return;
    if (autoRemainingMs <= 0) {
      void revealBatch();
      return;
    }
    const id = window.setTimeout(() => {
      setAutoRemainingMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [uiPhase, drawAdvanceMode, isRevealing, isAutoPaused, autoRemainingMs, revealBatch]);

  const pauseAuto = useCallback(() => {
    if (drawAdvanceMode !== "auto") return;
    setIsAutoPaused((was) => {
      if (was) return was;
      pauseStartedAtRef.current = Date.now();
      pauseCountRef.current += 1;
      return true;
    });
  }, [drawAdvanceMode]);

  const resumeAuto = useCallback(() => {
    if (drawAdvanceMode !== "auto") return;
    setIsAutoPaused((was) => {
      if (!was) return was;
      if (pauseStartedAtRef.current !== null) {
        pausedDurationMsRef.current += Date.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = null;
      }
      return false;
    });
  }, [drawAdvanceMode]);

  function finalize(session: CoreSession, extra: { surveyAnswers: SurveyAnswers | null; exitReason: ExitReason | null }) {
    const summary = session.getSummary();
    const meta = metaRef.current;
    if (!meta) return;

    const probability = session.getTheoreticalProbability(); // REVEALED到達後のみ呼べる(Core側でgate済み)
    setFinalProbability(probability);

    const finishedAtMs = summary.finishedAt ?? Date.now();
    // 一時停止中のままフォーカスが外れていた場合に備え、集計を確定させる。
    let finalPausedDurationMs = pausedDurationMsRef.current;
    if (pauseStartedAtRef.current !== null) {
      finalPausedDurationMs += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }

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
      draw_advance_mode: meta.drawAdvanceMode,
      auto_interval_ms: meta.drawAdvanceMode === "auto" ? AUTO_INTERVAL_MS : null,
      pause_count: meta.drawAdvanceMode === "auto" ? pauseCountRef.current : 0,
      paused_duration_ms: meta.drawAdvanceMode === "auto" ? finalPausedDurationMs : 0,
      theoretical_probability: probability.p,
      expected_draws: Number.isFinite(probability.approxOneInN) ? probability.approxOneInN : null,
      tedious_score: extra.surveyAnswers?.tediousnessScore ?? null,
      real_game_burden_score: extra.surveyAnswers?.painIfRepeatedScore ?? null,
      sensor_score: extra.surveyAnswers?.sensorScore ?? null,
      exit_reason: extra.exitReason,
      engine_version: ENGINE_VERSION,
      data_version: meta.dataset.dataVersion,
      // endpoint未設定ならlocal_onlyのまま固定。設定済みならpendingとして保存し、
      // この直後の送信結果でsent/failedへ更新する(ネットワークの成否に関わらずローカル保存が先)。
      submission_status: isSubmissionConfigured() ? "pending" : "local_only",
    };

    const saved = researchStore.addExperiment(record);
    setSaveError(saved.ok ? null : saved.error ?? "記録できませんでした");
    researchStore.clearActiveExperiment();
    setFinalRecord(record);
    setIsRetiring(false);
    setUiPhase("revealed");

    // ローカル保存が完了した後にのみ送信を試みる。失敗してもローカルの記録は失われない。
    if (record.submission_status === "pending") {
      void attemptSubmission(record).then((outcome) => {
        if (outcome.status !== "local_only") {
          setFinalRecord((prev) => (prev && prev.experiment_id === record.experiment_id ? { ...prev, submission_status: outcome.status } : prev));
        }
      });
    }
  }

  // MATCH後、または途中終了後の事後アンケート回答。
  // 途中終了中(pendingGiveUp)の場合は、この後さらに退出理由を尋ねてから確定させる。
  const submitSurvey = useCallback((answers: SurveyAnswers) => {
    const session = sessionRef.current;
    if (!session) return;

    if (pendingGiveUpRef.current) {
      pendingSurveyAnswersRef.current = answers;
      setUiPhase("awaiting_exit_reason");
      return;
    }

    if (session.phase !== ResearchModePhases.AWAITING_SURVEY) return;
    session.submitSurvey(answers);
    finalize(session, { surveyAnswers: answers, exitReason: null });
  }, []);

  // 途中終了時のみ、事後アンケートの後に尋ねる退出理由。回答後に初めてCoreのgiveUp()を呼び確定させる。
  const submitExitReason = useCallback((exitReason: ExitReason) => {
    const session = sessionRef.current;
    if (!session || !pendingGiveUpRef.current) return;
    session.giveUp(); // ここで初めてCore内部のphase/finishedAtを確定させる(この間rollCountは増えていない)
    finalize(session, { surveyAnswers: pendingSurveyAnswersRef.current, exitReason });
    pendingGiveUpRef.current = false;
    pendingSurveyAnswersRef.current = null;
  }, []);

  // 「実験を終了する」: 確認は呼び出し側(コンポーネント)のwindow.confirmで行う。
  // ここではCoreのgiveUp()をまだ呼ばず、事後アンケート(→退出理由)へ進めるだけにする。
  const giveUp = useCallback(() => {
    const session = sessionRef.current;
    if (!session || uiPhase !== "running") return;
    stopRequestedRef.current = true; // revealBatchが実行中なら即座に停止させる
    pendingGiveUpRef.current = true;
    setIsRetiring(true);
    setUiPhase("awaiting_survey");
  }, [uiPhase]);

  // 結果画面からの手動再送。pending/failedのままlocalStorageに残っている今回のレコードを再送する。
  const resendFinalRecord = useCallback(async () => {
    const current = finalRecordRef.current;
    if (!current) return;
    const outcome = await attemptSubmission(current);
    if (outcome.status !== "local_only") {
      setFinalRecord((prev) => (prev && prev.experiment_id === current.experiment_id ? { ...prev, submission_status: outcome.status } : prev));
    }
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    metaRef.current = null;
    pendingGiveUpRef.current = false;
    pendingSurveyAnswersRef.current = null;
    pauseStartedAtRef.current = null;
    stopRequestedRef.current = false;
    setUiPhase("idle");
    setRollCount(0);
    setCurrentBatchRevealed([]);
    setFinalRecord(null);
    setFinalProbability(null);
    setResumedProgressReset(false);
    setElapsedMs(0);
    setIsRetiring(false);
    setDrawAdvanceMode(null);
    setAutoRemainingMs(AUTO_INTERVAL_MS);
    setIsAutoPaused(false);
    pauseCountRef.current = 0;
    pausedDurationMsRef.current = 0;
  }, []);

  return {
    // ロック済みTarget(実験開始時に確定したもの)。setup画面のドラフトとは独立して保持する。
    lockedTarget: metaRef.current?.target ?? null,

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
    resumedProgressReset,
    isRetiring,
    startExperiment,
    revealBatch,
    giveUp,
    submitSurvey,
    submitExitReason,
    reset,

    // manual/auto
    drawAdvanceMode,
    autoRemainingMs,
    isAutoPaused,
    pauseAuto,
    resumeAuto,

    // 結果
    finalRecord,
    finalProbability,
    saveError,
    resendFinalRecord,
  };
}
