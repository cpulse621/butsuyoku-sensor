// PthumeruShapeTable: トゥメル聖杯共通の形状抽選テーブル。
// 放射:三角:欠損 = 100:1:1（102分の100/1/1）。円は初期版では扱わない。
// この比率は仕様書本文には未転記だが、ユーザーが本セッション内で明示的に指定した固定値であり、
// 確率データの「未確定値」には当たらない（デザイン上の固定パラメータ）。

export const PthumeruShapeTable = {
  shapeTableId: "PthumeruShapeTable",
  entries: [
    { shapeId: "radial", weight: 100 },
    { shapeId: "triangle", weight: 1 },
    { shapeId: "waning", weight: 1 },
  ],
};
