import { useEffect, useState } from "react";
import type { GemDataset } from "motsuyoku-sensor-core";
import { EvilSpiritDataset, MadmanDataset, WatchersDataset } from "motsuyoku-sensor-core";
import { SimulatorView } from "./SimulatorView";
import { ResearchView } from "./ResearchView";
import { retryAllUnsentResearchData } from "./services/retryUnsentData";

const DATASETS: GemDataset[] = [WatchersDataset, MadmanDataset, EvilSpiritDataset];

type AppMode = "simulator" | "research";

export default function App() {
  const [mode, setMode] = useState<AppMode>("simulator");
  const [dataset, setDataset] = useState<GemDataset>(WatchersDataset);

  // 起動時、およびオフライン→オンライン復帰時に、未送信のまま残っている研究データを
  // まとめて再送する(指示2節)。ExperimentsとResearchDrawsは完全に独立した再送経路であり、
  // 片方がsent/synced済みでももう片方が未完了なら再送される(詳細はretryAllUnsentResearchData参照)。
  // offline中は無理に送信せず、local-firstで保持する('online'イベントで改めて呼ばれる)。
  useEffect(() => {
    function retry() {
      void retryAllUnsentResearchData();
    }
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
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
