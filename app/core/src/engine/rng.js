// シード可能な擬似乱数生成器 (mulberry32)。
// Monte Carloテストの再現性のために、本番用の Math.random ベースRNGとは別に用意する。
// どちらも同じ { next(): number } インターフェースを実装する。

export function createSeededRng(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function createDefaultRng() {
  return { next: () => Math.random() };
}
