// 3デブ (merciless_watchers) の Primary ValueSeries。仕様書 3.1節より転記。
// primaryRankTiers = [17, 18, 19] は、3.1節の全カーブがrank 17/18/19で表現されていることから
// 構造的に復元した値（5.1節にEnemyDefinition/primaryRankTiersの明示的記載は無い。
// 確率データそのものの補完ではなく、既存データの並びから機械的に読み取れる構造情報）。
//
// 3.5節の23項目のうち、3.1節にカーブが記載されているのは15項目 + dirty_rapid_poison/murky_slow_poison
// （R19のみ確定）の計17項目。残り6項目（radiant_stamina, fools_physical, pulsing_hp_regen,
// fools_all, nourishing, poorman_all）は3デブについて仕様書上ValueSeries情報が一切無いため、
// EffectValueBindingを登録しない（＝DrawEngineは通常どおりeffectId/rankを生成するが、
// displayValueはunknownとして扱われる。5.1節 completeness.displayValues: "partial" と整合）。

export const WatchersPrimaryRankTiers = Object.freeze([17, 18, 19]);

export const Curve_25_3_26_3_27_2 = {
  valueSeriesId: "watchers_curve_25_3_26_3_27_2",
  valuesByRank: {
    17: { value: 25.3, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    18: { value: 26.3, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    19: { value: 27.2, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  },
};

export const Curve_30_4_31_5_32_6 = {
  valueSeriesId: "watchers_curve_30_4_31_5_32_6",
  valuesByRank: {
    17: { value: 30.4, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    18: { value: 31.5, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    19: { value: 32.6, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  },
};

export const Curve_33_8_35_0_36_3 = {
  valueSeriesId: "watchers_curve_33_8_35_0_36_3",
  valuesByRank: {
    17: { value: 33.8, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    18: { value: 35.0, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
    19: { value: 36.3, verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
  },
};

export const DirtyRapidPoisonSeries = {
  valueSeriesId: "watchers_dirty_rapid_poison",
  valuesByRank: {
    17: { value: null, verificationStatus: "unknown" },
    18: { value: null, verificationStatus: "unknown" },
    19: { value: 21.7, verificationStatus: "confirmed", evidence: ["farm_validated"] },
  },
};

export const MurkySlowPoisonSeries = {
  valueSeriesId: "watchers_murky_slow_poison",
  valuesByRank: {
    17: { value: null, verificationStatus: "unknown" },
    18: { value: null, verificationStatus: "unknown" },
    19: { value: 18.1, verificationStatus: "confirmed", evidence: ["farm_validated"] },
  },
};

// 単位(unit)は仕様書中の表記（%表記 or +表記）からそのまま機械的に判定したもので、
// 確率データではなく表示フォーマットのみに影響する（DrawEngine/ProbabilityEngineの計算には無関係）。
const CURVE_1_EFFECTS = { physical: "percent", heavy_str_scaling: "scaling", sharp_skl_scaling: "scaling", fire: "percent", arcane: "percent", bolt: "percent", cold_arc_scaling: "scaling", warm_blt_scaling: "scaling" };
const CURVE_2_EFFECTS = { adept_blunt: "percent", adept_thrust: "percent", beasthunter: "percent", kinhunter: "percent", blood: "percent" };
const CURVE_3_EFFECTS = { striking_charge: "percent", poorman_physical: "percent" };

export const WatchersEffectValueBindings = [
  ...Object.entries(CURVE_1_EFFECTS).map(([effectId, unit]) => ({ slot: "primary", effectId, valueSeriesId: Curve_25_3_26_3_27_2.valueSeriesId, unit })),
  ...Object.entries(CURVE_2_EFFECTS).map(([effectId, unit]) => ({ slot: "primary", effectId, valueSeriesId: Curve_30_4_31_5_32_6.valueSeriesId, unit })),
  ...Object.entries(CURVE_3_EFFECTS).map(([effectId, unit]) => ({ slot: "primary", effectId, valueSeriesId: Curve_33_8_35_0_36_3.valueSeriesId, unit })),
  { slot: "primary", effectId: "dirty_rapid_poison", valueSeriesId: DirtyRapidPoisonSeries.valueSeriesId, unit: "buildup" },
  { slot: "primary", effectId: "murky_slow_poison", valueSeriesId: MurkySlowPoisonSeries.valueSeriesId, unit: "buildup" },
];

export const WatchersValueSeriesById = Object.fromEntries(
  [Curve_25_3_26_3_27_2, Curve_30_4_31_5_32_6, Curve_33_8_35_0_36_3, DirtyRapidPoisonSeries, MurkySlowPoisonSeries].map((s) => [s.valueSeriesId, s])
);
