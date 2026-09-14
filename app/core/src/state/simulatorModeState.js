// シミュレーターモードの状態管理。DrawEngine/ProbabilityEngineはResearchModeと完全に共有するが、
// こちらは理論確率・約1/N・ProbabilityBreakdown・10連の全結果をいつでも自由に表示してよい。

import { draw } from "../engine/drawEngine.js";
import { computeProbability } from "../engine/probabilityEngine.js";

export function createSimulatorModeSession({ dataset, target, rng }) {
  let lastResults = [];

  function pullTen() {
    lastResults = draw(dataset, 10, { rng });
    return lastResults;
  }

  function getProbabilityInfo() {
    if (!target) return null;
    return computeProbability(dataset, target);
  }

  function getLastResults() {
    return lastResults;
  }

  return { pullTen, getProbabilityInfo, getLastResults };
}
