/**
 * 物欲センサー研究データ受信endpoint(Google Apps Script)。
 *
 * 重要: これは実際のGoogle Apps Scriptプロジェクトの現物(既存Code.gs)を直接確認せずに
 * docs/apps_script_v3_spec.md・docs/handoff.mdの合意事項から書き起こしたリファレンス実装です。
 * デプロイ前に、既存Code.gsの実際のExperiments処理(シート名・列の扱い・既存のヘルパー関数等)と
 * 突き合わせ、差分をレビューしてから反映してください。既存の43列・28件前後のデータ・
 * experiment_idによるdedupeロジックは、この実装でも保持するよう努めていますが、
 * 実際のシート構造(ヘッダー名の並び等)に合わせた微調整が必要になる可能性があります。
 *
 * 設計contract: docs/apps_script_v3_spec.md 参照。
 */

// ---- 設定 ----

const EXPERIMENTS_SHEET_NAME = "Experiments";
const RESEARCH_DRAWS_SHEET_NAME = "ResearchDraws";

// v3で新規追加するExperiments列の候補(docs/apps_script_v3_spec.md 1節)。
// 既存43列は削除・並べ替えしない。ここに列挙した列がヘッダー行に無ければ、右側へ追加する。
// draw_detail_statusは永続列として持たない(8節)ため、意図的に含めていない。
const EXPERIMENT_V3_COLUMNS = [
  "active_duration_ms",
  "resume_count",
  "termination_reason",
  "effort_reward_fit_score",
  "perceived_expected_draws",
  "initial_coin",
  "coin_used",
  "coin_remaining",
  "coin_cost_model_version",
  "research_protocol_version",
  "draw_detail_schema_version",
  "reveal_mode",
  "reveal_interval_ms",
  "draw_detail_count",
];

// ResearchDrawsシートの列(固定順。docs/apps_script_v3_spec.md 1節)。
const RESEARCH_DRAWS_COLUMNS = [
  "experiment_id",
  "draw_index",
  "batch_index",
  "active_elapsed_ms",
  "wall_elapsed_ms",
  "dataset_id",
  "shape_id",
  "primary_effect_id",
  "primary_value_rank",
  "secondary_effect_id",
  "secondary_value_rank",
  "curse_id",
  "target_match",
  "gem_probability_exact",
  "gem_surprisal_bits",
  "coin_cost",
  "coin_remaining_after_draw",
  "coin_cost_model_version",
  "draw_detail_schema_version",
];

// ---- エントリポイント ----

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid JSON body: " + err.message });
  }

  // request_typeが無い旧POSTは、後方互換のためexperimentとして扱う
  // (docs/apps_script_v3_spec.md 2節)。旧クライアントはpayloadを直接POST bodyに
  // 入れていた(envelopeで包んでいなかった)ため、その場合はdata自体をpayloadとみなす。
  const requestType = data.request_type || "experiment";

  try {
    if (requestType === "experiment") {
      const payload = data.payload || data; // envelope無しの旧形式はdata自体がpayload
      return jsonResponse(handleExperimentRequest(payload));
    }
    if (requestType === "research_draws_chunk") {
      return jsonResponse(handleResearchDrawsChunkRequest(data));
    }
    return jsonResponse({ ok: false, error: "unknown request_type: " + requestType });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Experiments ----

// 既存の「headerごとにpayload[header]を読み、experiment_idでdedupeして1行書き込む」構造を維持する。
// v3の新規列は、ヘッダー行に無ければ右側へ追加してから書き込む(既存43列の削除・並べ替えはしない)。
function handleExperimentRequest(payload) {
  const sheet = getSheetByName(EXPERIMENTS_SHEET_NAME);
  ensureHeadersExist(sheet, EXPERIMENT_V3_COLUMNS);

  const headers = getHeaderRow(sheet);
  const rowValues = headers.map(function (header) {
    const value = payload[header];
    return value === undefined || value === null ? "" : value;
  });

  const idColumnIndex = headers.indexOf("experiment_id");
  if (idColumnIndex === -1) {
    throw new Error('Experiments sheet header row has no "experiment_id" column');
  }
  const existingRowIndex = findRowIndexByValue(sheet, idColumnIndex, payload.experiment_id);

  if (existingRowIndex !== -1) {
    // 既存experiment_idの再送: 上書き更新する(既存のdedupeロジックを維持)。
    sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return { ok: true };
}

// ---- ResearchDraws ----

function handleResearchDrawsChunkRequest(data) {
  const experimentId = data.experiment_id;
  const draws = data.draws;

  if (!experimentId || !Array.isArray(draws)) {
    return { ok: false, error: "experiment_id and draws[] are required", received: 0, inserted: 0, duplicates: 0 };
  }

  // 4節: 書き込み前に全rowをvalidationする。1件でも不正ならchunk全体を失敗させ、setValuesしない。
  const invalid = [];
  draws.forEach(function (draw, index) {
    const error = validateResearchDrawRow(draw);
    if (error) invalid.push({ index: index, draw_index: draw && draw.draw_index, error: error });
  });
  if (invalid.length > 0) {
    return {
      ok: false,
      error: "validation failed for " + invalid.length + " row(s)",
      received: draws.length,
      inserted: 0,
      duplicates: 0,
      invalid_rows: invalid,
    };
  }

  const sheet = getSheetByName(RESEARCH_DRAWS_SHEET_NAME);
  ensureHeadersExist(sheet, RESEARCH_DRAWS_COLUMNS);
  const headers = getHeaderRow(sheet);
  const keyColumnIndexes = {
    experiment_id: headers.indexOf("experiment_id"),
    draw_index: headers.indexOf("draw_index"),
  };

  // dedupeの正本はexperiment_id + draw_indexの複合キー(chunk_idではない。3節・8節)。
  // このexperiment_idの既存キーを1回だけ読み込み、Setで判定する。
  const existingKeys = readExistingCompositeKeys(sheet, keyColumnIndexes, experimentId);

  const newRows = [];
  let duplicates = 0;
  draws.forEach(function (draw) {
    const key = draw.experiment_id + "::" + draw.draw_index;
    if (existingKeys.has(key)) {
      duplicates++;
      return;
    }
    existingKeys.add(key); // 同一chunk内での重複draw_indexも二重挿入しないようにする
    newRows.push(headers.map(function (header) {
      const value = draw[header];
      return value === undefined || value === null ? "" : value;
    }));
  });

  // 5節: 1drawごとにappendしない。まとめてsetValuesで一括書き込みする。
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
  }

  const inserted = newRows.length;
  const received = draws.length;
  // 3節: chunk成功条件 received === inserted + duplicates。ここでは構築のロジック上常に
  // 成り立つはずだが、念のため確認しログに残す(不整合はサーバー側のバグを示す)。
  if (received !== inserted + duplicates) {
    Logger.log(
      "WARNING: research_draws_chunk count mismatch: received=" + received + " inserted=" + inserted + " duplicates=" + duplicates
    );
  }

  return { ok: true, received: received, inserted: inserted, duplicates: duplicates };
}

// 必須フィールドの型・存在チェック。malformedなrowを黙ってskipせず、chunk全体を失敗させるために使う。
function validateResearchDrawRow(draw) {
  if (!draw || typeof draw !== "object") return "row is not an object";
  if (typeof draw.experiment_id !== "string" || draw.experiment_id.length === 0) return "experiment_id missing";
  if (typeof draw.draw_index !== "number") return "draw_index must be a number";
  if (typeof draw.batch_index !== "number") return "batch_index must be a number";
  if (typeof draw.active_elapsed_ms !== "number") return "active_elapsed_ms must be a number";
  if (typeof draw.wall_elapsed_ms !== "number") return "wall_elapsed_ms must be a number";
  if (typeof draw.dataset_id !== "string") return "dataset_id must be a string";
  if (typeof draw.shape_id !== "string") return "shape_id must be a string";
  if (typeof draw.primary_effect_id !== "string") return "primary_effect_id must be a string";
  if (typeof draw.primary_value_rank !== "number") return "primary_value_rank must be a number";
  if (draw.secondary_effect_id !== null && typeof draw.secondary_effect_id !== "string") return "secondary_effect_id must be string or null";
  if (draw.secondary_value_rank !== null && typeof draw.secondary_value_rank !== "number") return "secondary_value_rank must be number or null";
  if (typeof draw.curse_id !== "string") return "curse_id must be a string";
  if (typeof draw.target_match !== "boolean") return "target_match must be a boolean";
  if (typeof draw.gem_probability_exact !== "number") return "gem_probability_exact must be a number";
  if (typeof draw.gem_surprisal_bits !== "number") return "gem_surprisal_bits must be a number";
  if (draw.coin_cost !== null && typeof draw.coin_cost !== "number") return "coin_cost must be number or null";
  if (draw.coin_remaining_after_draw !== null && typeof draw.coin_remaining_after_draw !== "number")
    return "coin_remaining_after_draw must be number or null";
  if (draw.coin_cost_model_version !== null && typeof draw.coin_cost_model_version !== "string")
    return "coin_cost_model_version must be string or null";
  if (typeof draw.draw_detail_schema_version !== "number") return "draw_detail_schema_version must be a number";
  return null; // valid
}

// ---- 共通ヘルパー ----

function getSheetByName(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getHeaderRow(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  // 空セルを除去(末尾の未使用列を無視する)。
  return values.filter(function (v) { return v !== ""; });
}

// requiredColumnsのうち、現在のヘッダー行に存在しないものを右側へ追加する。
// 新規シート(ヘッダー行が空)の場合は、そのままrequiredColumnsをヘッダーとして書き込む。
function ensureHeadersExist(sheet, requiredColumns) {
  let headers = getHeaderRow(sheet);
  if (headers.length === 0) {
    sheet.getRange(1, 1, 1, requiredColumns.length).setValues([requiredColumns]);
    return;
  }
  const missing = requiredColumns.filter(function (col) { return headers.indexOf(col) === -1; });
  if (missing.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
}

// column(0-indexed)の値がtargetValueと一致する最初の行番号(1-indexed)を返す。無ければ-1。
function findRowIndexByValue(sheet, columnIndex, targetValue) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1; // ヘッダーのみ、データ行なし
  const values = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === targetValue) return i + 2; // 1-indexed、ヘッダー分+1
  }
  return -1;
}

// 指定experiment_idについて、ResearchDrawsシートに既に存在する
// "experiment_id::draw_index" の複合キー集合を返す(dedupe判定用)。
function readExistingCompositeKeys(sheet, keyColumnIndexes, experimentId) {
  const keys = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return keys;
  const numCols = Math.max(keyColumnIndexes.experiment_id, keyColumnIndexes.draw_index) + 1;
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  values.forEach(function (row) {
    const rowExperimentId = row[keyColumnIndexes.experiment_id];
    if (rowExperimentId === experimentId) {
      keys.add(rowExperimentId + "::" + row[keyColumnIndexes.draw_index]);
    }
  });
  return keys;
}
