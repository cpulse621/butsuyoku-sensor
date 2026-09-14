import { useEffect, useState } from "react";
import type { SimulationSession } from "../storage/simulationHistory";
import { downloadCSV, downloadJSON } from "../lib/download";

interface Props {
  open: boolean;
  onClose: () => void;
  listSessions: () => SimulationSession[];
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

// MVP向けの簡易履歴一覧。個々のdraw詳細は表示せず、session単位の要約のみ。
export function HistoryPanel({ open, onClose, listSessions, exportJSON, exportCSV, onDeleteAll }: Props) {
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSessions(listSessions());
      setDeleteError(null);
    }
  }, [open, listSessions]);

  if (!open) return null;

  function handleDeleteAll() {
    const confirmed = window.confirm("この端末に保存されているシミュレーション履歴をすべて削除します。元に戻せません。よろしいですか？");
    if (!confirmed) return;
    const result = onDeleteAll();
    if (result.ok) {
      setSessions([]);
      setDeleteError(null);
    } else {
      setDeleteError(result.error ?? "削除できませんでした");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="section-title">シミュレーション履歴（この端末のみ）</h3>
          <button type="button" className="link-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        {sessions.length === 0 && <p className="hint">まだ記録がありません。Targetを設定して「10連する」を実行すると記録されます。</p>}

        {sessions.length > 0 && (
          <div className="history-list">
            {sessions.map((s) => (
              <div key={s.session_id} className="history-row">
                <div className="history-row__meta">{formatDateTime(s.started_at)}</div>
                <div className="history-row__enemy">{s.enemy_display_name}</div>
                <div className="history-row__target">{s.target_summary}</div>
                <div className="history-row__stats">
                  抽選 {s.total_draws}回 / 一致 {s.match_count}回
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
            disabled={sessions.length === 0}
            onClick={() => downloadJSON("motsuyoku_sensor_simulation_history", exportJSON())}
          >
            JSONで書き出す
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={sessions.length === 0}
            onClick={() => downloadCSV("motsuyoku_sensor_simulation_history", exportCSV())}
          >
            CSVで書き出す
          </button>
          <button type="button" className="danger-button" onClick={handleDeleteAll} disabled={sessions.length === 0}>
            履歴をすべて削除
          </button>
        </div>
      </div>
    </div>
  );
}
