import type { GemDataset } from "motsuyoku-sensor-core";
import { humanizeId } from "../lib/format";

interface Props {
  dataset: GemDataset;
  selected: string[];
  onToggle: (shapeId: string) => void;
  onSetAll: (shapeIds: string[]) => void;
}

export function ShapePicker({ dataset, selected, onToggle, onSetAll }: Props) {
  const allIds = dataset.shapeTable.entries.map((e) => e.shapeId);
  return (
    <div className="card">
      <div className="section-title-row">
        <h3 className="section-title">形状（Shape）</h3>
        <div className="mini-actions">
          <button type="button" className="link-button" onClick={() => onSetAll(allIds)}>
            全選択
          </button>
          <button type="button" className="link-button" onClick={() => onSetAll([])}>
            解除
          </button>
        </div>
      </div>
      <div className="chip-row">
        {dataset.shapeTable.entries.map((entry) => (
          <button
            key={entry.shapeId}
            type="button"
            className={`chip ${selected.includes(entry.shapeId) ? "chip--selected" : ""}`}
            aria-pressed={selected.includes(entry.shapeId)}
            onClick={() => onToggle(entry.shapeId)}
          >
            {humanizeId(entry.shapeId)}
          </button>
        ))}
      </div>
    </div>
  );
}
