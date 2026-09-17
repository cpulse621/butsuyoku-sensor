interface Props {
  rollCount: number;
}

// Target Matchした瞬間の明確な状態通知(指示L節)。
// 「目的の血晶が出た」ことを分かりやすく伝えるのが目的で、派手なガチャ演出は行わない。
// Q1〜Q5回答前のため、理論確率・期待試行回数・不運度は一切表示しない。
// コイン(使用量・残高)はコインシステム未実装のため、実装され次第この下に追加する。
export function TargetMatchNotice({ rollCount }: Props) {
  return (
    <div className="card target-match-notice">
      <p className="target-match-notice__badge">目的の血晶を獲得しました</p>
      <p className="target-match-notice__roll">#{rollCount}（{rollCount}回目）</p>
    </div>
  );
}
