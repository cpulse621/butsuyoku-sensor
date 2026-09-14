// EnemyDefinition（仕様書 1.1節/5.2節/5.3節）。
// 3デブのenemyIdは仕様書内に明示的なEnemyDefinitionブロックが無いため、
// セッション内で言及されたBloodborne Wiki表記 "Merciless Watchers" から機械的に採番した識別子。
// （確率データの補完ではなく、単なる内部ID命名のため未確定値扱いはしない。将来仕様書に正式登録推奨。）

export const EnemyDefinitions = {
  watchers: {
    enemyId: "merciless_watchers",
    displayName: "3デブ",
    secondarySlot: "none",
    allowDuplicateSecondary: false,
  },
  madman: {
    enemyId: "labyrinth_madman",
    displayName: "貞子",
    secondarySlot: "selectable",
    allowDuplicateSecondary: false,
  },
  evilSpirit: {
    enemyId: "evil_labyrinth_spirit",
    displayName: "女幽霊",
    secondarySlot: "fixed",
    fixedSecondaryEffectId: "poorman_physical",
    allowDuplicateSecondary: true,
  },
};
