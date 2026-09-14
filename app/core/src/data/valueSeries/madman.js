// 貞子 (labyrinth_madman) の Primary/Secondary ValueSeries。
// 数値はすべて仕様書 5.2.3節（R18のみ確定: Primary11項目 + Secondary9項目）と
// 5.2.4節（第一確定グループ, R16/R17/R18すべてconfirmed: Primary7項目 + Secondary9項目）から転記。
// Primary5項目（cold_arc_scaling, fools_all, nourishing, blood, poorman_all）と
// Secondary1項目（fools_all）はR18も含め仕様書上まったく数値が無いため、
// ValueSeries/EffectValueBindingを登録しない（DrawEngineの抽選自体には影響しない）。
//
// evidenceの割り当て規則（5.2.4節「evidenceの割り当て」より）:
//   - 全rank: game_param_datamined を基本evidenceとする
//   - R18: 全effectでfarm_validatedも追加
//   - R17: physical(primary)・striking_charge(secondary)のみfarm_validatedを追加、他はgame_param_dataminedのみ
//   - R16: 全effectでgame_param_dataminedのみ

export const MadmanPrimaryRankTiers = Object.freeze([16, 17, 18]);
export const MadmanSecondaryRankTiers = Object.freeze([16, 17, 18]);

// ---- 第一確定グループ: Primary 7項目（5.2.4節） ----
const FULL_CONFIRMED_PRIMARY = {
  physical: { 16: 19.5, 17: 20.3, 18: 21.0, r17Farm: true, unit: "percent" },
  adept_blunt: { 16: 23.4, 17: 24.3, 18: 25.2, r17Farm: false, unit: "percent" },
  adept_thrust: { 16: 23.4, 17: 24.3, 18: 25.2, r17Farm: false, unit: "percent" },
  striking_charge: { 16: 26.0, 17: 27.0, 18: 28.0, r17Farm: true, unit: "percent" },
  radiant_stamina: { 16: 6.5, 17: 6.8, 18: 7.0, r17Farm: false, unit: "percent_reduction" },
  fools_physical: { 16: 24.7, 17: 25.7, 18: 26.6, r17Farm: false, unit: "percent" },
  poorman_physical: { 16: 26.0, 17: 27.0, 18: 28.0, r17Farm: false, unit: "percent" },
};

// ---- 第一確定グループ: Secondary 9項目（5.2.4節） ----
const FULL_CONFIRMED_SECONDARY = {
  odd_physical: { 16: 17.6, 17: 18.2, 18: 18.9, r17Farm: false, unit: "scaling" },
  striking_charge: { 16: 11.7, 17: 12.2, 18: 12.6, r17Farm: true, unit: "percent" },
  dense_durability: { 16: 11.7, 17: 12.2, 18: 12.6, r17Farm: false, unit: "scaling" },
  open_foes: { 16: 11.7, 17: 12.2, 18: 12.6, r17Farm: false, unit: "percent" },
  poorman_physical: { 16: 11.7, 17: 12.2, 18: 12.6, r17Farm: false, unit: "percent" },
  fools_physical: { 16: 11.1, 17: 11.5, 18: 12.0, r17Farm: false, unit: "percent" },
  radiant_stamina: { 16: 2.9, 17: 3.0, 18: 3.2, r17Farm: false, unit: "percent_reduction" },
  beasthunter: { 16: 10.5, 17: 10.9, 18: 11.3, r17Farm: false, unit: "percent" },
  kinhunter: { 16: 10.5, 17: 10.9, 18: 11.3, r17Farm: false, unit: "percent" },
};

// ---- R18のみconfirmed: Primary 11項目（5.2.3節） ----
const R18_ONLY_PRIMARY = {
  warm_blt_scaling: { 18: 21, unit: "scaling" },
  fire: { 18: 21.0, unit: "percent" },
  heavy_str_scaling: { 18: 21, unit: "scaling" },
  sharp_skl_scaling: { 18: 21, unit: "scaling" },
  arcane: { 18: 21.0, unit: "percent" },
  pulsing_hp_regen: { 18: 4, unit: "hp_regen" },
  kinhunter: { 18: 25.2, unit: "percent" },
  beasthunter: { 18: 25.2, unit: "percent" },
  bolt: { 18: 21.0, unit: "percent" },
  dirty_rapid_poison: { 18: 16.8, unit: "buildup" },
  murky_slow_poison: { 18: 14, unit: "buildup" },
};

// ---- R18のみconfirmed: Secondary 9項目（5.2.3節） ----
const R18_ONLY_SECONDARY = {
  poorman_all: { 18: 10.3, unit: "percent" },
  murky_slow_poison: { 18: 6.3, unit: "buildup" },
  dirty_rapid_poison: { 18: 7.5, unit: "buildup" },
  odd_arcane: { 18: 31.5, unit: "scaling" },
  odd_fire: { 18: 31.5, unit: "scaling" },
  odd_bolt: { 18: 31.5, unit: "scaling" },
  odd_blood: { 18: 14.6, unit: "scaling" },
  pulsing_hp_regen: { 18: 2, unit: "hp_regen" },
  rally_potential: { 18: 6.3, unit: "percent" },
};

// 完全TBD（R18も含め仕様書上まったく数値が無い。ValueSeries/Bindingを登録しない）
export const MadmanFullyTbdPrimaryEffectIds = Object.freeze(["cold_arc_scaling", "fools_all", "nourishing", "blood", "poorman_all"]);
export const MadmanFullyTbdSecondaryEffectIds = Object.freeze(["fools_all"]);

function buildFullSeries(idPrefix, effectId, data) {
  return {
    valueSeriesId: `${idPrefix}_${effectId}`,
    valuesByRank: {
      16: { value: data[16], verificationStatus: "confirmed", evidence: ["game_param_datamined"] },
      17: {
        value: data[17],
        verificationStatus: "confirmed",
        evidence: data.r17Farm ? ["game_param_datamined", "farm_validated"] : ["game_param_datamined"],
      },
      18: { value: data[18], verificationStatus: "confirmed", evidence: ["game_param_datamined", "farm_validated"] },
    },
  };
}

function buildR18OnlySeries(idPrefix, effectId, data) {
  return {
    valueSeriesId: `${idPrefix}_${effectId}`,
    valuesByRank: {
      16: { value: null, verificationStatus: "unknown" },
      17: { value: null, verificationStatus: "unknown" },
      18: { value: data[18], verificationStatus: "confirmed", evidence: ["farm_validated"] },
    },
  };
}

const primaryEntries = [
  ...Object.entries(FULL_CONFIRMED_PRIMARY).map(([effectId, data]) => ({ effectId, unit: data.unit, series: buildFullSeries("madman_primary", effectId, data) })),
  ...Object.entries(R18_ONLY_PRIMARY).map(([effectId, data]) => ({ effectId, unit: data.unit, series: buildR18OnlySeries("madman_primary", effectId, data) })),
];

const secondaryEntries = [
  ...Object.entries(FULL_CONFIRMED_SECONDARY).map(([effectId, data]) => ({ effectId, unit: data.unit, series: buildFullSeries("madman_secondary", effectId, data) })),
  ...Object.entries(R18_ONLY_SECONDARY).map(([effectId, data]) => ({ effectId, unit: data.unit, series: buildR18OnlySeries("madman_secondary", effectId, data) })),
];

export const MadmanEffectValueBindings = [
  ...primaryEntries.map(({ effectId, unit, series }) => ({ slot: "primary", effectId, valueSeriesId: series.valueSeriesId, unit })),
  ...secondaryEntries.map(({ effectId, unit, series }) => ({ slot: "secondary", effectId, valueSeriesId: series.valueSeriesId, unit })),
];

export const MadmanValueSeriesById = Object.fromEntries(
  [...primaryEntries, ...secondaryEntries].map(({ series }) => [series.valueSeriesId, series])
);
