// コインコスト計算のヘルパー(研究プロトコル層)。
//
// 重要: これはDrawEngine/ProbabilityEngineの一部ではない。coinは「客観的な努力量そのもの」
// ではなく、research protocol上の「有限resource / cost体験」として扱う設計方針のため、
// 意図的にCore(app/core)ではなくWeb側(研究プロトコル固有のロジック)に置いている。
// computeGemProbability/computeDatasetEntropyBits(Core)が返す値をそのまま使うだけで、
// 確率分布自体には一切手を加えない。
//
// 4方式(tier / raw surprisal / capped surprisal / dataset-normalized surprisal)を比較した結果、
// dataset-normalized surprisal(D)を採用方式として確定した。roundingはround、最低costは1coinで
// 確定した(round/floor/ceilの中でbaseからの系統的な乖離が最も小さく、base=100であれば
// minCost=1は実データ上ほぼ発動しないことをシミュレーションで確認済み)。
//
// COIN_COST_OPTIONS/INITIAL_COINは確定したproduction設定であり、Research modeのcoin消費へ
// 実際に配線されている(useResearchSession.ts)。各所へハードコードせず、必ずここを参照すること。
//
// baseとinitial coinは独立した研究条件ではなく、両者の比 initial_coin / base が
// 「平均的にどれだけのdrawに相当するcoin予算を用意するか(budget horizon)」を実質的に決める
// 1つのパラメータである(E[cost] = baseなので、期待値上は initial_coin / base 回のdrawで
// budgetを使い切る計算になる)。initial_coin=100,000・base=100なので、budget horizonは
// 平均的に約1,000draw相当。この値は当初、Target選択UIのresearchEligible上限
// (expected_draws<=1,000)と対応させて決めたものだが、2026-09-19にresearchEligibleの
// 確率による足切りは撤廃した(lib/researchEligibility.ts参照)。coinのbudget horizon自体は
// 独立した仕組みとして維持しており、低確率なTargetを選んだ場合は「Target Match前にcoinが
// 尽きる(coin_exhausted)」という形で実験が自然に終了する。

export const COIN_COST_MODEL_ID = "dataset_normalized_surprisal";
// このモデルの実装バージョン。式やパラメータの意味が変わったら上げる。
// ResearchDrawsのcoin_cost_model_versionへそのまま保存し、後から「どの式で計算されたcoin_costか」を
// 監査できるようにする。
export const COIN_COST_MODEL_VERSION = "d-normalized-surprisal-v1";

export type CoinRounding = "round" | "floor" | "ceil";

export interface CoinCostOptions {
  base: number;
  rounding: CoinRounding;
  // 0 coin消費のdrawが発生しないようにするための下限(指示: 0 coinになるdrawが発生しないように)。
  minCost: number;
}

// 確定したproduction設定(round + minCost=1 + base=100)。
// round/floor/ceilの中でbaseからの系統的な乖離が最も小さく(3データセットで1%未満)、
// base=100であればminCost=1は実データ上ほぼ発動しないことをシミュレーションで確認済み。
export const COIN_COST_OPTIONS: CoinCostOptions = {
  base: 100,
  rounding: "round",
  minCost: 1,
};

// 確定したproduction設定。budget horizon = INITIAL_COIN / COIN_COST_OPTIONS.base ≈ 1,000 draw相当。
// 500,000〜1,000,000は、現行のsequential reveal(400ms/件)・auto間隔(3〜5秒/10連)を踏まえると
// 1実験が長くなりすぎる可能性が高いため不採用とした。
export const INITIAL_COIN = 100000;

// I(g) = -log2(P(g))。1個の血晶の情報量(bit)。pが0以下の場合は定義できないため呼び出し側の責務でガードする。
export function surprisalBits(p: number): number {
  return -Math.log2(p);
}

function applyRounding(value: number, rounding: CoinRounding): number {
  switch (rounding) {
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "round":
      return Math.round(value);
  }
}

// cost = base × I(g) / H(dataset) を整数coinへ丸め、minCostで下限を保証する。
// E[I(g)] = H(dataset)であるため、丸め・下限適用前の理論上の平均costはbaseちょうどになる
// (round/floor/ceilいずれも実際の平均costのbaseからの乖離は3データセットで1%未満であることを
// シミュレーションで確認済み。roundが最も系統的な偏りが小さかったため採用する)。
export function computeNormalizedSurprisalCost(p: number, datasetEntropyBits: number, options: CoinCostOptions): number {
  if (!(p > 0) || !(datasetEntropyBits > 0)) {
    throw new RangeError(`computeNormalizedSurprisalCost: p(${p})とdatasetEntropyBits(${datasetEntropyBits})はともに正の数である必要がある`);
  }
  const raw = options.base * (surprisalBits(p) / datasetEntropyBits);
  const rounded = applyRounding(raw, options.rounding);
  return Math.max(options.minCost, rounded);
}
