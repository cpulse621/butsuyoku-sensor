import { useEffect, useState } from "react";
import type { SessionSummary } from "../storage/simulationHistory";

interface Props {
  open: boolean;
  onClose: () => void;
  listSessionSummaries: () => SessionSummary[];
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
export function HistoryPanel({ open, onClose, listSessionSummaries, onDeleteAll }: Props) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSummaries(listSessionSummaries());
      setDeleteError(null);
    }
  }, [open, listSessionSummaries]);

  if (!open) return null;

  function handleDeleteAll() {
    const confirmed = window.confirm("この端末に保存されている抽選履歴をすべて削除します。元に戻せません。よろしいですか？");
    if (!confirmed) return;
    const result = onDeleteAll();
    if (result.ok) {
      setSummaries([]);
      setDeleteError(null);
    } else {
      setDeleteError(result.error ?? "削除できませんでした");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="section-title">履歴（この端末のみ）</h3>
          <button type="button" className="link-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        {summaries.length === 0 && <p className="hint">まだ記録がありません。Targetを設定して「10連する」を実行すると記録されます。</p>}

        {summaries.length > 0 && (
          <div className="history-list">
            {summaries.map((s) => (
              <div key={s.session_id} className="history-row">
                <div className="history-row__meta">{formatDateTime(s.started_at)}</div>
                <div className="history-row__enemy">{s.enemy_display_name}</div>
                <div className="history-row__target">{s.target_summary}</div>
                <div className="history-row__stats">
                  抽選 {s.total_draws}回 / MATCH {s.match_count}回
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
          <button type="button" className="danger-button" onClick={handleDeleteAll} disabled={summaries.length === 0}>
            履歴をすべて削除
          </button>
        </div>
      </div>
    </div>
  );
}
