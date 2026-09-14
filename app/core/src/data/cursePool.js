// 仕様書 1.3節: PthumeruStandardCursePool と conflictGroupSetRef "pthumeru_common_conflict_groups"。
// 全項目 weight: 1 / evidence: ["game_param_datamined"]（確定データ）。

export const PthumeruStandardCursePool = {
  cursePoolId: "pthumeru_standard_curse_pool",
  entries: [
    { curseId: "stamina_cost_up", weight: 1, evidence: ["game_param_datamined"] },
    { curseId: "kin_attack_down", weight: 1, evidence: ["game_param_datamined"] },
    { curseId: "beast_attack_down", weight: 1, evidence: ["game_param_datamined"] },
    { curseId: "durability_down", weight: 1, evidence: ["game_param_datamined"] },
    { curseId: "hp_deplete", weight: 1, evidence: ["game_param_datamined"] },
    { curseId: "attack_down", weight: 1, evidence: ["game_param_datamined"] },
  ],
};

export const PthumeruCommonConflictGroups = {
  conflictGroupSetId: "pthumeru_common_conflict_groups",
  groups: [
    { conflictGroupId: "stamina", positiveEffectId: "radiant_stamina", negativeCurseId: "stamina_cost_up" },
    { conflictGroupId: "kin", positiveEffectId: "kinhunter", negativeCurseId: "kin_attack_down" },
    { conflictGroupId: "beast", positiveEffectId: "beasthunter", negativeCurseId: "beast_attack_down" },
    { conflictGroupId: "durability", positiveEffectId: "dense_durability", negativeCurseId: "durability_down" },
    { conflictGroupId: "hp_regen", positiveEffectId: "pulsing_hp_regen", negativeCurseId: "hp_deplete" },
    { conflictGroupId: "attack_up", positiveEffectId: "nourishing", negativeCurseId: "attack_down" },
  ],
};
