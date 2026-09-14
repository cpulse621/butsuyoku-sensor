// TargetBloodGem との完全一致判定（仕様書 6節）。
// gemのsecondaryEffectId/secondaryValueRankがnull（3デブ等）でも、
// targetが secondaryEffectId/acceptedSecondaryRanks を指定していなければ単に無視する。

export function isMatch(gem, target) {
  if (gem.datasetId !== target.datasetId) return false;
  if (!target.acceptedShapes.includes(gem.shapeId)) return false;
  if (gem.primaryEffectId !== target.primaryEffectId) return false;
  if (!target.acceptedPrimaryRanks.includes(gem.primaryValueRank)) return false;

  if (target.secondaryEffectId) {
    if (gem.secondaryEffectId !== target.secondaryEffectId) return false;
  }
  if (target.acceptedSecondaryRanks) {
    if (!target.acceptedSecondaryRanks.includes(gem.secondaryValueRank)) return false;
  }

  if (!target.acceptedCurses.includes(gem.curseId)) return false;
  return true;
}
