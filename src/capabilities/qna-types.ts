export const observedQnaTypeLabels = {
  "11": "K-IFRS · 회계기준원",
  "12": "일반기업회계기준 · 회계기준원",
  "13": "K-IFRS · IFRS 해석위원회 논의결과",
  "14": "일반기업회계기준 · 신속처리질의",
  "15": "K-IFRS · 신속처리질의",
  "24": "일반기업회계기준 · 금융감독원",
  "25": "K-IFRS · 금융감독원",
} as const satisfies Readonly<Record<string, string>>;

export const defaultObservedQnaTypeIds = Object.keys(observedQnaTypeLabels);

export const qnaTypeLabel = (type: number | string): string =>
  (observedQnaTypeLabels as Readonly<Record<string, string>>)[String(type)] ?? `Q&A type ${type}`;

export const qnaTypeLabelsFor = (typeIds: Iterable<string>): Record<string, string> => {
  const labels: Record<string, string> = {};
  for (const typeId of typeIds) {
    labels[typeId] = qnaTypeLabel(typeId);
  }
  return labels;
};
