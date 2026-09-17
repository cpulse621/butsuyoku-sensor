import { useEffect, useState } from "react";
import type { GemDataset } from "motsuyoku-sensor-core";
import { EvilSpiritDataset, MadmanDataset, WatchersDataset } from "motsuyoku-sensor-core";
import { SimulatorView } from "./SimulatorView";
import { ResearchView } from "./ResearchView";
import { retryAllPendingSubmissions } from "./services/researchSubmission";
import { syncResearchDrawsForExperiment } from "./services/researchDrawsSubmission";
import { listExperiments } from "./storage/researchHistory";

const DATASETS: GemDataset[] = [WatchersDataset, MadmanDataset, EvilSpiritDataset];

type AppMode = "simulator" | "research";

export default function App() {
  const [mode, setMode] = useState<AppMode>("simulator");
  const [dataset, setDataset] = useState<GemDataset>(WatchersDataset);

  // 起動時、送信先が設定されていて未送信(pending/failed)のまま残っている研究データがあれば
  // 安全に再送を試みる(同一experiment_idの再送・同一chunkの再送はApps Script側のdedupeに委ねる)。
  // ResearchDrawsは(draw_detail_statusのような永続的な送信状態を持たない設計のため)独立した
  // 「未送信」判定ができないが、Experiments側がpending/failedのexperiment_idはResearchDrawsも
  // 未送信である可能性が高いため、同じ対象へまとめて再送を試みておく(ヒューリスティック)。
  useEffect(() => {
    void retryAllPendingSubmissions();
    void (async () => {
      const atRisk = listExperiments().filter((e) => e.submission_status === "pending" || e.submission_status === "failed");
      for (const experiment of atRisk) {
        // eslint-disable-next-line no-await-in-loop
        await syncResearchDrawsForExperiment(experiment.experiment_id);
      }
    })();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>物欲センサー</h1>
        <p className="app-subtitle">DrawEngine / ProbabilityEngine / TargetMatcher は app/core に委譲</p>
      </header>

      <div className="mode-tabs" role="tablist" aria-label="モード選択">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "simulator"}
          className={`mode-tab ${mode === "simulator" ? "mode-tab--active" : ""}`}
          onClick={() => setMode("simulator")}
        >
          シミュレーター
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "research"}
          className={`mode-tab ${mode === "research" ? "mode-tab--active" : ""}`}
          onClick={() => setMode("research")}
        >
          研究モード
        </button>
      </div>

      {mode === "simulator" ? (
        <SimulatorView datasets={DATASETS} dataset={dataset} onSelectDataset={setDataset} />
      ) : (
        <ResearchView datasets={DATASETS} dataset={dataset} onSelectDataset={setDataset} />
      )}
    </div>
  );
}
