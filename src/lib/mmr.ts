/**
 * MMR (Maximal Marginal Relevance) — 다양성 알고리즘
 *
 * 쿼리와 비슷하되 서로 너무 비슷하지 않은 결과를 선택
 * → 같은 시리즈 5개 연속 같은 문제 해결
 *
 * MMR = λ · sim(query, candidate) - (1-λ) · max(sim(candidate, selected))
 *   λ = 1.0: 다양성 없음 (원래 순위 그대로)
 *   λ = 0.5: 균형
 *   λ = 0.0: 최대 다양성 (관련성 무시)
 */

type Item = {
  id: string;
  similarity: number; // 쿼리와의 유사도 (이미 계산됨)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * MMR 재정렬
 * @param candidates 후보 리스트 (similarity 점수 포함)
 * @param pairwiseSim 두 후보 간 유사도 함수 (0~1)
 * @param topK 최종 선택 개수
 * @param lambda 관련성/다양성 균형 (기본 0.7 = 관련성 70%, 다양성 30%)
 */
export function mmrRerank<T extends Item>(
  candidates: T[],
  pairwiseSim: (a: T, b: T) => number,
  topK: number,
  lambda: number = 0.7,
): T[] {
  if (candidates.length === 0 || topK === 0) return [];
  if (candidates.length <= topK) return candidates.slice();

  const remaining = candidates.slice();
  const selected: T[] = [];

  // 첫 번째는 가장 유사도 높은 것
  remaining.sort((a, b) => b.similarity - a.similarity);
  selected.push(remaining.shift()!);

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];

      // 관련성 점수
      const relScore = cand.similarity;

      // 이미 선택된 것들과의 최대 유사도 → 다양성 페널티
      let maxSimToSelected = 0;
      for (const sel of selected) {
        const s = pairwiseSim(cand, sel);
        if (s > maxSimToSelected) maxSimToSelected = s;
      }

      // MMR 점수
      const mmr = lambda * relScore - (1 - lambda) * maxSimToSelected;

      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

/**
 * 원단명 기반 다양성 (같은 시리즈는 멀게)
 * "PS3026-01", "PS3026-02" → 시리즈 "PS3026" 같음 → 높은 유사도
 */
export function fabricNameSim(
  a: { name?: string; pattern_detail?: string | null; fabric_type?: string | null },
  b: { name?: string; pattern_detail?: string | null; fabric_type?: string | null },
): number {
  let sim = 0;
  if (a.name && b.name && a.name === b.name) sim += 0.6; // 같은 원단명 = 시리즈
  if (a.pattern_detail && b.pattern_detail && a.pattern_detail === b.pattern_detail) sim += 0.2;
  if (a.fabric_type && b.fabric_type && a.fabric_type === b.fabric_type) sim += 0.2;
  return Math.min(1, sim);
}
