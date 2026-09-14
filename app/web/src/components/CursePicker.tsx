import type { CursePoolEntry } from "motsuyoku-sensor-core";
import { curseLabel } from "../i18n/labels";

interface Props {
  allCurses: CursePoolEntry[];
  eligibleCurseIds: Set<string>;
  primarySelected: boolean;
  selected: string[];
  onToggle: (curseId: string) => void;
  onSetAll: (curseIds: string[]) => void;
}

// CursePoolの6種を常に全部選択可能にはせず、Coreのeligibility(getEligibleCurses)に基づいて
// 成立しないCurseを選択不能(disabled)にする。呪いの実数値は仕様上未確定のためIDのみ表示する。
export function CursePicker({ allCurses, eligibleCurseIds, primarySelected, selected, onToggle, onSetAll }: Props) {
  return (
    <div className="card">
      <div className="section-title-row">
        <h3 className="section-title">許容デメリット（Curse）</h3>
        <div className="mini-actions">
          <button type="button" className="link-button" disabled={!primarySelected} onClick={() => onSetAll([...eligibleCurseIds])}>
            成立分を全選択
          </button>
          <button type="button" className="link-button" onClick={() => onSetAll([])}>
            解除
          </button>
        </div>
      </div>
      {!primarySelected && <p className="hint">1opを選択すると、成立するCurseが表示されます。</p>}
      <div className="chip-row chip-row--wrap">
        {allCurses.map((curse) => {
          const eligible = eligibleCurseIds.has(curse.curseId);
          const disabled = !primarySelected || !eligible;
          return (
            <button
              key={curse.curseId}
              type="button"
              className={`chip ${selected.includes(curse.curseId) ? "chip--selected" : ""} ${disabled ? "chip--disabled" : ""}`}
              aria-pressed={selected.includes(curse.curseId)}
              disabled={disabled}
              title={!eligible && primarySelected ? "現在の1op/2opの組み合わせでは成立しません" : undefined}
              onClick={() => onToggle(curse.curseId)}
            >
              {curseLabel(curse.curseId)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
