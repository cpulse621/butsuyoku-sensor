// 研究モードの状態管理（experiment_ui_flow_spec.md および今回の実装指示より）。
// UI・ブラウザAPIから独立。closureベースのファクトリ関数（thisを使わない）。
//
// フロー: setup（enemy/dataset/Target/desireScore確定）→ running（10件ずつ内部抽選、1件ずつ開示）
//   → Target Match時: awaiting_survey（3問回答するまで理論確率は見せない）→ revealed
//   → give-up時: censored=true のまま revealed へ直行（下記の設計メモ参照）
//
// 設計メモ（要確認事項、BLOCKERではなく軽微な確認事項として報告する）:
//   ユーザー指示は「Target Match直後に3問のアンケートに回答してから理論確率を開示する」とのみ
//   明記しており、give-up（途中で諦めた場合）の経路についての明示的な指定が無かった。
//   本実装では give-up 時はアンケートを経由せず直接 revealed へ遷移するものとして実装した。

import { draw } from "../engine/drawEngine.js";
import { isMatch } from "../engine/targetMatcher.js";
import { computeProbability } from "../engine/probabilityEngine.js";
import { InvalidTargetError } from "../errors.js";

export const ResearchModePhases = Object.freeze({
  SETUP: "setup",
  RUNNING: "running",
  AWAITING_SURVEY: "awaiting_survey",
  REVEALED: "revealed",
});

function assertScore1to5(value, name) {
  if (!(Number.isInteger(value) && value >= 1 && value <= 5)) {
    throw new InvalidTargetError(`${name} must be an integer 1-5, got ${JSON.stringify(value)}`);
  }
}

export function createResearchModeSession({ dataset, target, desireScore, rng }) {
  assertScore1to5(desireScore, "desireScore");

  let phase = ResearchModePhases.SETUP;
  const revealedGems = [];
  let pendingBatch = [];
  let matchedAt = null;
  let censored = false;
  let survey = null;
  let startedAt = null;
  let finishedAt = null;

  function start() {
    if (phase !== ResearchModePhases.SETUP) throw new Error(`cannot start() from phase "${phase}"`);
    startedAt = Date.now();
    phase = ResearchModePhases.RUNNING;
  }

  function ensureBatch() {
    if (pendingBatch.length === 0) {
      pendingBatch = draw(dataset, 10, { rng });
    }
  }

  // 内部的には10件ずつバッチ抽選しつつ、外部へは1件ずつ開示する。
  // Target Matchに達した時点でそこで停止し、以降 revealNext() は呼べない（awaiting_surveyへ遷移）。
  function revealNext() {
    if (phase !== ResearchModePhases.RUNNING) throw new Error(`cannot revealNext() from phase "${phase}"`);
    ensureBatch();
    const gem = pendingBatch.shift();
    revealedGems.push(gem);
    const rollCount = revealedGems.length;
    const matched = isMatch(gem, target);
    if (matched) {
      matchedAt = rollCount;
      phase = ResearchModePhases.AWAITING_SURVEY;
    }
    return { gem, rollCount, matched };
  }

  function giveUp() {
    if (phase !== ResearchModePhases.RUNNING) throw new Error(`cannot giveUp() from phase "${phase}"`);
    censored = true;
    finishedAt = Date.now();
    phase = ResearchModePhases.REVEALED;
  }

  // Target Match直後の3問アンケート。この3問すべてに回答するまで getTheoreticalProbability() は使えない。
  function submitSurvey({ tediousnessScore, painIfRepeatedScore, sensorScore }) {
    if (phase !== ResearchModePhases.AWAITING_SURVEY) throw new Error(`cannot submitSurvey() from phase "${phase}"`);
    assertScore1to5(tediousnessScore, "tediousnessScore");
    assertScore1to5(painIfRepeatedScore, "painIfRepeatedScore");
    assertScore1to5(sensorScore, "sensorScore");
    survey = { tediousnessScore, painIfRepeatedScore, sensorScore };
    finishedAt = Date.now();
    phase = ResearchModePhases.REVEALED;
  }

  function getTheoreticalProbability() {
    if (phase !== ResearchModePhases.REVEALED) {
      throw new Error(`theoretical probability is hidden until phase "${ResearchModePhases.REVEALED}" (current: "${phase}")`);
    }
    return computeProbability(dataset, target);
  }

  function getSummary() {
    return {
      datasetId: dataset.datasetId,
      target,
      desireScore,
      phase,
      rollCount: revealedGems.length,
      matched: matchedAt !== null,
      matchedAt,
      censored,
      survey,
      startedAt,
      finishedAt,
    };
  }

  return {
    start,
    revealNext,
    giveUp,
    submitSurvey,
    getTheoreticalProbability,
    getSummary,
    get phase() {
      return phase;
    },
  };
}
