// 女幽霊 (evil_labyrinth_spirit) の Primary/FixedSecondary ValueSeries。
// 仕様書 5.3.2節「ValueTable系列の逆転」: ランダムprimaryはSec.1系列、固定secondaryはPrim.1系列を使う。
// 女幽霊専用のDrawEngine分岐は作らず、EffectValueBindingのslotごとの参照先切り替えだけで表現する（3.3節）。
//
// R17のみconfirmed（5.3.3節・5.3.4節の実ドロップ3例より）。R15/R16は manastone_effect 上の
// 候補値（25%/26%）が存在するが、女幽霊の各Ratingへの直接対応が未確認のためunknownのまま保持し、
// 逆算・按分では埋めない（Fidelity Contract「未確定データを理由に確率分布を変更しない」原則）。
// 候補値そのものも value フィールドには入れず、コメントとしてのみ記録する。

export const EvilSpiritPrimaryRankTiers = Object.freeze([15, 16, 17]);
// fixedSecondaryのValue Rank候補（種類は固定だがRankはprimaryと独立抽選、5.3節）
export const EvilSpiritSecondaryRankTiers = Object.freeze([15, 16, 17]);

// Primary（Sec.1系列, 3項目, R17のみconfirmed）
const PRIMARY_SEC1 = {
  physical: 9.1,
  striking_charge: 12.2,
  poorman_physical: 12.2,
};

function buildEvilSpiritPrimarySeries(effectId, r17Value) {
  return {
    valueSeriesId: `evil_spirit_primary_${effectId}_sec1series`,
    valuesByRank: {
      15: { value: null, verificationStatus: "unknown" },
      16: { value: null, verificationStatus: "unknown" },
      17: { value: r17Value, verificationStatus: "confirmed", evidence: ["farm_validated"] },
    },
  };
}

export const EvilSpiritPrimarySeriesByEffectId = Object.fromEntries(
  Object.entries(PRIMARY_SEC1).map(([effectId, r17Value]) => [effectId, buildEvilSpiritPrimarySeries(effectId, r17Value)])
);

// Fixed Secondary（poorman_physical固定, Prim.1系列, R17のみconfirmed）
// R15=25%・R16=26%は候補値（manastone_effect上のPrim.1候補系列）としてのみ存在。unknownのまま保持。
export const EvilSpiritFixedSecondarySeries = {
  valueSeriesId: "evil_spirit_fixed_secondary_poorman_physical_prim1series",
  valuesByRank: {
    15: { value: null, verificationStatus: "unknown" }, // 候補値25%は直接対応未確認
    16: { value: null, verificationStatus: "unknown" }, // 候補値26%は直接対応未確認
    17: { value: 27, verificationStatus: "confirmed", evidence: ["farm_validated"] },
  },
};

export const EvilSpiritEffectValueBindings = [
  ...Object.entries(EvilSpiritPrimarySeriesByEffectId).map(([effectId, series]) => ({
    slot: "primary",
    effectId,
    valueSeriesId: series.valueSeriesId,
    unit: "percent",
    displayFormat: { showSign: true }, // 仕様書5.3.3節の表記("+9.1%"等)に合わせる
  })),
  {
    slot: "secondary",
    effectId: "poorman_physical",
    valueSeriesId: EvilSpiritFixedSecondarySeries.valueSeriesId,
    unit: "percent",
  },
];

export const EvilSpiritValueSeriesById = Object.fromEntries(
  [...Object.values(EvilSpiritPrimarySeriesByEffectId), EvilSpiritFixedSecondarySeries].map((s) => [s.valueSeriesId, s])
);
