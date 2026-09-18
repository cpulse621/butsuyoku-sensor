// 起動時・オンライン復帰時にまとめて呼ぶ、Experiments/ResearchDraws双方の再送オーケストレーション
// (指示2節)。両者は完全に独立した再送経路であることが重要: ExperimentsがsentでもResearchDrawsが
// 未完了なら再送し、逆にResearchDrawsが完了済みでもExperimentsがpending/failedなら再送する。
// 個々の再送ロジック(どのexperiment_idを対象にするか、synced済みをskipする等)は
// services/researchSubmission.ts・services/researchDrawsSubmission.tsにそれぞれ委ねる。
//
// offline中は無理に送信せず、local-firstで保持する(指示2節C項)。ここでnavigator.onLineを
// 確認してから初めて両方の再送を呼ぶことで、オフライン中の無駄なfetch失敗・
// submission_status/researchDrawsSyncStatusへの誤った"failed"記録を避ける。
// 実際の再試行は、呼び出し側(App.tsx)が起動時と'online'イベントの両方でこの関数を呼ぶことで担う。

import { retryAllPendingSubmissions } from "./researchSubmission";
import { retryAllUnsyncedResearchDraws } from "./researchDrawsSubmission";

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function retryAllUnsentResearchData(): Promise<void> {
  if (!isOnline()) return;
  await Promise.all([retryAllPendingSubmissions(), retryAllUnsyncedResearchDraws()]);
}
