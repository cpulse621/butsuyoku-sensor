import type { GemDataset } from "motsuyoku-sensor-core";

interface Props {
  datasets: GemDataset[];
  current: GemDataset;
  onSelect: (dataset: GemDataset) => void;
}

export function EnemyTabs({ datasets, current, onSelect }: Props) {
  return (
    <div className="enemy-tabs" role="tablist" aria-label="敵の選択">
      {datasets.map((ds) => (
        <button
          key={ds.datasetId}
          type="button"
          role="tab"
          aria-selected={ds.datasetId === current.datasetId}
          className={`enemy-tab ${ds.datasetId === current.datasetId ? "enemy-tab--active" : ""}`}
          onClick={() => onSelect(ds)}
        >
          {ds.enemy.displayName}
        </button>
      ))}
    </div>
  );
}
