import { test } from "node:test";
import assert from "node:assert/strict";
import { createResearchModeSession, ResearchModePhases } from "../src/state/researchModeState.js";
import { createSimulatorModeSession } from "../src/state/simulatorModeState.js";
import { createSeededRng } from "../src/engine/rng.js";
import { buildTestDataset } from "./fixtures/testDataset.js";

function easyTarget(dataset) {
  // radiant_staminaはFAKE primary poolの重みが10/50=0.2、rankは一様1/3、curseは全許可なので、
  // 平均して数十回に1回程度は当たる現実的なテスト用Target。
  return {
    datasetId: dataset.datasetId,
    acceptedShapes: ["radial", "triangle", "waning"],
    primaryEffectId: "radiant_stamina",
    acceptedPrimaryRanks: [16, 17, 18],
    acceptedCurses: ["kin_attack_down", "beast_attack_down", "durability_down", "hp_deplete", "attack_down"], // stamina_cost_upは常に除外される側なので含めない
    desireScore: 3,
    researchEligible: true,
  };
}

test("ResearchModeState: Target Matchまで1件ずつ開示し、roll_countが一致し、アンケート前は確率が見えない", () => {
  const dataset = buildTestDataset("watchers"); // secondarySlot=noneでシンプル
  const target = easyTarget(dataset);
  const rng = createSeededRng(2026);
  const session = createResearchModeSession({ dataset, target, desireScore: 4, rng });

  assert.equal(session.phase, ResearchModePhases.SETUP);
  session.start();
  assert.equal(session.phase, ResearchModePhases.RUNNING);

  assert.throws(() => session.getTheoreticalProbability(), /hidden until phase/);

  let lastResult = null;
  let rollCount = 0;
  for (let i = 0; i < 100000; i++) {
    lastResult = session.revealNext();
    rollCount++;
    if (lastResult.matched) break;
  }
  assert.ok(lastResult.matched, "100000回引いても一度もTarget Matchしなかった(テスト前提かエンジンが壊れている)");
  assert.equal(lastResult.rollCount, rollCount);
  assert.equal(session.phase, ResearchModePhases.AWAITING_SURVEY);

  assert.throws(() => session.revealNext(), /cannot revealNext/);
  assert.throws(() => session.getTheoreticalProbability(), /hidden until phase/);

  assert.throws(() => session.submitSurvey({ tediousnessScore: 6, painIfRepeatedScore: 3, sensorScore: 3 }), /must be an integer 1-5/);

  session.submitSurvey({ tediousnessScore: 2, painIfRepeatedScore: 4, sensorScore: 5 });
  assert.equal(session.phase, ResearchModePhases.REVEALED);

  const prob = session.getTheoreticalProbability();
  assert.ok(prob.p > 0 && prob.p < 1);

  const summary = session.getSummary();
  assert.equal(summary.matched, true);
  assert.equal(summary.matchedAt, rollCount);
  assert.equal(summary.rollCount, rollCount);
  assert.deepEqual(summary.survey, { tediousnessScore: 2, painIfRepeatedScore: 4, sensorScore: 5 });
  assert.equal(summary.censored, false);
});

test("ResearchModeState: give-upするとアンケートを経由せずrevealedへ進む(設計メモどおり)", () => {
  const dataset = buildTestDataset("watchers");
  const target = easyTarget(dataset);
  const rng = createSeededRng(1);
  const session = createResearchModeSession({ dataset, target, desireScore: 2, rng });
  session.start();
  session.revealNext();
  session.revealNext();
  session.giveUp();
  assert.equal(session.phase, ResearchModePhases.REVEALED);
  const summary = session.getSummary();
  assert.equal(summary.censored, true);
  assert.equal(summary.survey, null);
  // give-up後も理論確率自体は(REVEALEDなので)取得できる
  const prob = session.getTheoreticalProbability();
  assert.ok(prob.p > 0);
});

test("SimulatorModeState: 10連は常に10件返し、確率情報はいつでも取得できる", () => {
  const dataset = buildTestDataset("madman");
  const target = easyTarget(dataset);
  // madmanのeasyTarget: secondaryEffectId未指定 → secondarySlot="selectable"だが
  // validateTargetのXORルールによりsecondary無指定でも許可される(secondary無関心のTarget)
  const rng = createSeededRng(77);
  const session = createSimulatorModeSession({ dataset, target, rng });

  const results = session.pullTen();
  assert.equal(results.length, 10);
  assert.equal(session.getLastResults().length, 10);

  const info = session.getProbabilityInfo();
  assert.ok(info.p > 0 && info.p < 1);
  assert.ok(Number.isFinite(info.approxOneInN));
});
