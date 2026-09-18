/**
 * 物欲センサー研究データ受信endpoint(Google Apps Script)。
 *
 * これは実際に稼働しているCode.gs(ユーザー提供、2026-09-18時点)をベースに、
 * v3(request_type routing・ResearchDraws受信・派生式のheader名解決)を統合したものです。
 * 既存のExperiments処理(SPREADSHEET_IDへの直接openById、experiment_idによる重複検知、
 * 空き行への書き込み、safeValue_によるformula injection対策、LockService)は
 * 実物のロジックをそのまま維持しています。
 *
 * 【本番反映前に必ず実行すること】
 * success_cdf_at_roll / survival_probability_at_cutoff が実際にどの列を参照しているかは、
 * 旧R1C1相対参照の値からの再構成であり、実際のヘッダー行との突き合わせはまだ済んでいません。
 * 下記 CDF_BOOLEAN_FIELD / CDF_ROLL_COUNT_FIELD / SURVIVAL_BOOLEAN_FIELD / SURVIVAL_CUTOFF_FIELD
 * の4定数が正しいか、下記2つの診断用関数(読み取り専用、書き込み一切なし)で確認してください。
 *   1. printDerivedFormulaFieldNames() … 実際に参照されている列名をLoggerへ出力する
 *   2. verifyDerivedFormulaMigration() … 既存行について、旧式の現在値と新式の計算値を突き合わせる
 * 両方で不一致が無いことを確認してから、このスクリプトを反映してください。
 *
 * 設計contract: docs/apps_script_v3_spec.md 参照。
 */

// ---- 設定(既存の値を維持) ----

const SPREADSHEET_ID = '1TouC8LQyB_10DwdxZxpaXfKmwiur7iKa9zijGxfT2i4';
const SHEET_NAME = 'Experiments';
const RESEARCH_DRAWS_SHEET_NAME = 'ResearchDraws';

const DERIVED_FIELDS = new Set([
  'expected_draws',
  'success_cdf_at_roll',
  'survival_probability_at_cutoff',
]);

// v3で新規追加するExperiments列の候補(docs/apps_script_v3_spec.md 1節)。
// 既存43列は削除・並べ替えしない。ここに列挙した列がヘッダー行に無ければ、右側へ追加する。
// coin_cost_model_version・draw_detail_schema_versionはResearchDraws側の列であり、
// Experimentsには含めない(draw_detail_statusと同様、永続列として持たない設計。8節参照)。
const EXPERIMENT_V3_COLUMNS = [
  'active_duration_ms',
  'resume_count',
  'termination_reason',
  'effort_reward_fit_score',
  'perceived_expected_draws',
  'coin_initial',
  'coin_used',
  'coin_remaining',
  'research_protocol_version',
  'reveal_mode',
  'reveal_interval_ms',
  'draw_detail_count',
];

// ResearchDrawsシートの列(固定順。docs/apps_script_v3_spec.md 1節)。
const RESEARCH_DRAWS_COLUMNS = [
  'experiment_id',
  'draw_index',
  'batch_index',
  'active_elapsed_ms',
  'wall_elapsed_ms',
  'dataset_id',
  'shape_id',
  'primary_effect_id',
  'primary_value_rank',
  'secondary_effect_id',
  'secondary_value_rank',
  'curse_id',
  'target_match',
  'gem_probability_exact',
  'gem_surprisal_bits',
  'coin_cost',
  'coin_remaining_after_draw',
  'coin_cost_model_version',
  'draw_detail_schema_version',
];

// success_cdf_at_roll / survival_probability_at_cutoff が実際に参照している列の"名前"。
// 旧R1C1相対参照(success_cdf_at_roll基準でRC[-7]/RC[-5]/RC[-2]、
// survival_probability_at_cutoff基準でRC[-7]/RC[-5]/RC[-3])を、
// theoretical_probability・ResearchExperiment型の既存フィールド名(success/censored/
// roll_count/cutoff_draws)から数式の構造(1-(1-p)^n / (1-p)^n)を手がかりに再構成したもの。
// 【要確認】実ヘッダー行との突き合わせ未確認。printDerivedFormulaFieldNames()の出力と
// 一致するか確認してから本番反映すること。
const PROBABILITY_FIELD = 'theoretical_probability'; // 両式のRC[-2]/RC[-3]
const CDF_BOOLEAN_FIELD = 'success'; // success_cdf_at_rollのRC[-7]
const CDF_ROLL_COUNT_FIELD = 'roll_count'; // success_cdf_at_rollのRC[-5]
const SURVIVAL_BOOLEAN_FIELD = 'censored'; // survival_probability_at_cutoffのRC[-7]
const SURVIVAL_CUTOFF_FIELD = 'cutoff_draws'; // survival_probability_at_cutoffのRC[-5]

// v3 envelope(request_type: "experiment")のみに適用する必須key一覧。
// これらのkeyが「存在すること」を検証する(値がnullであることは許容する。指示3節A項)。
// request_typeが無いlegacy POSTにはこの厳格validationを適用しない(後方互換。3節D項)。
const EXPERIMENT_REQUIRED_KEYS = [
  'experiment_id',
  'participant_id',
  'started_at',
  'finished_at',
  'duration_ms',
  'dataset_id',
  'enemy_id',
  'shape',
  'primary_effect_id',
  'desire_score',
  'draw_advance_mode',
  'success',
  'censored',
  'roll_count',
  'cutoff_draws',
  'batch_count',
  'theoretical_probability',
  'tedious_score',
  'real_game_burden_score',
  'sensor_score',
  'effort_reward_fit_score',
  'perceived_expected_draws',
  'termination_reason',
  'engine_version',
  'data_version',
  'app_version',
  'research_protocol_version',
  'reveal_mode',
  'reveal_interval_ms',
  'active_duration_ms',
  'resume_count',
  'draw_detail_count',
  'coin_initial',
  'coin_used',
  'coin_remaining',
];

// ResearchDraws chunkの1リクエストあたりの上限(docs/apps_script_v3_spec.md 3節: 通常250 / 上限500)。
const MAX_RESEARCH_DRAWS_CHUNK_SIZE = 500;

// ---- エントリポイント ----

function doGet() {
  return json_({
    ok: true,
    service: 'butsuyoku-sensor-research',
    message: 'Research endpoint is running.',
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(10000)) {
      return json_({
        ok: false,
        error: 'server_busy',
      });
    }

    if (!e || !e.postData || !e.postData.contents) {
      return json_({
        ok: false,
        error: 'empty_body',
      });
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return json_({
        ok: false,
        error: 'invalid_json: ' + parseError.message,
      });
    }

    // request_typeによるrouting(docs/apps_script_v3_spec.md 2節)。
    // request_typeが無い旧POSTは、後方互換のためexperimentとして扱う。
    // 旧クライアントはpayloadを直接POST bodyに入れていた(envelopeで包んでいなかった)ため、
    // その場合はbody自体をpayloadとみなす。
    const requestType = body.request_type;

    if (requestType === 'research_draws_chunk') {
      return json_(handleResearchDrawsChunk_(body));
    }

    if (requestType === 'experiment') {
      // 新v3 envelopeのみ、書き込み前に必須keyの存在を厳格にvalidationする(指示3節A・B項)。
      // 1件でも欠落していればSheetへ1セルも書き込まず、欠落key名を返す
      // (experiment_idさえあれば他が空欄でもsent扱いにしていた不具合の修正)。
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
      const missingFields = EXPERIMENT_REQUIRED_KEYS.filter(function (key) {
        return !payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, key);
      });
      if (missingFields.length > 0) {
        return json_({
          ok: false,
          error: 'experiment_validation_failed',
          missing_fields: missingFields,
        });
      }
      return json_(handleExperiment_(payload));
    }

    // request_typeが無いlegacy POSTには上記の厳格validationを適用しない(指示3節D項。
    // 既存pilot dataのクライアントを壊さないため)。experiment_id必須チェックのみ
    // handleExperiment_内の既存ロジックに委ねる。
    return json_(handleExperiment_(body));
  } catch (error) {
    return json_({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

// ---- Experiments(既存ロジックを維持) ----

// 既存の「headerごとにpayload[header]を読み、experiment_idでdedupeして1行書き込む」構造・
// 「空いている行への書き込み(無ければ末尾に1行追加)」・「重複はduplicate:trueで即return
// (上書きしない)」という挙動をそのまま維持する。v3の新規列は、ヘッダー行に無ければ
// 右側へ追加してから書き込む(既存43列の削除・並べ替えはしない)。
function handleExperiment_(payload) {
  if (!payload.experiment_id) {
    return {
      ok: false,
      error: 'experiment_id_required',
    };
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return {
      ok: false,
      error: 'sheet_not_found',
    };
  }

  ensureHeadersExist_(sheet, EXPERIMENT_V3_COLUMNS);

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  const experimentIdColumn = headers.indexOf('experiment_id') + 1;

  if (experimentIdColumn === 0) {
    return {
      ok: false,
      error: 'experiment_id_header_not_found',
    };
  }

  // 同じexperiment_idの二重送信を防ぐ(既存ロジック。上書きせず即duplicate:trueで返す)
  const existing = sheet
    .getRange(
      2,
      experimentIdColumn,
      Math.max(sheet.getMaxRows() - 1, 1),
      1
    )
    .createTextFinder(String(payload.experiment_id))
    .matchEntireCell(true)
    .findNext();

  if (existing) {
    return {
      ok: true,
      duplicate: true,
      experiment_id: payload.experiment_id,
    };
  }

  // A列 experiment_id が空いている最初の行を使用(既存ロジック)
  const idValues = sheet
    .getRange(2, experimentIdColumn, sheet.getMaxRows() - 1, 1)
    .getDisplayValues();

  const offset = idValues.findIndex(row => row[0] === '');

  let targetRow;

  if (offset >= 0) {
    targetRow = offset + 2;
  } else {
    sheet.insertRowAfter(sheet.getMaxRows());
    targetRow = sheet.getMaxRows();
  }

  const values = headers.map(header => {
    if (DERIVED_FIELDS.has(header)) {
      return null;
    }

    if (header === 'submission_status') {
      return 'sent';
    }

    if (header === 'submitted_at') {
      return new Date();
    }

    if (!(header in payload)) {
      return null;
    }

    return safeValue_(payload[header]);
  });

  sheet
    .getRange(targetRow, 1, 1, headers.length)
    .setValues([values]);

  setDerivedFormulas_(sheet, headers, targetRow);

  SpreadsheetApp.flush();

  return {
    ok: true,
    duplicate: false,
    experiment_id: payload.experiment_id,
    row: targetRow,
  };
}

// success_cdf_at_roll / survival_probability_at_cutoff / expected_draws を、
// header名から解決した列の"絶対参照"(A1形式、その行番号固定)で設定する
// (旧: RC[-1]等のR1C1相対参照)。v3列を右側へ追加しても、ここで参照する列は
// 既存43列内のheader名で毎回解決し直すため、参照先がずれることはない。
function setDerivedFormulas_(sheet, headers, row) {
  const probabilityCol = headers.indexOf(PROBABILITY_FIELD) + 1;
  const expectedCol = headers.indexOf('expected_draws') + 1;
  const cdfCol = headers.indexOf('success_cdf_at_roll') + 1;
  const survivalCol = headers.indexOf('survival_probability_at_cutoff') + 1;
  const cdfBooleanCol = headers.indexOf(CDF_BOOLEAN_FIELD) + 1;
  const cdfRollCountCol = headers.indexOf(CDF_ROLL_COUNT_FIELD) + 1;
  const survivalBooleanCol = headers.indexOf(SURVIVAL_BOOLEAN_FIELD) + 1;
  const survivalCutoffCol = headers.indexOf(SURVIVAL_CUTOFF_FIELD) + 1;

  const probRef = probabilityCol ? columnToA1_(probabilityCol, row) : null;

  if (probabilityCol && expectedCol) {
    sheet
      .getRange(row, expectedCol)
      .setFormula('=IFERROR(1/' + probRef + ',"")');
  }

  if (cdfCol && cdfBooleanCol && cdfRollCountCol && probabilityCol) {
    const b = columnToA1_(cdfBooleanCol, row);
    const n = columnToA1_(cdfRollCountCol, row);
    sheet
      .getRange(row, cdfCol)
      .setFormula(
        '=IF(AND(' + b + '=TRUE,' + n + '<>"",' + probRef + '<>""),1-(1-' + probRef + ')^' + n + ',"")'
      );
  }

  if (survivalCol && survivalBooleanCol && survivalCutoffCol && probabilityCol) {
    const b = columnToA1_(survivalBooleanCol, row);
    const n = columnToA1_(survivalCutoffCol, row);
    sheet
      .getRange(row, survivalCol)
      .setFormula(
        '=IF(AND(' + b + '=TRUE,' + n + '<>"",' + probRef + '<>""),(1-' + probRef + ')^' + n + ',"")'
      );
  }
}

function columnToA1_(colIndex1Based, row) {
  return columnToLetter_(colIndex1Based) + row;
}

function columnToLetter_(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ---- ResearchDraws(v3で新規追加) ----

function handleResearchDrawsChunk_(body) {
  const experimentId = body.experiment_id;
  const draws = body.draws;

  if (!experimentId || !Array.isArray(draws)) {
    return {
      ok: false,
      error: 'experiment_id_and_draws_required',
      received: 0,
      inserted: 0,
      duplicates: 0,
    };
  }

  // 指示3節E項: chunk sizeは最大500(docs/apps_script_v3_spec.md 3節)。
  if (draws.length > MAX_RESEARCH_DRAWS_CHUNK_SIZE) {
    return {
      ok: false,
      error: 'chunk_too_large',
      received: draws.length,
      inserted: 0,
      duplicates: 0,
    };
  }

  // 4節: 書き込み前に全rowをvalidationする。1件でも不正ならchunk全体を失敗させ、
  // setValuesを一切実行しない(部分書き込みをしない。クライアントが同じchunkを安全に再送できる)。
  // 指示3節E項: body.experiment_idと各draw.experiment_idの不一致も、他のmalformed rowと
  // 同様にchunk全体の失敗として扱う(誤った実験へのデータ混入を防ぐ)。
  const invalid = [];
  draws.forEach((draw, index) => {
    const error =
      validateResearchDrawRow_(draw) ||
      (draw && draw.experiment_id !== experimentId ? 'experiment_id does not match request body.experiment_id' : null);
    if (error) invalid.push({ index: index, draw_index: draw && draw.draw_index, error: error });
  });
  if (invalid.length > 0) {
    return {
      ok: false,
      error: 'validation_failed_for_' + invalid.length + '_row(s)',
      received: draws.length,
      inserted: 0,
      duplicates: 0,
      invalid_rows: invalid,
    };
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, RESEARCH_DRAWS_SHEET_NAME);
  ensureHeadersExist_(sheet, RESEARCH_DRAWS_COLUMNS);

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const experimentIdIdx = headers.indexOf('experiment_id');
  const drawIndexIdx = headers.indexOf('draw_index');

  // dedupeの正本はexperiment_id + draw_indexの複合キー(chunk_idではない。3節・8節)。
  // このexperiment_idの既存キーを1回だけ読み込み、Setで判定する。
  const existingKeys = readExistingCompositeKeys_(sheet, experimentIdIdx, drawIndexIdx, experimentId);

  const newRows = [];
  let duplicates = 0;
  draws.forEach(draw => {
    const key = draw.experiment_id + '::' + draw.draw_index;
    if (existingKeys.has(key)) {
      duplicates++;
      return;
    }
    existingKeys.add(key); // 同一chunk内での重複draw_indexも二重挿入しないようにする
    newRows.push(
      headers.map(header => {
        const value = draw[header];
        if (value === undefined || value === null) return '';
        return safeValue_(value);
      })
    );
  });

  // 5節: 1drawごとにappendしない。まとめてsetValuesで一括書き込みする。
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
    SpreadsheetApp.flush();
  }

  const inserted = newRows.length;
  const received = draws.length;
  // 3節・8節: chunk成功条件 received === inserted + duplicates。
  // ここでは構築のロジック上常に成り立つはずだが、念のため確認しログに残す
  // (不整合はサーバー側のバグを示す)。
  if (received !== inserted + duplicates) {
    Logger.log(
      'WARNING: research_draws_chunk count mismatch: received=' + received + ' inserted=' + inserted + ' duplicates=' + duplicates
    );
  }

  return { ok: true, received: received, inserted: inserted, duplicates: duplicates };
}

// 必須フィールドの型・存在チェック。malformedなrowを黙ってskipせず、chunk全体を失敗させるために使う。
function validateResearchDrawRow_(draw) {
  if (!draw || typeof draw !== 'object') return 'row is not an object';
  if (typeof draw.experiment_id !== 'string' || draw.experiment_id.length === 0) return 'experiment_id missing';
  if (typeof draw.draw_index !== 'number' || !Number.isInteger(draw.draw_index) || draw.draw_index <= 0)
    return 'draw_index must be a positive integer';
  if (typeof draw.batch_index !== 'number') return 'batch_index must be a number';
  if (typeof draw.active_elapsed_ms !== 'number') return 'active_elapsed_ms must be a number';
  if (typeof draw.wall_elapsed_ms !== 'number') return 'wall_elapsed_ms must be a number';
  if (typeof draw.dataset_id !== 'string') return 'dataset_id must be a string';
  if (typeof draw.shape_id !== 'string') return 'shape_id must be a string';
  if (typeof draw.primary_effect_id !== 'string') return 'primary_effect_id must be a string';
  if (typeof draw.primary_value_rank !== 'number') return 'primary_value_rank must be a number';
  if (draw.secondary_effect_id !== null && typeof draw.secondary_effect_id !== 'string') return 'secondary_effect_id must be string or null';
  if (draw.secondary_value_rank !== null && typeof draw.secondary_value_rank !== 'number') return 'secondary_value_rank must be number or null';
  if (typeof draw.curse_id !== 'string') return 'curse_id must be a string';
  if (typeof draw.target_match !== 'boolean') return 'target_match must be a boolean';
  if (typeof draw.gem_probability_exact !== 'number') return 'gem_probability_exact must be a number';
  if (typeof draw.gem_surprisal_bits !== 'number') return 'gem_surprisal_bits must be a number';
  if (draw.coin_cost !== null && typeof draw.coin_cost !== 'number') return 'coin_cost must be number or null';
  if (draw.coin_remaining_after_draw !== null && typeof draw.coin_remaining_after_draw !== 'number')
    return 'coin_remaining_after_draw must be number or null';
  if (draw.coin_cost_model_version !== null && typeof draw.coin_cost_model_version !== 'string')
    return 'coin_cost_model_version must be string or null';
  if (typeof draw.draw_detail_schema_version !== 'number') return 'draw_detail_schema_version must be a number';
  return null; // valid
}

// ---- 共通ヘルパー ----

function getOrCreateSheet_(spreadsheet, name) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  return sheet;
}

// requiredColumnsのうち、現在のヘッダー行に存在しないものを右側へ追加する。
// 新規シート(ヘッダー行が空)の場合は、そのままrequiredColumnsをヘッダーとして書き込む。
// 既存ヘッダーの並び・内容には一切触れない(既存43列の削除・並べ替えをしないため)。
function ensureHeadersExist_(sheet, requiredColumns) {
  const lastColumn = Math.max(sheet.getLastColumn(), 0);
  let headers = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  headers = headers.filter(v => v !== '');

  if (headers.length === 0) {
    sheet.getRange(1, 1, 1, requiredColumns.length).setValues([requiredColumns]);
    return;
  }

  const missing = requiredColumns.filter(col => headers.indexOf(col) === -1);
  if (missing.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
}

// 指定experiment_idについて、ResearchDrawsシートに既に存在する
// "experiment_id::draw_index" の複合キー集合を返す(dedupe判定用)。
function readExistingCompositeKeys_(sheet, experimentIdIdx, drawIndexIdx, experimentId) {
  const keys = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || experimentIdIdx === -1 || drawIndexIdx === -1) return keys;
  const numCols = Math.max(experimentIdIdx, drawIndexIdx) + 1;
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  values.forEach(row => {
    if (row[experimentIdIdx] === experimentId) {
      keys.add(row[experimentIdIdx] + '::' + row[drawIndexIdx]);
    }
  });
  return keys;
}

function safeValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    // Spreadsheetの数式として解釈されるのを防止
    if (/^[=+\-@]/.test(value)) {
      return "'" + value;
    }
  }

  return value;
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- 診断用(本番反映前に実行する。読み取りのみで書き込みは一切しない) ----

// success_cdf_at_roll / survival_probability_at_cutoff の旧R1C1相対参照が実際に
// 指していた列名をLoggerへ出力する。上記4定数(CDF_BOOLEAN_FIELD等)が正しいかを
// 目視で確認するための関数。Apps Scriptエディタで直接実行し、「実行数」>「ログを表示」で確認する。
function printDerivedFormulaFieldNames() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cdfIndex = headers.indexOf('success_cdf_at_roll'); // 0-indexed
  const survivalIndex = headers.indexOf('survival_probability_at_cutoff');

  Logger.log('headers.length = ' + headers.length);
  Logger.log('success_cdf_at_roll at column ' + (cdfIndex + 1) + ' (0-indexed ' + cdfIndex + ')');
  Logger.log('  RC[-7] -> "' + headers[cdfIndex - 7] + '"  (想定: ' + CDF_BOOLEAN_FIELD + ')');
  Logger.log('  RC[-5] -> "' + headers[cdfIndex - 5] + '"  (想定: ' + CDF_ROLL_COUNT_FIELD + ')');
  Logger.log('  RC[-2] -> "' + headers[cdfIndex - 2] + '"  (想定: ' + PROBABILITY_FIELD + ')');
  Logger.log('survival_probability_at_cutoff at column ' + (survivalIndex + 1) + ' (0-indexed ' + survivalIndex + ')');
  Logger.log('  RC[-7] -> "' + headers[survivalIndex - 7] + '"  (想定: ' + SURVIVAL_BOOLEAN_FIELD + ')');
  Logger.log('  RC[-5] -> "' + headers[survivalIndex - 5] + '"  (想定: ' + SURVIVAL_CUTOFF_FIELD + ')');
  Logger.log('  RC[-3] -> "' + headers[survivalIndex - 3] + '"  (想定: ' + PROBABILITY_FIELD + ')');
}

// 既存行について、旧R1C1式で現在シートに表示されている値と、新しいheader名ベースの
// ロジックで計算した値を突き合わせる。書き込みは一切しない。不一致があればLoggerへ出す。
function verifyDerivedFormulaMigration() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('no data rows');
    return;
  }

  const probabilityCol = headers.indexOf(PROBABILITY_FIELD) + 1;
  const cdfCol = headers.indexOf('success_cdf_at_roll') + 1;
  const survivalCol = headers.indexOf('survival_probability_at_cutoff') + 1;
  const cdfBooleanCol = headers.indexOf(CDF_BOOLEAN_FIELD) + 1;
  const cdfRollCountCol = headers.indexOf(CDF_ROLL_COUNT_FIELD) + 1;
  const survivalBooleanCol = headers.indexOf(SURVIVAL_BOOLEAN_FIELD) + 1;
  const survivalCutoffCol = headers.indexOf(SURVIVAL_CUTOFF_FIELD) + 1;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let mismatches = 0;

  values.forEach((row, i) => {
    const actualRow = i + 2;
    const p = probabilityCol ? row[probabilityCol - 1] : '';
    const b1 = cdfBooleanCol ? row[cdfBooleanCol - 1] : '';
    const n1 = cdfRollCountCol ? row[cdfRollCountCol - 1] : '';
    const b2 = survivalBooleanCol ? row[survivalBooleanCol - 1] : '';
    const n2 = survivalCutoffCol ? row[survivalCutoffCol - 1] : '';
    const oldCdf = cdfCol ? row[cdfCol - 1] : '';
    const oldSurvival = survivalCol ? row[survivalCol - 1] : '';

    const newCdf = b1 === true && n1 !== '' && p !== '' ? 1 - Math.pow(1 - p, n1) : '';
    const newSurvival = b2 === true && n2 !== '' && p !== '' ? Math.pow(1 - p, n2) : '';

    if (!valuesRoughlyEqual_(oldCdf, newCdf)) {
      mismatches++;
      Logger.log('row ' + actualRow + ' success_cdf_at_roll mismatch: old=' + oldCdf + ' new=' + newCdf);
    }
    if (!valuesRoughlyEqual_(oldSurvival, newSurvival)) {
      mismatches++;
      Logger.log('row ' + actualRow + ' survival_probability_at_cutoff mismatch: old=' + oldSurvival + ' new=' + newSurvival);
    }
  });

  Logger.log('verifyDerivedFormulaMigration done. mismatches = ' + mismatches);
}

function valuesRoughlyEqual_(a, b) {
  if (a === '' && b === '') return true;
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  return Math.abs(a - b) < 1e-9;
}
