// ============================================================================
// pthumeru_standard_primary_pool（BLOCKER #1 は解消済み）
// ============================================================================
// 2026-09-14、ユーザーより23項目全件のprobabilityPct(4桁精度)が提供された。
// evidence: "Pthumeru Ihyll gem pool reverse-engineering / farm-validated probability model"。
//
// 注記（要確認事項として下記にも記録、実装はブロックしない）:
// これは仕様書v0.12 3.5節が述べていた「Tomb Prospectors Hex Researchの直接datamine
// (evidence: game_param_datamined, verificationStatus: confirmed)」とは異なる出自の記述。
// pthumeru_standard_secondary_pool（3.5節）と同種のreverse-engineered/farm-validatedモデルの
// ため、本実装ではsecondary poolと同じ扱い(verificationStatus: "provisional",
// evidence: ["reverse_engineered", "farm_validated"])を踏襲した。これは推測ではなく、
// 仕様書内で既に採用されている同種データの前例に倣った一貫性のある判断。
// verificationStatusを"confirmed"に引き上げるべきかは、旧3.5節の記述との整合を含め
// 別途確認をお願いしたい。
//
// 個別値の合計(native 98.9067% + ooe 1.0931% = 99.9998%)は資料側の4桁丸めによる既知の誤差
// (3デブ検算時と同じ99.9998%)であり、Fidelity Contractの原則により再正規化しない。
// raw weightが別途判明すればそちらを優先する(EffectPoolEntry.weightは未設定のまま)。

export const PthumeruStandardPrimaryPoolSourceMeta = {
  sourceId: "user_provided_pthumeru_ihyll_gem_pool_reverse_engineering_2026_09_14",
  sourceType: "tool",
  verificationStatus: "provisional",
  sourcePrecision: "4_decimal_percent",
  appliesTo: ["effectPool.primary.probabilityPct"],
  evidence: ["reverse_engineered", "farm_validated"],
};

export const PthumeruStandardPrimaryPool = {
  effectPoolId: "pthumeru_standard_primary_pool",
  researchUseStatus: "allowed",
  sourceMeta: PthumeruStandardPrimaryPoolSourceMeta,
  nativeEntries: [
    { effectId: "physical", probabilityPct: 76.9845, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "adept_blunt", probabilityPct: 4.2045, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "adept_thrust", probabilityPct: 4.2045, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "striking_charge", probabilityPct: 4.2045, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "heavy_str_scaling", probabilityPct: 2.5479, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "sharp_skl_scaling", probabilityPct: 2.5479, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "radiant_stamina", probabilityPct: 2.5227, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "poorman_physical", probabilityPct: 0.8493, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "fools_physical", probabilityPct: 0.8409, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
  ],
  ooeEntries: [
    { effectId: "fire", probabilityPct: 0.3784, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "arcane", probabilityPct: 0.2943, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "bolt", probabilityPct: 0.2102, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "murky_slow_poison", probabilityPct: 0.0505, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "dirty_rapid_poison", probabilityPct: 0.0505, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "pulsing_hp_regen", probabilityPct: 0.0252, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "beasthunter", probabilityPct: 0.0168, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "kinhunter", probabilityPct: 0.0168, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "cold_arc_scaling", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "fools_all", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "nourishing", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "blood", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "warm_blt_scaling", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "poorman_all", probabilityPct: 0.0084, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
  ],
};

export const PTHUMERU_STANDARD_PRIMARY_POOL_KNOWN_EFFECT_IDS = Object.freeze([
  ...PthumeruStandardPrimaryPool.nativeEntries.map((e) => e.effectId),
  ...PthumeruStandardPrimaryPool.ooeEntries.map((e) => e.effectId),
]);
