import { useCallback, useEffect, useRef, useState } from "react";
import type { BloodGem, GemDataset, ProbabilityResult, TargetBloodGem } from "motsuyoku-sensor-core";
import {
  GemDatasets,
  ResearchModePhases,
  createDefaultRng,
  createResearchModeSession,
  computeGemProbability,
  computeDatasetEntropyBits,
} from "motsuyoku-sensor-core";
import * as researchStore from "../storage/researchHistory";
import type { ActiveExperimentSnapshot, DrawAdvanceMode, ExitReason, ResearchExperiment, TerminationReason } from "../storage/researchHistory";
import { RESEARCH_PROTOCOL_VERSION, REVEAL_MODE } from "../storage/researchHistory";
import * as researchDrawsDb from "../storage/researchDrawsDb";
import { DRAW_DETAIL_SCHEMA_VERSION } from "../storage/researchDrawsDb";
import { toStoredTarget, storedTargetToTarget, buildTargetLabelSnapshot } from "../lib/targetSummary";
import type { TargetLabelSnapshot } from "../lib/targetSummary";
import { attemptSubmission, isSubmissionConfigured } from "../services/researchSubmission";
import { syncResearchDrawsForExperiment } from "../services/researchDrawsSubmission";
import type { SurveyFormAnswers } from "../components/SurveyForm";
import { COIN_COST_MODEL_VERSION, COIN_COST_OPTIONS, INITIAL_COIN, computeNormalizedSurprisalCost } from "../lib/coinCost";
import webPackageJson from "../../package.json";

// app/core/package.json のバージョンをそのまま研究ログのengine_versionとして使う
// (Coreは変更していないため、ここは既知の実値であり創作ではない)。
const ENGINE_VERSION = "motsuyoku-sensor-core@0.1.0";
// app/web/package.jsonのversionをそのままapp_versionとして使う(捏造しない既知の実値)。
const APP_VERSION: string = webPackageJson.version;

// 1件あたりの結果表示間隔。派手なガチャ演出ではなく「個々の結果(特に外れ)を
// 参加者が認識できること」が目的のため、控えめな値を定数として分離しておく。
export const REVEAL_ITEM_DELAY_MS = 400;

// auto条件の間隔(ms)。「その10連の結果をすべて表示し終えてから次の10連まで」の待ち時間。
// 実験開始時に1回だけこの範囲でランダムに決め、その実験中は固定する
// (auto_interval_msを1つの値としてそのまま記録できるようにするため。研究中の速度変更は不可)。
export const AUTO_INTERVAL_MIN_MS = 3000;
export const AUTO_INTERVAL_MAX_MS = 5000;

function pickAutoIntervalMs(): number {
  return AUTO_INTERVAL_MIN_MS + Math.floor(Math.random() * (AUTO_INTERVAL_MAX_MS - AUTO_INTERVAL_MIN_MS + 1));
}

// 「前回の実験を再開しました」通知を自動的に消すまでの時間。
export const RESUME_NOTICE_AUTO_DISMISS_MS = 5000;

// ResearchDraws(IndexedDB)への保存に失敗した際の表示文言。Coreの内部状態(rollCount/phase)は
// 保存失敗したdrawについても既に進んでしまっており巻き戻せないため、同一session内での再試行は
// 案内しない(「もう一度次の10連を押してください」とは言わない)。復帰はreload+resumeのみ。
export const RESEARCH_DRAWS_SAVE_FAILURE_MESSAGE =
  "研究データの保存に失敗しました。ページを再読み込みし、「続きから」を選んでください。";

export type UiPhase = "idle" | "running" | "awaiting_survey" | "awaiting_exit_reason" | "revealed";

export interface RevealedEntry {
  gem: BloodGem;
  rollCount: number; // 実験全体を通した絶対通し番号(resumeを跨いでも連続。Core内部の相対値ではない)
  matched: boolean;
}

export type SurveyAnswers = SurveyFormAnswers;

type CoreSession = ReturnType<typeof createResearchModeSession>;

interface ResumeOffsets {
  rollOffset: number;
  batchOffset: number;
  activeMsBase: number;
  pauseCount: number;
  pausedDurationMs: number;
  resumeCount: number;
  // ResearchDraws最終行のcoin_remaining_after_drawから復元する(正本)。
  coinRemaining: number;
}

// resume時のoffset決定ロジック(指示1節D項)を、hookの外側で単体テスト・見通しよく保てるよう
// 純粋関数として切り出す。優先順位は必ずこの順で決まる:
//   1. IndexedDBのlastDrawが読めればそれを正本として使う(読めて0件=nullも「0件」として正)
//   2. IndexedDBの読み取り自体が失敗した場合のみ、localStorageのcheckpointへfallbackする
//   3. どちらも無ければ0から
// 「読めたが0件」を「読み取り失敗」と混同しない(無言で0扱いにしない)。
function buildResumeOffsets(
  snapshot: ActiveExperimentSnapshot,
  lastDraw: researchDrawsDb.ResearchDrawRecord | null,
  indexedDbReadFailed: boolean
): ResumeOffsets {
  const pauseCount = snapshot.pause_count ?? 0;
  const pausedDurationMs = snapshot.paused_duration_ms ?? 0;
  const resumeCount = (snapshot.resume_count ?? 0) + 1;

  if (lastDraw) {
    return {
      rollOffset: lastDraw.draw_index,
      batchOffset: lastDraw.batch_index,
      activeMsBase: lastDraw.active_elapsed_ms,
      coinRemaining: lastDraw.coin_remaining_after_draw ?? INITIAL_COIN,
      pauseCount,
      pausedDurationMs,
      resumeCount,
    };
  }

  if (indexedDbReadFailed && snapshot.checkpoint_draw_index !== undefined) {
    return {
      rollOffset: snapshot.checkpoint_draw_index ?? 0,
      batchOffset: snapshot.checkpoint_batch_index ?? 0,
      activeMsBase: snapshot.checkpoint_active_elapsed_ms ?? 0,
      coinRemaining: snapshot.checkpoint_coin_remaining ?? INITIAL_COIN,
      pauseCount,
      pausedDurationMs,
      resumeCount,
    };
  }

  return {
    rollOffset: 0,
    batchOffset: 0,
    activeMsBase: 0,
    coinRemaining: INITIAL_COIN,
    pauseCount,
    pausedDurationMs,
    resumeCount,
  };
}

// 研究モードのExperiment Flow(画面遷移・累計roll_count・survey gating)は、
// Core(app/core/src/state/researchModeState.js)がすでに実装済みのため、それをそのまま使う。
// このhookはCoreセッションのReact向けラッパーと、実験結果のlocalStorage保存(researchHistory.ts)
// ・ResearchDraws(IndexedDB)への1 visible draw = 1 recordの永続化・reload復旧(resume案A:
// Core自体は変更せず、Web側で実験全体を通した絶対draw_index/batch_indexのoffsetを管理する)
// ・manual/auto進行・途中終了時アンケートのオーケストレーションを担当する。
//
// resume(案A)の設計:
// CoreのcreateResearchModeSession()はクロージャ内部に乱数消費位置・pendingBatch等を持ち、
// シリアライズできない。そのためreload後は新しいCoreセッションを作り直す(Core内部の
// 未提示pending batchは破棄してよい: 参加者に見せていないdrawは研究データではないため)。
// ただし「これまでに確定済みの絶対roll数」はResearchDraws(IndexedDB)を正本として復元し、
// 新しいCoreセッションが返す相対rollCountにこのoffsetを足すことで、roll_count/cutoff_drawsが
// 0に戻らないようにする。各visible drawが提示された時点でResearchDrawsへ都度チェックポイントする
// ため、reload直前に提示済みだったdrawが失われることはない。
//
// 途中終了(give up)時もCoreの giveUp() を「即座には」呼ばない点に注意:
// Coreの giveUp() は RUNNING → REVEALED (survey無し) へ直接遷移する設計だが、
// 今回の要件では途中終了時も必ず事後アンケート(+退出理由)を経由させる必要がある。
// Coreを変更する代わりに、Web側で「giveUpボタン押下 → 自前でawaiting_survey相当のUIへ遷移
// → アンケート回答 → 退出理由 → その時点で初めてCoreのgiveUp()を呼ぶ」という順序に組み替えている。
// giveUp()を呼ぶまでの間はCore側のphaseはRUNNINGのままだが、revealBatch/自動進行はどちらも
// 独自のuiPhaseガードで停止するため、Coreの抽選が余分に進むことはない。
export function useResearchSession() {
  const [uiPhase, setUiPhaseState] = useState<UiPhase>("idle");
  const [rollCount, setRollCount] = useState(0);
  const [currentBatchRevealed, setCurrentBatchRevealed] = useState<RevealedEntry[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);
  // isRevealingの最新値をrevealBatch冒頭で即座に読むためのref。
  // (連打で複数のrevealBatchが同時に走り、10件の順次表示を飛ばされることを防ぐ。
  //  useCallback内のisRevealing state closureはstale化しうるため、refで保証する。)
  const isRevealingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ResearchDraws(IndexedDB)への保存に失敗した場合の表示用エラー(指示1節E項)。
  // 研究データの欠損を黙って握りつぶさず、UIへ明示する。次のrevealBatch開始時にリセットされる。
  const [researchDrawsSaveError, setResearchDrawsSaveError] = useState<string | null>(null);
  const [finalRecord, setFinalRecord] = useState<ResearchExperiment | null>(null);
  const finalRecordRef = useRef<ResearchExperiment | null>(null);
  useEffect(() => {
    finalRecordRef.current = finalRecord;
  }, [finalRecord]);
  const [finalProbability, setFinalProbability] = useState<ProbabilityResult | null>(null);
  const [resumedProgressReset, setResumedProgressReset] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRetiring, setIsRetiring] = useState(false); // 途中終了操作中(survey/退出理由待ち)かどうか。UIでTarget再編集不可の判定等に使う。

  // コイン(有限resource/cost体験)。表示用にstateとして持つが、revealBatchループ内で
  // 即座に増減判定(exhaustion検出)する必要があるため、真の値はrefで管理しstateは表示専用とする。
  // coinRemainingRef自体は0未満(負)にもなりうる(オーバーシュートの監査用)が、
  // 表示・レコード上のcoin_remainingは常に0でclampする。
  const coinRemainingRef = useRef(INITIAL_COIN);
  const [coinRemaining, setCoinRemaining] = useState(INITIAL_COIN);
  // coinが尽きたことでawaiting_surveyへ進んだ(=Target Matchでもparticipant_giveupでもない)ことを示す。
  const pendingCoinExhaustedRef = useRef(false);

  // manual/auto(研究条件)
  const [drawAdvanceMode, setDrawAdvanceMode] = useState<DrawAdvanceMode | null>(null);
  const [autoRemainingMs, setAutoRemainingMs] = useState(0);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  // pauseCount/pausedDurationMsはUIへライブ表示しないため、stateではなくrefで持つ。
  // (finalize/giveUp/submitSurvey等はuseCallback([])で作られ、Reactのstateクロージャが
  //  古いままになるため、常に最新値を読めるrefを使う。)
  const pauseCountRef = useRef(0);
  const pausedDurationMsRef = useRef(0);
  const resumeCountRef = useRef(0);

  // uiPhase/isAutoPausedの「今この瞬間の値」をactive時間トラッキング(下記)から
  // 同期的に読むためのref。setState経由のeffectだと1レンダー遅れる可能性があるため、
  // 値を変更する側(setPhase/pauseAuto/resumeAuto)で直接書き込む。
  const uiPhaseRef = useRef<UiPhase>("idle");
  const isAutoPausedRef = useRef(false);
  const isTabVisibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);

  // 「参加者が実際に画面上で活動していた累積時間」(active_elapsed_ms/active_duration_ms)の
  // トラッキング。画面を離れていた時間を「抽選作業をしていた時間」と誤認しないための指標。
  // running中・タブが可視・auto一時停止中でない、の3条件がすべて揃っている間だけ加算する。
  // resume時はactiveMsBaseRefへ前回チェックポイント(ResearchDrawsの最終行)の値を積む。
  const activeMsBaseRef = useRef(0);
  const activeAccumulatedRef = useRef(0);
  const activePeriodStartRef = useRef<number | null>(null);

  // resume用のcheckpoint(指示1節B・C項)。ResearchDraws(IndexedDB)へのappendDraw()が
  // 成功したdrawについてのみ更新する「確定済み」の値であり、localStorageのActiveExperimentSnapshotへ
  // そのまま書き出される。ResearchDrawsを正本とする既存方針は変えず、これはIndexedDB読み取り
  // 失敗時だけのfallback/cacheという位置づけ(buildResumeOffsets参照)。
  const checkpointRef = useRef({
    drawIndex: 0,
    batchIndex: 0,
    activeElapsedMs: 0,
    coinRemaining: INITIAL_COIN,
  });

  const [resumeSnapshot] = useState<ActiveExperimentSnapshot | null>(() => researchStore.loadActiveExperiment());
  const [resumeHandled, setResumeHandled] = useState(false);

  const sessionRef = useRef<CoreSession | null>(null);
  const metaRef = useRef<{
    experimentId: string;
    participantId: string;
    dataset: GemDataset;
    target: TargetBloodGem;
    // TargetがLOCKされる実験開始時点で1回だけ計算し、以後は再計算しない
    // (指示1節: deployment/data_version/i18n更新後も実験開始時点の表示内容を変えないため)。
    targetLabelSnapshot: TargetLabelSnapshot;
    desireScore: 1 | 2 | 3 | 4 | 5;
    startedAtMs: number;
    batchCount: number; // 絶対batch_index(resumeを跨いでも継続)
    drawAdvanceMode: DrawAdvanceMode;
    autoIntervalMs: number | null; // 実験開始時に1回だけ決めた値。実験中は不変。
    rollOffset: number; // このCoreセッション開始前までに確定済みだった絶対roll数
    // datasetのShannon entropy(bits/draw)。coinコスト式Dの分母。datasetは実験中不変のため、
    // beginSession時に1回だけ計算してキャッシュする(毎drawで再列挙しない)。
    datasetEntropyBits: number;
  } | null>(null);
  const pendingGiveUpRef = useRef(false);
  const pendingSurveyAnswersRef = useRef<SurveyAnswers | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  // ResearchDraws(IndexedDB)への保存が1件でも失敗したら、このCoreセッションを以後一切
  // 進行させない(revealBatch/auto双方をブロックする)。Coreのrevealnext()は既に呼ばれて
  // 内部状態(rollCount/phase)が進んでしまっており巻き戻せないため、同一session内での
  // 再試行は許可しない。復帰はreload→resumeExperiment(ResearchDraws/checkpointからの
  // 復元)のみ。useCallbackのstale closureに依存しないよう、必ずrefで判定する。
  const persistenceBlockedRef = useRef(false);

  function startActivePeriodIfNeeded() {
    if (activePeriodStartRef.current === null) activePeriodStartRef.current = Date.now();
  }
  function stopActivePeriodIfNeeded() {
    if (activePeriodStartRef.current !== null) {
      activeAccumulatedRef.current += Date.now() - activePeriodStartRef.current;
      activePeriodStartRef.current = null;
    }
  }
  function getActiveMsNow(): number {
    const runningMs = activePeriodStartRef.current !== null ? Date.now() - activePeriodStartRef.current : 0;
    return activeMsBaseRef.current + activeAccumulatedRef.current + runningMs;
  }
  function shouldBeActiveNow(): boolean {
    return (
      uiPhaseRef.current === "running" &&
      isTabVisibleRef.current &&
      !(metaRef.current?.drawAdvanceMode === "auto" && isAutoPausedRef.current)
    );
  }
  function syncActivePeriod() {
    if (shouldBeActiveNow()) startActivePeriodIfNeeded();
    else stopActivePeriodIfNeeded();
  }
  // uiPhaseの変更は必ずこのヘルパー経由で行う(refとstateを同時に更新し、
  // active時間トラッキングを常に最新のphaseへ同期させるため)。
  function setPhase(next: UiPhase) {
    uiPhaseRef.current = next;
    setUiPhaseState(next);
    syncActivePeriod();
  }

  // タブが非表示(バックグラウンド化)されている間はactive時間を進めない。
  useEffect(() => {
    function handleVisibilityChange() {
      isTabVisibleRef.current = !document.hidden;
      syncActivePeriod();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 実験中は「経過時間」表示のために1秒ごとに再計算する(壁時計。resume後も
  // 元のstarted_atからの経過をそのまま表示する。active_duration_msとは別の指標)。
  useEffect(() => {
    if (uiPhase !== "running") return;
    const id = window.setInterval(() => {
      if (metaRef.current) setElapsedMs(Date.now() - metaRef.current.startedAtMs);
    }, 1000);
    return () => window.clearInterval(id);
  }, [uiPhase]);

  // 「前回の実験を再開しました」通知は一時的な案内のため、表示開始から一定時間で自動的に消す。
  // 新しい実験開始・実験終了時はbeginSession/finalizeがresumedProgressResetをfalseにするため、
  // このタイマーのcleanup(clearTimeout)が働き、古いタイマーが誤って発火することもない。
  useEffect(() => {
    if (!resumedProgressReset) return;
    const id = window.setTimeout(() => setResumedProgressReset(false), RESUME_NOTICE_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [resumedProgressReset]);

  // pause_count/paused_duration_ms/resume_count・target_label_snapshotなど、
  // ResearchDraws(正本)には無いresume用の補助情報に加え、checkpointRef(直近の
  // 確定済みdraw_index/batch_index/active_elapsed_ms/coin_remaining)もfallback用として書き戻す。
  // ResearchDraws(IndexedDB)を正本とする既存方針は変えない(指示1節C項: あくまでfallback/cache)。
  // target_label_snapshotは実験開始時点で確定済みの値をそのまま運ぶだけで、ここで再計算はしない。
  function persistActiveSnapshot() {
    const meta = metaRef.current;
    if (!meta) return;
    researchStore.saveActiveExperiment({
      experiment_id: meta.experimentId,
      participant_id: meta.participantId,
      started_at: new Date(meta.startedAtMs).toISOString(),
      dataset_id: meta.dataset.datasetId,
      enemy_id: meta.dataset.enemy.enemyId,
      enemy_display_name: meta.dataset.enemy.displayName,
      target: toStoredTarget(meta.target),
      target_label_snapshot: meta.targetLabelSnapshot,
      desire_score: meta.desireScore,
      draw_advance_mode: meta.drawAdvanceMode,
      auto_interval_ms: meta.autoIntervalMs,
      pause_count: pauseCountRef.current,
      paused_duration_ms: pausedDurationMsRef.current,
      resume_count: resumeCountRef.current,
      checkpoint_draw_index: checkpointRef.current.drawIndex,
      checkpoint_batch_index: checkpointRef.current.batchIndex,
      checkpoint_active_elapsed_ms: checkpointRef.current.activeElapsedMs,
      checkpoint_coin_remaining: checkpointRef.current.coinRemaining,
    });
  }

  function beginSession(
    dataset: GemDataset,
    target: TargetBloodGem,
    desireScore: 1 | 2 | 3 | 4 | 5,
    experimentId: string,
    participantId: string,
    startedAtMs: number,
    mode: DrawAdvanceMode,
    autoIntervalMs: number | null,
    resumed: boolean,
    resumeOffsets: ResumeOffsets | null,
    // resume時は実験開始時点で確定したsnapshotをそのまま引き継ぐ(再計算しない)。
    // 新規実験の場合はここで(TargetがLOCKされるこの瞬間に)1回だけ計算する。
    existingTargetLabelSnapshot: TargetLabelSnapshot | null
  ) {
    const session = createResearchModeSession({ dataset, target, desireScore, rng: createDefaultRng() });
    session.start();
    sessionRef.current = session;

    const rollOffset = resumeOffsets?.rollOffset ?? 0;
    const batchOffset = resumeOffsets?.batchOffset ?? 0;
    const targetLabelSnapshot = existingTargetLabelSnapshot ?? buildTargetLabelSnapshot(dataset, target);
    const datasetEntropyBits = computeDatasetEntropyBits(dataset);

    metaRef.current = {
      experimentId,
      participantId,
      dataset,
      target,
      targetLabelSnapshot,
      desireScore,
      startedAtMs,
      batchCount: batchOffset,
      drawAdvanceMode: mode,
      autoIntervalMs,
      rollOffset,
      datasetEntropyBits,
    };
    pendingGiveUpRef.current = false;
    pendingCoinExhaustedRef.current = false;
    pendingSurveyAnswersRef.current = null;
    pauseStartedAtRef.current = null;
    stopRequestedRef.current = false;
    isRevealingRef.current = false;
    persistenceBlockedRef.current = false;

    activeMsBaseRef.current = resumeOffsets?.activeMsBase ?? 0;
    activeAccumulatedRef.current = 0;
    activePeriodStartRef.current = null;

    checkpointRef.current = {
      drawIndex: rollOffset,
      batchIndex: batchOffset,
      activeElapsedMs: resumeOffsets?.activeMsBase ?? 0,
      coinRemaining: resumeOffsets?.coinRemaining ?? INITIAL_COIN,
    };
    setResearchDrawsSaveError(null);

    pauseCountRef.current = resumeOffsets?.pauseCount ?? 0;
    pausedDurationMsRef.current = resumeOffsets?.pausedDurationMs ?? 0;
    resumeCountRef.current = resumeOffsets?.resumeCount ?? 0;

    coinRemainingRef.current = resumeOffsets?.coinRemaining ?? INITIAL_COIN;
    setCoinRemaining(Math.max(0, coinRemainingRef.current));

    isAutoPausedRef.current = false;
    setIsAutoPaused(false);
    setDrawAdvanceMode(mode);
    setAutoRemainingMs(autoIntervalMs ?? 0);
    setResumedProgressReset(resumed);
    setRollCount(rollOffset);
    setCurrentBatchRevealed([]);
    setIsRevealing(false);
    setElapsedMs(Date.now() - startedAtMs);
    setIsRetiring(false);
    setSaveError(null);

    persistActiveSnapshot();
    setPhase("running");
  }

  const startExperiment = useCallback((dataset: GemDataset, target: TargetBloodGem, desireScore: 1 | 2 | 3 | 4 | 5) => {
    const experimentId = crypto.randomUUID();
    const participantId = researchStore.getOrCreateParticipantId();
    // 参加者には選択させず、実験開始時にランダムへ割り当てる(比較したい要因: 次の10連を自分でクリックするかどうか)。
    const mode: DrawAdvanceMode = Math.random() < 0.5 ? "manual" : "auto";
    const autoIntervalMs = mode === "auto" ? pickAutoIntervalMs() : null;
    beginSession(dataset, target, desireScore, experimentId, participantId, Date.now(), mode, autoIntervalMs, false, null, null);
  }, []);

  // reload後、activeExperimentスナップショット+ResearchDraws(正本)から再開する。
  // Coreセッションの内部状態(乱数消費位置等)はシリアライズできないため、新しいCoreセッションを
  // 作り直す形になるが、roll_count/batch_count/active_elapsed_msはResearchDrawsに保存済みの
  // 最後のvisible drawから復元するため、0に戻らない。draw_advance_mode/auto_interval_msは
  // 元の割り当てをそのまま引き継ぐ(再度ランダム化はしない)。
  const resumeExperiment = useCallback(async () => {
    if (!resumeSnapshot) return;
    const dataset = GemDatasets[resumeSnapshot.dataset_id];
    if (!dataset) {
      researchStore.clearActiveExperiment();
      setResumeHandled(true);
      return;
    }
    const target = storedTargetToTarget(dataset.datasetId, resumeSnapshot.target);

    let lastDraw: researchDrawsDb.ResearchDrawRecord | null = null;
    let indexedDbReadFailed = false;
    try {
      lastDraw = await researchDrawsDb.getLastDrawForExperiment(resumeSnapshot.experiment_id);
    } catch {
      // IndexedDB自体が読めない場合のみ、localStorageのcheckpointへfallbackする
      // (buildResumeOffsets参照)。読み取りに成功して0件だった場合と区別する(無言で0扱いにしない)。
      indexedDbReadFailed = true;
    }

    const resumeOffsets = buildResumeOffsets(resumeSnapshot, lastDraw, indexedDbReadFailed);

    beginSession(
      dataset,
      target,
      resumeSnapshot.desire_score,
      resumeSnapshot.experiment_id,
      resumeSnapshot.participant_id,
      new Date(resumeSnapshot.started_at).getTime(),
      resumeSnapshot.draw_advance_mode,
      resumeSnapshot.auto_interval_ms, // 元の割り当てをそのまま引き継ぐ(再度ランダム化しない)
      true,
      resumeOffsets,
      // このsnapshot導入より前に保存されたactiveExperimentには無い可能性があるため、
      // その場合のみfail-softに現在のdatasetから計算する(通常は実験開始時点の値をそのまま使う)。
      resumeSnapshot.target_label_snapshot ?? null
    );
    setResumeHandled(true);
  }, [resumeSnapshot]);

  const discardResume = useCallback(() => {
    researchStore.clearActiveExperiment();
    setResumeHandled(true);
  }, []);

  // 「10回抽選」(manual: ボタン押下 / auto: カウントダウン満了)で呼ばれる。
  // Core側は内部で10件生成するが、画面へは1件ずつ(REVEAL_ITEM_DELAY_MS間隔で)提示する。
  // 「また外れた」を個々に認識できることが目的で、一気に10件出す演出はしない。
  // isRevealingRef(連打・auto二重発火防止)は、全件の提示が完了するまで次のバッチを一切開始させない。
  //
  // 各visible drawが画面へ出た直後に、ResearchDraws(IndexedDB)へ即座にappendDraw()する
  // (指示: 「reload直前に提示済みだったdrawが失われないように」10連の完了を待たずcheckpointする)。
  const revealBatch = useCallback(async () => {
    if (isRevealingRef.current) return; // 表示中の連打・二重発火を防ぐ(10件の提示完了まで次を開始しない)
    if (persistenceBlockedRef.current) return; // 保存失敗後、reloadされるまでこのsessionは進行させない
    const session = sessionRef.current;
    const meta = metaRef.current;
    if (!session || !meta || uiPhase !== "running") return;
    meta.batchCount += 1;
    const batchIndex = meta.batchCount;
    stopRequestedRef.current = false;

    isRevealingRef.current = true;
    setIsRevealing(true);
    setCurrentBatchRevealed([]);
    setResearchDrawsSaveError(null); // 前回の保存失敗表示があれば、新しいバッチ開始時にリセットする
    const revealedThisBatch: RevealedEntry[] = [];

    for (let i = 0; i < 10; i++) {
      if (stopRequestedRef.current) break; // 途中終了ボタンが押された→未表示分は追加表示しない
      if (session.phase !== ResearchModePhases.RUNNING) break;
      const { gem, rollCount: relativeRollCount, matched } = session.revealNext();
      const absoluteRollCount = meta.rollOffset + relativeRollCount;

      const activeElapsedMs = getActiveMsNow();
      const wallElapsedMs = Date.now() - meta.startedAtMs;
      // 確率監査用スナップショット: coin_costがdrawそのものの確率に依存するため、
      // 「なぜこのdrawでこのcoin_costだったか」を将来再計算できるよう、実際に出たgemの
      // 正確な確率とsurprisal(bit)を常時保存しておく。
      const { p: gemProbabilityExact } = computeGemProbability(meta.dataset, gem);
      const gemSurprisalBits = -Math.log2(gemProbabilityExact);
      // coin(有限resource/cost体験)を消費する。確定したproduction設定(COIN_COST_OPTIONS)を
      // 唯一の定義元として参照し、ここへ式やパラメータをハードコードしない。
      const coinCost = computeNormalizedSurprisalCost(gemProbabilityExact, meta.datasetEntropyBits, COIN_COST_OPTIONS);
      const coinRemainingAfterThisDraw = coinRemainingRef.current - coinCost;

      // 指示1節A項: このdrawを「resume可能な確定済みdraw」として扱う前に、IndexedDBへの
      // 書き込み成功を保証する(fire-and-forgetにしない)。書き込みが確認できるまでは
      // UI状態(currentBatchRevealed/rollCount/coinRemaining)もcheckpointも進めない。
      let saved = true;
      try {
        // eslint-disable-next-line no-await-in-loop
        await researchDrawsDb.appendDraw({
          experiment_id: meta.experimentId,
          draw_index: absoluteRollCount,
          batch_index: batchIndex,
          active_elapsed_ms: activeElapsedMs,
          wall_elapsed_ms: wallElapsedMs,
          dataset_id: meta.dataset.datasetId,
          shape_id: gem.shapeId,
          primary_effect_id: gem.primaryEffectId,
          primary_value_rank: gem.primaryValueRank,
          secondary_effect_id: gem.secondaryEffectId,
          secondary_value_rank: gem.secondaryValueRank,
          curse_id: gem.curseId,
          target_match: matched,
          gem_probability_exact: gemProbabilityExact,
          gem_surprisal_bits: gemSurprisalBits,
          coin_cost: coinCost,
          coin_remaining_after_draw: coinRemainingAfterThisDraw,
          coin_cost_model_version: COIN_COST_MODEL_VERSION,
          draw_detail_schema_version: DRAW_DETAIL_SCHEMA_VERSION,
        });
      } catch {
        saved = false;
      }

      if (!saved) {
        // 研究データの欠損を黙って握りつぶさない。UIへ保存失敗を表示し、このdraw以降を
        // 正常保存済みとして扱わない(checkpoint/coin/表示のいずれも進めずここで停止)。
        // このdraw自体はCore内部では既にrevealNext()済み(乱数消費・rollCount/phase前進)であり
        // 巻き戻せないため、同一Coreセッションはここで完全に停止させる(persistenceBlockedRef)。
        // 復帰はページ再読み込み→resumeExperiment(ResearchDraws/checkpointからの復元)のみとし、
        // 同一session内での再試行は一切許可しない(draw_indexの欠番・Core/ResearchDrawsの
        // 不整合・Target Matchの取りこぼしを防ぐ)。このdraw自体は参加者に提示されず、
        // 公式streamにも存在しないdrawとして破棄する。
        persistenceBlockedRef.current = true;
        setResearchDrawsSaveError(RESEARCH_DRAWS_SAVE_FAILURE_MESSAGE);
        stopRequestedRef.current = true;
        break;
      }

      coinRemainingRef.current = coinRemainingAfterThisDraw;
      setCoinRemaining(Math.max(0, coinRemainingRef.current));

      const entry: RevealedEntry = { gem, rollCount: absoluteRollCount, matched };
      revealedThisBatch.push(entry);
      setCurrentBatchRevealed([...revealedThisBatch]);
      setRollCount(absoluteRollCount);

      // 指示1節C・F項: 保存成功が確認できたdrawについてのみcheckpointを進める
      // (roll_count/batch_index/active_elapsed_ms/coin_remainingをすべて整合させて更新する)。
      checkpointRef.current = {
        drawIndex: absoluteRollCount,
        batchIndex,
        activeElapsedMs,
        coinRemaining: coinRemainingRef.current,
      };
      persistActiveSnapshot();

      if (matched) break; // Target Match: ここで停止し、残りは参加者に見せない(roll_countも増やさない)。coin exhaustionより優先する。
      if (coinRemainingRef.current <= 0) {
        // coin <= 0 かつTarget未達: ここで停止し、事後アンケートへ進む(参加者の任意終了とは区別する)。
        pendingCoinExhaustedRef.current = true;
        stopRequestedRef.current = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, REVEAL_ITEM_DELAY_MS));
      if (stopRequestedRef.current) break; // 待機中に途中終了された場合も、直後の1件を出さずに止める
    }

    isRevealingRef.current = false;
    setIsRevealing(false);

    if (persistenceBlockedRef.current) {
      // 保存失敗によりCoreの状態はもう信頼できない。Core側がAWAITING_SURVEYになっていても
      // (=保存に失敗したdrawがTarget Matchだった場合)、surveyへは進めない。
      // autoの次バッチ予約も行わない。reload→resumeExperimentでの復帰のみを案内する。
      return;
    }

    const phaseAfterBatch: string = session.phase;
    if (phaseAfterBatch === ResearchModePhases.AWAITING_SURVEY || pendingCoinExhaustedRef.current) {
      setPhase("awaiting_survey");
    } else if (meta.drawAdvanceMode === "auto" && !stopRequestedRef.current) {
      // MATCHなし・途中終了もされなかった場合のみ、全件表示完了後に次のバッチへ向けて再カウントダウンを始める。
      setAutoRemainingMs(meta.autoIntervalMs ?? 0);
    }
  }, [uiPhase]);

  // auto条件: 前バッチが終わってから一定時間後に自動で次の10連を開始する。
  useEffect(() => {
    if (uiPhase !== "running") return;
    if (drawAdvanceMode !== "auto") return;
    if (isRevealing) return;
    if (isAutoPaused) return;
    if (persistenceBlockedRef.current) return; // 保存失敗後はautoも再開しない(reloadのみが復帰経路)
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
      isAutoPausedRef.current = true;
      syncActivePeriod();
      persistActiveSnapshot();
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
      isAutoPausedRef.current = false;
      syncActivePeriod();
      persistActiveSnapshot();
      return false;
    });
  }, [drawAdvanceMode]);

  async function finalize(
    session: CoreSession,
    extra: { surveyAnswers: SurveyAnswers | null; exitReason: ExitReason | null; terminationReason: TerminationReason }
  ) {
    const summary = session.getSummary();
    const meta = metaRef.current;
    if (!meta) return;

    setResumedProgressReset(false); // 実験終了時は「前回の実験を再開しました」通知を消す

    const probability = session.getTheoreticalProbability(); // REVEALED到達後のみ呼べる(Core側でgate済み)
    setFinalProbability(probability);

    const finishedAtMs = summary.finishedAt ?? Date.now();
    // 一時停止中のままフォーカスが外れていた場合に備え、集計を確定させる。
    let finalPausedDurationMs = pausedDurationMsRef.current;
    if (pauseStartedAtRef.current !== null) {
      finalPausedDurationMs += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }

    const absoluteRollCountAtEnd = meta.rollOffset + summary.rollCount;
    const activeDurationMs = getActiveMsNow();

    // draw_detail_count(ResearchDrawsに実際にローカル記録されているvisible drawの期待件数)は
    // 送信前にここで確定させる。後からExperiments行を更新しに行くAPIを不要にするため
    // (docs/apps_script_v3_spec.md 8節)、非同期の後追い更新はしない。
    let drawDetailCount = absoluteRollCountAtEnd;
    try {
      drawDetailCount = await researchDrawsDb.countDrawsForExperiment(meta.experimentId);
    } catch {
      // IndexedDBが読めなくても実験結果自体の保存は止めない(rollCountをfallbackとして使う)。
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
      // TargetがLOCKされた実験開始時点(beginSession)で既に計算済みの値をそのままコピーするだけ。
      // ここで現在のdatasetから再計算はしない(指示1節: 実験開始後にdeployment/data_version/i18nが
      // 更新されても、実験開始時点の表示内容が変わらないようにするため)。
      target_label_snapshot: meta.targetLabelSnapshot,
      desire_score: meta.desireScore,
      success: summary.matched,
      censored: summary.censored,
      roll_count: summary.matched ? absoluteRollCountAtEnd : null,
      cutoff_draws: summary.censored ? absoluteRollCountAtEnd : null,
      batch_count: meta.batchCount,
      draw_advance_mode: meta.drawAdvanceMode,
      auto_interval_ms: meta.autoIntervalMs,
      pause_count: meta.drawAdvanceMode === "auto" ? pauseCountRef.current : 0,
      paused_duration_ms: meta.drawAdvanceMode === "auto" ? finalPausedDurationMs : 0,
      theoretical_probability: probability.p,
      expected_draws: Number.isFinite(probability.approxOneInN) ? probability.approxOneInN : null,
      tedious_score: extra.surveyAnswers?.tediousnessScore ?? null,
      real_game_burden_score: extra.surveyAnswers?.painIfRepeatedScore ?? null,
      sensor_score: extra.surveyAnswers?.sensorScore ?? null,
      effort_reward_fit_score: extra.surveyAnswers?.effortRewardFitScore ?? null,
      perceived_expected_draws: extra.surveyAnswers?.perceivedExpectedDraws ?? null,
      exit_reason: extra.exitReason,
      termination_reason: extra.terminationReason,
      engine_version: ENGINE_VERSION,
      data_version: meta.dataset.dataVersion,
      app_version: APP_VERSION,
      research_protocol_version: RESEARCH_PROTOCOL_VERSION,
      reveal_mode: REVEAL_MODE,
      reveal_interval_ms: REVEAL_ITEM_DELAY_MS,
      active_duration_ms: activeDurationMs,
      resume_count: resumeCountRef.current,
      draw_detail_count: drawDetailCount,
      // coin_used = coin_initial - (符号付きの)coinRemainingRef.current。coin_exhausted時は
      // 最後のdrawのオーバーシュート分だけcoin_initialを超えることがある(実消費量として正確)。
      // coin_remainingは表示・レコードとも下限0でclampする(参加者へ負の残高を見せない)。
      coin_initial: INITIAL_COIN,
      coin_remaining: Math.max(0, coinRemainingRef.current),
      coin_used: INITIAL_COIN - coinRemainingRef.current,
      // endpoint未設定ならlocal_onlyのまま固定。設定済みならpendingとして保存し、
      // この直後の送信結果でsent/failedへ更新する(ネットワークの成否に関わらずローカル保存が先)。
      submission_status: isSubmissionConfigured() ? "pending" : "local_only",
    };

    const saved = researchStore.addExperiment(record);
    setSaveError(saved.ok ? null : saved.error ?? "記録できませんでした");
    researchStore.clearActiveExperiment();
    setFinalRecord(record);
    setIsRetiring(false);
    setPhase("revealed");

    // ResearchDraws(このexperiment_idでローカルに記録済みの全visible draw)をchunk送信する。
    // Experimentsの送信結果とは独立して進める(片方が失敗しても他方のローカルデータは失われない)。
    void syncResearchDrawsForExperiment(meta.experimentId);

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
      setPhase("awaiting_exit_reason");
      return;
    }

    if (pendingCoinExhaustedRef.current) {
      // coin <= 0 かつTarget未達のケース。参加者の任意終了(giveUp)とは別経路だが、
      // Core内部の状態確定にはCoreのgiveUp()をそのまま再利用する(censored=true・
      // RUNNING→REVEALEDへの遷移はcoinの有無に関わらず同じ内部処理でよいため)。
      // 退出理由(exit_reason)は参加者の主観的な理由専用のためnullのまま尋ねない。
      if (session.phase !== ResearchModePhases.RUNNING) return;
      session.giveUp();
      finalize(session, { surveyAnswers: answers, exitReason: null, terminationReason: "coin_exhausted" });
      pendingCoinExhaustedRef.current = false;
      return;
    }

    if (session.phase !== ResearchModePhases.AWAITING_SURVEY) return;
    session.submitSurvey(answers);
    finalize(session, { surveyAnswers: answers, exitReason: null, terminationReason: "target_match" });
  }, []);

  // 途中終了時のみ、事後アンケートの後に尋ねる退出理由。回答後に初めてCoreのgiveUp()を呼び確定させる。
  const submitExitReason = useCallback((exitReason: ExitReason) => {
    const session = sessionRef.current;
    if (!session || !pendingGiveUpRef.current) return;
    session.giveUp(); // ここで初めてCore内部のphase/finishedAtを確定させる(この間rollCountは増えていない)
    finalize(session, { surveyAnswers: pendingSurveyAnswersRef.current, exitReason, terminationReason: "participant_giveup" });
    pendingGiveUpRef.current = false;
    pendingSurveyAnswersRef.current = null;
  }, []);

  // 「実験を終了する」: 確認は呼び出し側(コンポーネント)のwindow.confirmで行う。
  // ここではCoreのgiveUp()をまだ呼ばず、事後アンケート(→退出理由)へ進めるだけにする。
  const giveUp = useCallback(() => {
    const session = sessionRef.current;
    if (!session || uiPhase !== "running") return;
    // 保存失敗後はgiveUp()も禁止する: Core内部のrollCountは既に確定保存できなかったdraw分だけ
    // 先へ進んでしまっており、ここでgiveUp()するとcutoff_drawsがResearchDrawsの実際の記録と
    // ずれた値で確定してしまう。復帰はreload→resumeExperimentのみ。
    if (persistenceBlockedRef.current) return;
    stopRequestedRef.current = true; // revealBatchが実行中なら即座に停止させる
    pendingGiveUpRef.current = true;
    setIsRetiring(true);
    setPhase("awaiting_survey");
  }, [uiPhase]);

  // 結果画面からの手動再送。pending/failedのままlocalStorageに残っている今回のレコードを再送する。
  const resendFinalRecord = useCallback(async () => {
    const current = finalRecordRef.current;
    if (!current) return;
    const outcome = await attemptSubmission(current);
    if (outcome.status !== "local_only") {
      setFinalRecord((prev) => (prev && prev.experiment_id === current.experiment_id ? { ...prev, submission_status: outcome.status } : prev));
    }
    // Experimentsの再送と合わせて、このexperiment_idのResearchDrawsも改めて送り直す
    // (両者は独立した送信経路であり、片方だけ失敗していることがあるため)。
    void syncResearchDrawsForExperiment(current.experiment_id);
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    metaRef.current = null;
    pendingGiveUpRef.current = false;
    pendingCoinExhaustedRef.current = false;
    pendingSurveyAnswersRef.current = null;
    pauseStartedAtRef.current = null;
    stopRequestedRef.current = false;
    isRevealingRef.current = false;
    persistenceBlockedRef.current = false;
    activeMsBaseRef.current = 0;
    activeAccumulatedRef.current = 0;
    activePeriodStartRef.current = null;
    coinRemainingRef.current = INITIAL_COIN;
    checkpointRef.current = { drawIndex: 0, batchIndex: 0, activeElapsedMs: 0, coinRemaining: INITIAL_COIN };
    setPhase("idle");
    setRollCount(0);
    setCurrentBatchRevealed([]);
    setIsRevealing(false);
    setFinalRecord(null);
    setFinalProbability(null);
    setResumedProgressReset(false);
    setElapsedMs(0);
    setIsRetiring(false);
    setDrawAdvanceMode(null);
    setAutoRemainingMs(0);
    setIsAutoPaused(false);
    setCoinRemaining(INITIAL_COIN);
    setResearchDrawsSaveError(null);
    pauseCountRef.current = 0;
    pausedDurationMsRef.current = 0;
    resumeCountRef.current = 0;
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
    // ResearchDraws(IndexedDB)への保存に失敗した場合のエラー表示(指示1節E項)。
    researchDrawsSaveError,
    startExperiment,
    revealBatch,
    giveUp,
    submitSurvey,
    submitExitReason,
    reset,

    // コイン(常時表示用。指示1節)
    coinRemaining,
    coinUsed: INITIAL_COIN - coinRemaining,
    coinInitial: INITIAL_COIN,

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
