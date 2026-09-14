// 仕様書 3.5節: pthumeru_standard_secondary_pool（v0.7で確率確定・v0.8でresearchUseStatus追加）。
// 19項目、nativeEntries 7 + ooeEntries 12、合計100.0000%。
// verificationStatus: "provisional"（reverse-engineeredモデル + 大規模実測裏付け）だが
// researchUseStatus: "allowed"（プールレベルでは研究モードのTarget候補に含めてよい、3.5節/7.1節）。

export const PthumeruStandardSecondaryPool = {
  effectPoolId: "pthumeru_standard_secondary_pool",
  researchUseStatus: "allowed",
  researchUseNote:
    "Tomb Prospectors reverse-engineered gem pool formula。2万個以上の実測血晶との高い一致が報告されている（仕様書3.5節）。個々のverificationStatusはprovisionalのまま。",
  nativeEntries: [
    { effectId: "odd_physical", probabilityPct: 41.2413, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "dense_durability", probabilityPct: 12.2499, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "radiant_stamina", probabilityPct: 12.2499, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "striking_charge", probabilityPct: 12.2499, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "open_foes", probabilityPct: 12.2499, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "poorman_physical", probabilityPct: 4.1241, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "fools_physical", probabilityPct: 4.0833, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
  ],
  ooeEntries: [
    { effectId: "murky_slow_poison", probabilityPct: 0.245, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "dirty_rapid_poison", probabilityPct: 0.245, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "rally_potential", probabilityPct: 0.2042, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "odd_bolt", probabilityPct: 0.2042, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "odd_fire", probabilityPct: 0.2042, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "pulsing_hp_regen", probabilityPct: 0.1225, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "beasthunter", probabilityPct: 0.0817, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "kinhunter", probabilityPct: 0.0817, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "odd_arcane", probabilityPct: 0.0408, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "fools_all", probabilityPct: 0.0408, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "odd_blood", probabilityPct: 0.0408, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
    { effectId: "poorman_all", probabilityPct: 0.0408, verificationStatus: "provisional", evidence: ["reverse_engineered", "farm_validated"] },
  ],
};
