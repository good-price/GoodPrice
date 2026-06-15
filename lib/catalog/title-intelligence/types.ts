export type ProductCategory =
  | 'electronica'
  | 'gaming'
  | 'hogar'
  | 'cocina'
  | 'oficina'
  | 'deporte'
  | 'belleza'
  | 'bebes'
  | 'mascotas'
  | 'herramientas'

export interface TitleInput {
  amazonTitle: string
  category:    ProductCategory
  brand?:      string
}

export interface ExtractedAttributes {
  brand:       string
  model:       string
  productLine: string   // named product family when no alphanumeric model (Rambler, Joy-Con…)
  variant:     string   // capacity / size (20 oz, 1TB, 37 lbs)
  coreNoun:    string   // last-resort noun for shortTitle
  productType: string | null
}

export interface TitleOutput {
  amazonTitle: string
  title:       string
  shortTitle:  string
  confidence:  number  // 0.0–1.0
}
