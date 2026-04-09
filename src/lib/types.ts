export interface Fabric {
  id: string
  name: string
  color_code: string
  price_per_yard: number | null
  width_mm: number | null
  pl_percent: number
  co_percent: number
  li_percent: number
  other_percent: number
  composition_note: string | null
  fabric_type: string | null
  pattern_detail: string | null
  usage_types: string[]
  features: string[]
  is_curtain_eligible: boolean
  is_flame_retardant: boolean
  image_url: string | null
  image_path: string | null
  embedding: number[] | null
  auto_classified: boolean
  created_at: string
}

export interface SearchResult extends Fabric {
  similarity: number
}
