// apps_script/Code.gs のテスト。
//
// Code.gsはGoogle Apps Script専用のグローバル(SpreadsheetApp/LockService/ContentService/Logger)に
// 依存しており、npm workspaceのCore/Web test suiteには含められない。ここではNode組み込みの
// vmモジュールでこれらのグローバルを最小限スタブ化したサンドボックス上でCode.gsを実行し、
// 純粋ロジック(バリデーション・列名解決・dedupe等)を検証する。
//
// 実行方法: `node --test apps_script/` または `node apps_script/Code.test.js`
// (npm workspaceのCore/Web testsとは別に、本番反映前に手動で実行することを想定)。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ---- フェイクSheet(セルのgetValues/setValues/createTextFinder等、Code.gsが使う分だけ実装) ----

function makeFakeSheet(headers, dataRows) {
  const grid = [headers.slice(), ...dataRows.map((r) => r.slice())];

  function ensureRow(r) {
    while (grid.length < r) grid.push([]);
  }

  return {
    getLastColumn: () => (grid[0] ? grid[0].length : 0),
    getLastRow: () => grid.length,
    getMaxRows: () => grid.length,
    insertRowAfter: () => {
      grid.push([]);
    },
    getRange: (row, col, numRows, numCols) => {
      numRows = numRows || 1;
      numCols = numCols || 1;
      const range = {
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            ensureRow(row + r);
            const rowArr = [];
            for (let c = 0; c < numCols; c++) {
              const v = (grid[row - 1 + r] || [])[col - 1 + c];
              rowArr.push(v === undefined ? "" : v);
            }
            out.push(rowArr);
          }
          return out;
        },
        getDisplayValues: () => range.getValues().map((r) => r.map((v) => (v === undefined || v === null ? "" : String(v)))),
        setValues: (vals) => {
          vals.forEach((rowVals, r) => {
            ensureRow(row + r);
            rowVals.forEach((v, c) => {
              grid[row - 1 + r][col - 1 + c] = v;
            });
          });
        },
        setFormula: () => {},
        createTextFinder: (text) => ({
          matchEntireCell: () => ({
            findNext: () => {
              for (let r = 0; r < numRows; r++) {
                const cellRow = grid[row - 1 + r];
                if (cellRow && cellRow[col - 1] !== undefined && String(cellRow[col - 1]) === text) return {};
              }
              return null;
            },
          }),
        }),
      };
      return range;
    },
    _grid: grid,
  };
}

// ---- Code.gsをGASグローバルのスタブ付きでロードする ----

function loadCodeGs() {
  const source = fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8");
  const sheetsByName = {};
  let lockAcquired = true;

  const sandbox = {
    console,
    LockService: {
      getScriptLock: () => ({
        tryLock: () => lockAcquired,
        releaseLock: () => {},
      }),
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheetsByName[name] || null,
        insertSheet: (name) => {
          const sheet = makeFakeSheet([], []);
          sheetsByName[name] = sheet;
          return sheet;
        },
      }),
      flush: () => {},
    },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (text) => ({
        setMimeType: () => ({ getContent: () => text }),
      }),
    },
    Logger: { log: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "Code.gs" });

  return {
    sandbox,
    sheetsByName,
    setSheet: (name, sheet) => {
      sheetsByName[name] = sheet;
    },
    setLockAcquired: (v) => {
      lockAcquired = v;
    },
  };
}

function callDoPost(env, body) {
  const result = env.sandbox.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(result.getContent());
}

// v3 experimentの必須34key(Code.gs EXPERIMENT_REQUIRED_KEYSと同一。実データを1件作るヘルパー)。
function makeFullV3ExperimentPayload(overrides) {
  return Object.assign(
    {
      experiment_id: "exp-1",
      participant_id: "participant-1",
      started_at: "2026-09-18T00:00:00.000Z",
      finished_at: "2026-09-18T00:05:00.000Z",
      duration_ms: 300000,
      dataset_id: "pthumeru_depth5_standard_watchers_v0_1",
      enemy_id: "merciless_watchers",
      shape: "radial",
      primary_effect_id: "physical",
      desire_score: 5,
      draw_advance_mode: "manual",
      success: true,
      censored: false,
      roll_count: 4,
      cutoff_draws: null,
      batch_count: 1,
      theoretical_probability: 0.05,
      tedious_score: 3,
      real_game_burden_score: 2,
      sensor_score: 4,
      effort_reward_fit_score: 4,
      perceived_expected_draws: 20,
      termination_reason: "target_match",
      engine_version: "motsuyoku-sensor-core@0.1.0",
      data_version: "v1",
      app_version: "0.2.0",
      research_protocol_version: "v3-coin",
      reveal_mode: "sequential",
      reveal_interval_ms: 400,
      active_duration_ms: 12000,
      resume_count: 0,
      draw_detail_count: 4,
      coin_initial: 100000,
      coin_used: 350,
      coin_remaining: 99650,
    },
    overrides
  );
}

function makeExperimentsSheet() {
  // EXPERIMENT_REQUIRED_KEYSをそのままヘッダーにする(このテストの目的はvalidation gatingの検証であり、
  // 実際の43列+v3列の並びそのものはこのテストの対象ではない)。
  return makeFakeSheet(
    [
      "experiment_id",
      "participant_id",
      "started_at",
      "finished_at",
      "duration_ms",
      "dataset_id",
      "enemy_id",
      "shape",
      "primary_effect_id",
      "desire_score",
      "draw_advance_mode",
      "success",
      "censored",
      "roll_count",
      "cutoff_draws",
      "batch_count",
      "theoretical_probability",
      "tedious_score",
      "real_game_burden_score",
      "sensor_score",
      "effort_reward_fit_score",
      "perceived_expected_draws",
      "termination_reason",
      "engine_version",
      "data_version",
      "app_version",
      "research_protocol_version",
      "reveal_mode",
      "reveal_interval_ms",
      "active_duration_ms",
      "resume_count",
      "draw_detail_count",
      "coin_initial",
      "coin_used",
      "coin_remaining",
      "submission_status",
      "submitted_at",
    ],
    []
  );
}

function makeValidDraw(overrides) {
  return Object.assign(
    {
      experiment_id: "exp-1",
      draw_index: 1,
      batch_index: 1,
      active_elapsed_ms: 100,
      wall_elapsed_ms: 100,
      dataset_id: "d",
      shape_id: "radial",
      primary_effect_id: "physical",
      primary_value_rank: 18,
      secondary_effect_id: null,
      secondary_value_rank: null,
      curse_id: "stamina_cost_up",
      target_match: false,
      gem_probability_exact: 0.05,
      gem_surprisal_bits: 4.32,
      coin_cost: 87,
      coin_remaining_after_draw: 99913,
      coin_cost_model_version: "d-normalized-surprisal-v1",
      draw_detail_schema_version: 2,
    },
    overrides
  );
}

// ---- doPost: request_type="experiment"のv3厳格validation(指示3節) ----

test("experiment_idだけのv3 payloadは、書き込まずexperiment_validation_failedを返す", () => {
  const env = loadCodeGs();
  const result = callDoPost(env, {
    request_type: "experiment",
    schema_version: "experiment-v3",
    payload: { experiment_id: "exp-1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "experiment_validation_failed");
  assert.ok(Array.isArray(result.missing_fields));
  assert.ok(result.missing_fields.includes("participant_id"));
  assert.ok(!result.missing_fields.includes("experiment_id"));
  // Experimentsシートには一切触れていない(open自体はされうるが、書き込みは発生しない)。
  assert.equal(env.sheetsByName["Experiments"], undefined);
});

test("必須keyが1つでも欠落していれば、書き込まずmissing_fieldsに欠落key名を返す", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());
  const payload = makeFullV3ExperimentPayload();
  delete payload.coin_used;

  const result = callDoPost(env, { request_type: "experiment", schema_version: "experiment-v3", payload });

  assert.equal(result.ok, false);
  assert.equal(result.error, "experiment_validation_failed");
  assert.deepEqual(result.missing_fields, ["coin_used"]);
  // ヘッダー行以外は書き込まれていない(データ行が増えていない)。
  assert.equal(env.sheetsByName["Experiments"]._grid.length, 1);
});

test("nullable keyがnullでも(keyそのものは存在する)、validationは通過して成功する", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());
  const payload = makeFullV3ExperimentPayload({
    success: false,
    censored: true,
    roll_count: null,
    cutoff_draws: 12,
    perceived_expected_draws: null,
  });

  const result = callDoPost(env, { request_type: "experiment", schema_version: "experiment-v3", payload });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  const sheet = env.sheetsByName["Experiments"];
  assert.equal(sheet._grid.length, 2); // header + 1 data row
});

test("完全なv3 payloadは成功し、submission_status='sent'がvalidation通過後にのみ付与される", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());
  const payload = makeFullV3ExperimentPayload();

  const result = callDoPost(env, { request_type: "experiment", schema_version: "experiment-v3", payload });

  assert.equal(result.ok, true);
  const sheet = env.sheetsByName["Experiments"];
  const headers = sheet._grid[0];
  const row = sheet._grid[1];
  assert.equal(row[headers.indexOf("submission_status")], "sent");
  assert.equal(row[headers.indexOf("experiment_id")], "exp-1");
});

test("request_type無しのlegacy payloadには厳格validationを適用せず、従来どおりexperiment_idのみ必須とする", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());

  // legacyクライアントはv3の34key中ごく一部しか送らない想定(後方互換を確認する)。
  const result = callDoPost(env, { experiment_id: "legacy-exp-1", theoretical_probability: 0.1 });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  const sheet = env.sheetsByName["Experiments"];
  assert.equal(sheet._grid.length, 2);
});

test("legacy payloadでもexperiment_idが無ければ従来どおり失敗する", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());

  const result = callDoPost(env, { theoretical_probability: 0.1 });

  assert.equal(result.ok, false);
  assert.equal(result.error, "experiment_id_required");
});

test("request_typeが'experiment'/'research_draws_chunk'以外の未知の文字列なら、legacyとして保存せずunknown_request_typeで拒否する", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());

  const result = callDoPost(env, { request_type: "some_typo", experiment_id: "exp-1" });

  assert.equal(result.ok, false);
  assert.equal(result.error, "unknown_request_type");
  // legacyとして誤って保存されていない(Experimentsシートにデータ行が増えていない)。
  assert.equal(env.sheetsByName["Experiments"]._grid.length, 1);
});

// ---- doPost: request_type="research_draws_chunk"(指示3節E) ----

test("body.experiment_idと一致しないdrawが1件でもあれば、chunk全体を失敗させ書き込まない", () => {
  const env = loadCodeGs();
  const result = callDoPost(env, {
    request_type: "research_draws_chunk",
    schema_version: "research-draw-v2",
    experiment_id: "exp-A",
    chunk_id: "exp-A:1-2",
    draws: [makeValidDraw({ draw_index: 1 }), makeValidDraw({ draw_index: 2, experiment_id: "exp-B" })],
  });

  assert.equal(result.ok, false);
  assert.equal(result.received, 2);
  assert.equal(result.inserted, 0);
  assert.equal(result.duplicates, 0);
  assert.ok(result.invalid_rows.some((r) => /experiment_id/.test(r.error)));
  // ResearchDrawsシート自体が作成されていない(setValuesまで到達していない)。
  assert.equal(env.sheetsByName["ResearchDraws"], undefined);
});

test("chunk sizeが上限(500)を超えるとchunk_too_largeで失敗する", () => {
  const env = loadCodeGs();
  const draws = [];
  for (let i = 1; i <= 501; i++) draws.push(makeValidDraw({ draw_index: i }));

  const result = callDoPost(env, {
    request_type: "research_draws_chunk",
    schema_version: "research-draw-v2",
    experiment_id: "exp-1",
    chunk_id: "exp-1:1-501",
    draws,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "chunk_too_large");
  assert.equal(result.received, 501);
  assert.equal(result.inserted, 0);
});

test("draw_indexが正の整数でない場合は不正rowとして扱い、chunk全体を失敗させる", () => {
  const env = loadCodeGs();
  const zeroResult = callDoPost(env, {
    request_type: "research_draws_chunk",
    experiment_id: "exp-1",
    draws: [makeValidDraw({ draw_index: 0 })],
  });
  assert.equal(zeroResult.ok, false);

  const negativeResult = callDoPost(env, {
    request_type: "research_draws_chunk",
    experiment_id: "exp-1",
    draws: [makeValidDraw({ draw_index: -1 })],
  });
  assert.equal(negativeResult.ok, false);

  const fractionalResult = callDoPost(env, {
    request_type: "research_draws_chunk",
    experiment_id: "exp-1",
    draws: [makeValidDraw({ draw_index: 1.5 })],
  });
  assert.equal(fractionalResult.ok, false);
});

test("有効なchunkは成功し、received === inserted + duplicatesを満たす", () => {
  const env = loadCodeGs();
  const result = callDoPost(env, {
    request_type: "research_draws_chunk",
    schema_version: "research-draw-v2",
    experiment_id: "exp-1",
    chunk_id: "exp-1:1-2",
    draws: [makeValidDraw({ draw_index: 1 }), makeValidDraw({ draw_index: 2 })],
  });

  assert.equal(result.ok, true);
  assert.equal(result.received, 2);
  assert.equal(result.inserted, 2);
  assert.equal(result.duplicates, 0);
  assert.equal(result.received, result.inserted + result.duplicates);
});

test("同じexperiment_id+draw_indexを2回送っても重複としてdedupeされ、行が増えない", () => {
  const env = loadCodeGs();
  callDoPost(env, {
    request_type: "research_draws_chunk",
    experiment_id: "exp-1",
    draws: [makeValidDraw({ draw_index: 1 })],
  });
  const second = callDoPost(env, {
    request_type: "research_draws_chunk",
    experiment_id: "exp-1",
    draws: [makeValidDraw({ draw_index: 1 })],
  });

  assert.equal(second.ok, true);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(env.sheetsByName["ResearchDraws"]._grid.length, 2); // header + 1 data row(重複分は増えない)
});

// ---- doGet: health check(維持) ----

test("doGetはhealth checkをそのまま返す", () => {
  const env = loadCodeGs();
  const result = JSON.parse(env.sandbox.doGet().getContent());
  assert.deepEqual(result, {
    ok: true,
    service: "butsuyoku-sensor-research",
    message: "Research endpoint is running.",
  });
});

// ---- 既存の純粋ロジック(前ラウンドから引き続き検証) ----

test("columnToLetter_は1始まりの列番号をA1形式の列名へ変換する", () => {
  const env = loadCodeGs();
  assert.equal(env.sandbox.columnToLetter_(1), "A");
  assert.equal(env.sandbox.columnToLetter_(26), "Z");
  assert.equal(env.sandbox.columnToLetter_(27), "AA");
  assert.equal(env.sandbox.columnToA1_(3, 5), "C5");
});

test("safeValue_はformula injectionを防止しつつ、null/配列/オブジェクトを適切に変換する", () => {
  const env = loadCodeGs();
  const safeValue_ = env.sandbox.safeValue_;
  assert.equal(safeValue_(null), "");
  assert.equal(safeValue_(undefined), "");
  assert.equal(safeValue_("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(safeValue_("+1"), "'+1");
  assert.equal(safeValue_("-1"), "'-1");
  assert.equal(safeValue_("@cmd"), "'@cmd");
  assert.equal(safeValue_("plain"), "plain");
  assert.equal(safeValue_(42), 42);
  assert.equal(safeValue_(true), true);
  assert.equal(safeValue_([1, 2]), "[1,2]");
});

test("setDerivedFormulas_はheader名から列を解決した絶対参照の数式文字列を生成する", () => {
  const env = loadCodeGs();
  const calls = [];
  const fakeSheet = {
    getRange: (row, col) => ({
      setFormula: (f) => calls.push({ row, col, formula: f }),
    }),
  };
  const headers = [
    "roll_count",
    "cutoff_draws",
    "success",
    "censored",
    "theoretical_probability",
    "expected_draws",
    "success_cdf_at_roll",
    "survival_probability_at_cutoff",
  ];
  env.sandbox.setDerivedFormulas_(fakeSheet, headers, 5);

  assert.equal(calls.length, 3);
  assert.equal(calls[0].formula, '=IFERROR(1/E5,"")');
  assert.equal(calls[1].formula, '=IF(AND(C5=TRUE,A5<>"",E5<>""),1-(1-E5)^A5,"")');
  assert.equal(calls[2].formula, '=IF(AND(D5=TRUE,B5<>"",E5<>""),(1-E5)^B5,"")');
});

test("既存experiment_idの重複送信は上書きせず、duplicate:trueのみ返す", () => {
  const env = loadCodeGs();
  env.setSheet("Experiments", makeExperimentsSheet());
  const payload = makeFullV3ExperimentPayload();

  const first = callDoPost(env, { request_type: "experiment", payload });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);

  const second = callDoPost(env, { request_type: "experiment", payload: makeFullV3ExperimentPayload({ coin_used: 999999 }) });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);

  const sheet = env.sheetsByName["Experiments"];
  const headers = sheet._grid[0];
  // 上書きされていない(1回目の値のまま)。
  assert.equal(sheet._grid[1][headers.indexOf("coin_used")], 350);
  assert.equal(sheet._grid.length, 2); // 行が増えていない
});
