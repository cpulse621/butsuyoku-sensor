import { useEffect, useState } from "react";
import type { ResearchExperiment } from "../storage/researchHistory";
import { downloadCSV, downloadJSON } from "../lib/download";
import { effectLabel, enemyLabel, drawAdvanceModeLabel } from "../i18n/labels";

interface Props {
  open: boolean;
  onClose: () => void;
  listExperiments: () => ResearchExperiment[];
  exportJSON: () => string;
  exportCSV: () => string;
  onDeleteAll: () => { ok: boolean; error?: string };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export function ResearchHistoryPanel({ open, onClose, listExperiments, exportJSON, exportCSV, onDeleteAll }: Props) {
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setExperiments(listExperiments());
      setDeleteError(null);
    }
  }, [open, listExperiments]);

  if (!open) return null;

  function handleDeleteAll() {
    const confirmed = window.confirm("この端末に保存されている研究履歴をすべて削除します。元に戻せません。よろしいですか？");
    if (!confirmed) return;
    const result = onDeleteAll();
    if (result.ok) {
      setExperiments([]);
      setDeleteError(null);
    } else {
      setDeleteError(result.error ?? "削除できませんでした");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="section-title">研究履歴（この端末のみ）</h3>
          <button type="button" className="link-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        {experiments.length === 0 && <p className="hint">まだ記録がありません。研究モードで実験を実施すると記録されます。</p>}

        {experiments.length > 0 && (
          <div className="history-list">
            {experiments.map((e) => (
              <div key={e.experiment_id} className="history-row">
                <div className="history-row__meta">{formatDateTime(e.started_at)}</div>
                <div className="history-row__enemy">{enemyLabel(e.enemy_id)}</div>
                <div className="history-row__target">
                  {effectLabel(e.target.primary_effect_id)}
                  {e.target.secondary_effect_id ? ` / 2op:${effectLabel(e.target.secondary_effect_id)}` : ""}
                </div>
                <div className="history-row__stats">
                  欲しさ{e.desire_score} / {e.success ? "成功" : "途中終了"} / 試行{e.success ? e.roll_count : e.cutoff_draws}回
                  {e.sensor_score !== null ? ` / センサー${e.sensor_score}` : ""}
                  {` / ${drawAdvanceModeLabel(e.draw_advance_mode).slice(0, 2)}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {deleteError && (
          <div className="blocker-box">
            <strong>記録できませんでした:</strong> {deleteError}
          </div>
        )}

        <div className="modal-panel__footer">
          <button
            type="button"
            className="secondary-button"
            disabled={experiments.length === 0}
            onClick={() => downloadJSON("motsuyoku_sensor_research_history", exportJSON())}
          >
            JSONで書き出す
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={experiments.length === 0}
            onClick={() => downloadCSV("motsuyoku_sensor_research_history", exportCSV())}
          >
            CSVで書き出す
          </button>
          <button type="button" className="danger-button" onClick={handleDeleteAll} disabled={experiments.length === 0}>
            研究履歴をすべて削除
          </button>
        </div>
      </div>
    </div>
  );
}
