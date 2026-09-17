// Vitest全体のセットアップ。IndexedDBはjsdomに実装が無いため、fake-indexeddbで代替する。
// テストごとに新しいIDBFactoryへ差し替え、storage/researchDrawsDb.ts側のモジュールレベルの
// DB接続キャッシュもリセットして、テスト間でIndexedDBの状態が漏れないようにする。
import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import { __resetDbConnectionForTests } from "./storage/researchDrawsDb";

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).indexedDB = new IDBFactory();
  __resetDbConnectionForTests();
});

// vitest.config.tsではtest.globals(jest風グローバル)を有効にしていないため、
// @testing-library/reactの自動cleanup(afterEachグローバルを検出して動く仕組み)が働かない。
// 明示的に呼び出すことで、同一ファイル内の複数testでrender()したDOMがdocument.bodyへ
// 残り続け、screen.*クエリが前のtestの要素まで拾ってしまう(要素が複数見つかるエラーになる)のを防ぐ。
afterEach(() => {
  cleanup();
});
