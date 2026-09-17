/**
 * Colour vocabulary shared by the search UI (colour chips) and /api/search-v4 (colour channel + scoring).
 * The names are exactly the ones used in fabrics.notes ("아이보리:70,베이지:30|rgb:..."), so a chip maps 1:1 to
 * a `notes ilike '%name%'` candidate channel. `lab` is a representative CIE-LAB centre used when the user picks a
 * colour and the photo's own colour is not trusted (phone white-balance casts).
 */
export type ColorName = { name: string; hex: string; lab: number[]; aliases?: string[] };

export const COLOR_NAMES: ColorName[] = [
  { name: "화이트", hex: "#f5f5f5", lab: [96, 0, 1] },
  { name: "아이보리", hex: "#efe8d8", lab: [91, 0, 8] },
  { name: "베이지", hex: "#d6c3a5", lab: [79, 3, 18] },
  { name: "그레이", hex: "#9a9a9a", lab: [63, 0, 0] },
  { name: "차콜", hex: "#4a4a4a", lab: [32, 0, 0] },
  { name: "블랙", hex: "#1a1a1a", lab: [8, 0, 0] },
  { name: "브라운", hex: "#7b5236", lab: [40, 14, 24] },
  { name: "레드", hex: "#c0392b", lab: [45, 55, 35] },
  { name: "핑크", hex: "#e8a5b8", lab: [75, 28, 0] },
  { name: "오렌지", hex: "#e07b2a", lab: [62, 40, 60] },
  { name: "옐로우", hex: "#e0c040", lab: [78, 0, 65] },
  { name: "그린", hex: "#5f8f4e", lab: [54, -28, 30] },
  { name: "민트", hex: "#9fd3c7", lab: [80, -18, 0] },
  { name: "블루", hex: "#5a86c5", lab: [55, 3, -40] },
  { name: "네이비", hex: "#22304f", lab: [20, 5, -22] },
  { name: "퍼플", hex: "#7d5a9e", lab: [43, 25, -30] },
];

export const colorByName = (name: string | null | undefined): ColorName | undefined =>
  name ? COLOR_NAMES.find((c) => c.name === name.trim() || c.aliases?.includes(name.trim())) : undefined;

/**
 * Neighbouring catalogue colour names. Catalogue notes are noisy (an ivory fabric is often filed as 베이지, a navy
 * one as 차콜), so a user-chosen colour widens to its neighbours for the candidate channel and the name bonus.
 */
export const COLOR_NEIGHBORS: Record<string, string[]> = {
  화이트: ["아이보리", "그레이"],
  아이보리: ["화이트", "베이지", "그레이"],
  베이지: ["아이보리", "브라운", "옐로우"],
  그레이: ["차콜", "아이보리", "화이트", "민트"],
  차콜: ["그레이", "블랙", "네이비"],
  블랙: ["차콜", "네이비"],
  브라운: ["베이지", "오렌지", "레드"],
  레드: ["핑크", "오렌지", "브라운", "퍼플"],
  핑크: ["레드", "퍼플", "베이지"],
  오렌지: ["레드", "옐로우", "브라운"],
  옐로우: ["오렌지", "베이지", "그린"],
  그린: ["민트", "옐로우"],
  민트: ["그린", "블루", "그레이"],
  블루: ["네이비", "민트", "퍼플"],
  네이비: ["블루", "차콜", "블랙", "퍼플"],
  퍼플: ["네이비", "핑크", "블루"],
};
export const colorFamily = (name: string): string[] => [name, ...(COLOR_NEIGHBORS[name] || [])];
