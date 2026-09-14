// ブラウザ上でテキストをファイルとしてダウンロードさせる小さなユーティリティ。
// サーバーには一切送信しない(Blob + ObjectURL + <a download> のみ)。
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function downloadJSON(baseName: string, content: string): void {
  downloadTextFile(`${baseName}_${timestampForFilename()}.json`, content, "application/json");
}

export function downloadCSV(baseName: string, content: string): void {
  // Excel/Google SheetsでのUTF-8誤認識を避けるためBOMを付与する。
  downloadTextFile(`${baseName}_${timestampForFilename()}.csv`, `﻿${content}`, "text/csv");
}
