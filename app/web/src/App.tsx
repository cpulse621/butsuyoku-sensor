import { useEffect, useState } from "react";
import type { GemDataset } from "motsuyoku-sensor-core";
import { EvilSpiritDataset, MadmanDataset, WatchersDataset } from "motsuyoku-sensor-core";
import { SimulatorView } from "./SimulatorView";
import { ResearchView } from "./ResearchView";
import { retryAllPendingSubmissions } from "./services/researchSubmission";

const DATASETS: GemDataset[] = [WatchersDataset, MadmanDataset, EvilSpiritDataset];

type AppMode = "simulator" | "research";

export default function App() {
  const [mode, setMode] = useState<AppMode>("simulator");
  const [dataset, setDataset] = useState<GemDataset>(WatchersDataset);

  // 起動時、送信先が設定されていて未送信(pending/failed)のまま残っている研究データがあれば
  // 安全に再送を試みる(同一experiment_idの再送はApps Script側のduplicate処理に委ねる)。
  useEffect(() => {
    void retryAllPendingSubmissions();
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
