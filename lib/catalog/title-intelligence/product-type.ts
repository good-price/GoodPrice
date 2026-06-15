/**
 * Product type detection and benefit mapping.
 *
 * Detection uses word-boundary regex for every keyword, preventing substring
 * false-positives like "mic" inside "ergonomic" or "rug" inside "rugs".
 *
 * Ordering rule: more specific / domain-specific entries come before generic
 * ones. Pet/mascota types appear before generic home (hogar) types so that
 * "lint roller" is never shadowed by "rug".
 */

// ── Keyword testing ────────────────────────────────────────────────────────────

function testKeyword(lower: string, kw: string): boolean {
  const trimmed = kw.trim()
  const escaped = trimmed
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
  // Add word boundaries only when the keyword starts/ends with an alphanumeric char
  const startBound = /^[A-Za-z0-9]/.test(trimmed) ? '\\b' : ''
  const endBound   = /[A-Za-z0-9]$/.test(trimmed) ? '\\b' : ''
  return new RegExp(`${startBound}${escaped}${endBound}`, 'i').test(lower)
}

// ── Detection map ─────────────────────────────────────────────────────────────

export const PRODUCT_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  // ── Electrónica ────────────────────────────────────────────────────────────
  { type: 'ssd',            keywords: ['ssd', 'solid state', 'nvme', 'solid-state'] },
  { type: 'headphones',     keywords: ['headphones', 'headset', 'over-ear', 'on-ear'] },
  { type: 'earbuds',        keywords: ['earbuds', 'in-ear earbuds', 'true wireless earbuds'] },
  { type: 'speaker',        keywords: ['bluetooth speaker', 'soundbar', 'sound bar', 'portable speaker'] },
  { type: 'monitor',        keywords: ['monitor', 'led display', 'computer screen'] },
  { type: 'keyboard',       keywords: ['keyboard', 'mechanical keyboard', 'wireless keyboard'] },
  { type: 'mouse',          keywords: ['wireless mouse', 'gaming mouse', 'performance mouse', 'trackball'] },
  { type: 'webcam',         keywords: ['webcam', 'web camera', 'streaming camera'] },
  { type: 'microphone',     keywords: ['microphone', 'mic', 'condenser mic', 'streaming mic'] },
  { type: 'smartwatch',     keywords: ['smartwatch', 'smart watch', 'fitness watch', 'fitness tracker'] },
  { type: 'router',         keywords: ['router', 'mesh wifi', 'mesh wi-fi', 'wifi router', 'wi-fi router'] },
  { type: 'streaming',      keywords: ['streaming stick', 'streaming device', 'fire stick'] },
  { type: 'tv-mount',       keywords: ['tv mount', 'tv wall mount', 'television mount', 'monitor mount'] },
  { type: 'outlet',         keywords: ['outlet concealer', 'power strip', 'surge protector', 'socket concealer'] },
  // ── Gaming ─────────────────────────────────────────────────────────────────
  { type: 'controller',     keywords: ['controller', 'gamepad', 'joy-con', 'joystick'] },
  { type: 'game',           keywords: ['video game', 'game disc', '(us version)', 'mario', 'zelda', 'pikmin', 'pokemon'] },
  // ── Mascotas — checked BEFORE generic hogar to prevent false positives ─────
  { type: 'lint-roller',    keywords: ['lint roller', 'pet hair remover', 'fur remover', 'hair remover'] },
  { type: 'pee-pads',       keywords: ['pee pad', 'puppy pad', 'training pad', 'whelping pad'] },
  { type: 'pet-clothing',   keywords: ['dog hoodie', 'dog sweater', 'pet jacket', 'dog coat'] },
  { type: 'pet-bed',        keywords: ['dog bed', 'cat bed', 'pet bed', 'orthopedic dog bed'] },
  { type: 'pet-harness',    keywords: ['dog harness', 'pet harness', 'cat harness', 'no-pull harness'] },
  { type: 'cat-litter',     keywords: ['cat litter', 'clumping litter', 'litter box'] },
  { type: 'pet-pool',       keywords: ['dog pool', 'pet pool', 'dog bath pool', 'pet bath'] },
  { type: 'pet-playpen',    keywords: ['dog playpen', 'pet playpen', 'puppy pen', 'pet pen'] },
  { type: 'aquarium',       keywords: ['aquarium kit', 'fish tank', 'aquarium led'] },
  { type: 'aquarium-filter',keywords: ['canister filter', 'aquarium filter', 'fish filter'] },
  // ── Hogar ──────────────────────────────────────────────────────────────────
  { type: 'air-purifier',   keywords: ['air purifier', 'hepa filter purifier', 'air cleaner'] },
  { type: 'air-filter',     keywords: ['air filter', 'furnace filter', 'merv'] },
  { type: 'fan',            keywords: ['tower fan', 'standing fan', 'bladeless fan', 'desk fan', 'ceiling fan'] },
  { type: 'bug-zapper',     keywords: ['bug zapper', 'mosquito zapper', 'fly zapper', 'fly trap', 'insect trap'] },
  { type: 'mattress',       keywords: ['mattress', 'memory foam mattress', 'bed mattress'] },
  { type: 'sheets',         keywords: ['sheet set', 'bed sheet', 'fitted sheet', 'bedding set'] },
  { type: 'pillow',         keywords: ['bed pillow', 'sleeping pillow', 'down pillow', 'down alternative pillow'] },
  { type: 'curtains',       keywords: ['blackout curtains', 'blackout drapes', 'window drapes', 'window panel', 'room darkening'] },
  { type: 'rug',            keywords: ['area rug', 'runner rug', 'hallway rug', 'washable rug', 'entryway rug'] },
  { type: 'door-mat',       keywords: ['door mat', 'doormat', 'entryway mat'] },
  { type: 'shade-sail',     keywords: ['shade sail', 'sun shade', 'sunshade sail'] },
  // ── Cocina ─────────────────────────────────────────────────────────────────
  { type: 'tumbler',        keywords: ['tumbler', 'rambler', 'flip straw tumbler', 'insulated tumbler'] },
  { type: 'water-bottle',   keywords: ['water bottle', 'freesip', 'reusable bottle', 'hydro jug'] },
  { type: 'blender',        keywords: ['blender', 'nutri-blender', 'smoothie maker', 'personal blender'] },
  { type: 'coffee-maker',   keywords: ['coffee maker', 'coffee machine', 'espresso machine', 'drip coffee'] },
  { type: 'air-fryer',      keywords: ['air fryer', 'airfryer'] },
  { type: 'instant-pot',    keywords: ['instant pot', 'pressure cooker', 'multicooker'] },
  { type: 'knife',          keywords: ['chef knife', 'knife set', 'cutlery set', 'bread knife'] },
  { type: 'chopper',        keywords: ['vegetable chopper', 'food chopper', 'mandoline slicer'] },
  { type: 'shredder-tool',  keywords: ['chicken shredder', 'meat shredder', 'shredder tool'] },
  { type: 'smoker-kit',     keywords: ['smoker kit', 'whiskey smoker', 'smoking kit'] },
  // ── Oficina ────────────────────────────────────────────────────────────────
  { type: 'ink-cartridge',  keywords: ['ink cartridge', 'toner cartridge', 'high-yield ink'] },
  { type: 'paper',          keywords: ['printer paper', 'copy paper', 'reams of paper'] },
  { type: 'seat-cushion',   keywords: ['seat cushion', 'chair cushion', 'coccyx cushion', 'tailbone cushion'] },
  { type: 'desk-organizer', keywords: ['drawer organizer', 'desk organizer', 'drawer divider'] },
  { type: 'office-chair',   keywords: ['office chair', 'ergonomic chair', 'desk chair'] },
  // ── Deporte ────────────────────────────────────────────────────────────────
  { type: 'yoga-mat',       keywords: ['yoga mat', 'exercise mat', 'gym mat'] },
  { type: 'resistance-band',keywords: ['resistance band', 'exercise band', 'fitness band'] },
  { type: 'kettlebell',     keywords: ['kettlebell', 'kettle bell'] },
  { type: 'dumbbell',       keywords: ['dumbbell', 'barbell', 'weight set', 'free weight'] },
  { type: 'jump-rope',      keywords: ['jump rope', 'skipping rope'] },
  { type: 'sports-bottle',  keywords: ['sport bottle', 'gym bottle', 'sports water bottle'] },
  { type: 'camping-chair',  keywords: ['camping chair', 'camp chair', 'outdoor chair', 'folding chair'] },
  { type: 'goggles',        keywords: ['swim goggles', 'swimming goggles'] },
  { type: 'golf',           keywords: ['golf ball', 'golf club', 'golf bag', 'golf glove'] },
  { type: 'backpack',       keywords: ['hiking backpack', 'hiking pack', 'day pack', 'trail backpack'] },
  { type: 'sleeping-bag',   keywords: ['sleeping bag'] },
  { type: 'card-binder',    keywords: ['card binder', 'trading card binder', 'card sleeve binder'] },
  { type: 'waist-trimmer',  keywords: ['waist trimmer', 'waist trainer', 'sweat band'] },
  // ── Belleza ────────────────────────────────────────────────────────────────
  { type: 'sunscreen',      keywords: ['sunscreen', 'sunblock', 'sun protection', 'spf shield'] },
  { type: 'moisturizer',    keywords: ['face moisturizer', 'face cream', 'body lotion', 'daily moisturizer'] },
  { type: 'serum',          keywords: ['face serum', 'vitamin c serum', 'skin serum'] },
  { type: 'organizer-beauty',keywords: ['makeup organizer', 'cosmetic organizer', 'acrylic organizer'] },
  { type: 'stretch-marks',  keywords: ['stretch mark', 'stretch marks', 'stretchmark', 'belly cream'] },
  // ── Bebés ──────────────────────────────────────────────────────────────────
  { type: 'baby-wipes',     keywords: ['baby wipes', 'baby wipe', 'sensitive wipes', 'fragrance free wipes'] },
  { type: 'diapers',        keywords: ['diapers', 'cloth diapers', 'baby diaper', 'swaddlers'] },
  { type: 'baby-monitor',   keywords: ['baby monitor', 'video baby monitor', 'baby camera'] },
  { type: 'baby-carrier',   keywords: ['baby carrier', 'infant carrier', 'baby wrap'] },
  { type: 'breast-pump',    keywords: ['breast pump', 'nursing pump'] },
  { type: 'swaddle',        keywords: ['swaddle', 'sleep sack', 'wearable blanket', 'swaddle up'] },
  { type: 'baby-bottle',    keywords: ['baby bottle', 'feeding bottle', 'anti-colic bottle', 'natural baby bottle'] },
  { type: 'earmuffs',       keywords: ['baby ear protection', 'noise reduction earmuffs', 'baby earmuffs', 'hearing protection'] },
  // ── Herramientas ──────────────────────────────────────────────────────────
  { type: 'water-filter',   keywords: ['refrigerator filter', 'water filter', 'water purifier filter', 'ice and water filter'] },
  { type: 'ladder',         keywords: ['step ladder', 'folding ladder', 'step stool'] },
  { type: 'light-strip',    keywords: ['led strip', 'light strip', 'led light strip', 'smart light strip'] },
  { type: 'floor-lamp',     keywords: ['floor lamp', 'standing lamp', 'corner lamp'] },
  { type: 'outdoor-light',  keywords: ['outdoor string lights', 'patio lights', 'solar string lights'] },
  { type: 'extension-cord', keywords: ['extension cord', 'power cord', 'outdoor cord'] },
  { type: 'vent-cover',     keywords: ['vent cover', 'air vent', 'return air vent', 'grille cover'] },
  { type: 'shower-head',    keywords: ['shower head', 'showerhead', 'rainfall shower', 'handheld shower'] },
  { type: 'picture-hanger', keywords: ['picture hanging', 'picture leveling', 'hang sawtooth', 'wall hanging kit'] },
]

// ── Benefit map ────────────────────────────────────────────────────────────────

export const PRODUCT_TYPE_BENEFITS: Record<string, string> = {
  // Electrónica
  ssd:              'Almacenamiento de Alta Velocidad',
  headphones:       'Sonido Premium y Cancelación de Ruido',
  earbuds:          'Audio Inalámbrico de Alta Calidad',
  speaker:          'Sonido Potente en Cualquier Lugar',
  monitor:          'Imagen Clara para Trabajo y Entretenimiento',
  keyboard:         'Escritura Precisa y Ergonómica',
  mouse:            'Precisión para Trabajo y Creatividad',
  webcam:           'Videollamadas Nítidas y Profesionales',
  microphone:       'Audio Claro para Streaming y Trabajo',
  smartwatch:       'Salud y Conectividad en tu Muñeca',
  router:           'Conexión Estable para Todo tu Hogar',
  streaming:        'Entretenimiento sin Límites en tu TV',
  'tv-mount':       'Instalación Segura y Vista Perfecta',
  outlet:           'Control de Energía para tu Hogar',
  // Gaming
  controller:       'Control Preciso para Cada Partida',
  game:             'Aventura y Entretenimiento Garantizados',
  // Mascotas
  'lint-roller':    'Ropa Libre de Pelo de Mascota',
  'pee-pads':       'Higiene Fácil para el Entrenamiento',
  'pet-clothing':   'Abrigo y Estilo para tu Mascota',
  'pet-bed':        'Descanso Ortopédico para tu Mascota',
  'pet-harness':    'Control Seguro sin Dañar a tu Mascota',
  'cat-litter':     'Control de Olores y Fácil Limpieza',
  'pet-pool':       'Diversión y Frescura para tu Mascota',
  'pet-playpen':    'Espacio Seguro para Jugar y Explorar',
  aquarium:         'Ecosistema Acuático Completo',
  'aquarium-filter':'Agua Limpia y Saludable para tus Peces',
  // Hogar
  'air-purifier':   'Aire Limpio y Saludable en tu Hogar',
  'air-filter':     'Filtración de Aire para tu Sistema HVAC',
  fan:              'Frescura Silenciosa para tu Espacio',
  'bug-zapper':     'Protección contra Insectos sin Químicos',
  mattress:         'Descanso Profundo y Reparador',
  sheets:           'Suavidad y Confort para tu Cama',
  pillow:           'Soporte Perfecto para tu Descanso',
  curtains:         'Oscuridad Total para Dormir Mejor',
  rug:              'Estilo y Confort para tu Espacio',
  'door-mat':       'Bienvenida Limpia en tu Hogar',
  'shade-sail':     'Sombra y Protección UV al Aire Libre',
  // Cocina
  tumbler:          'Hidratación Caliente o Fría por Horas',
  'water-bottle':   'Hidratación para tu Día a Día',
  blender:          'Batidos y Mezclas en Segundos',
  'coffee-maker':   'Café Perfecto en Casa',
  'air-fryer':      'Cocina Saludable y Rápida',
  'instant-pot':    'Cocina Completa en un Solo Aparato',
  knife:            'Corte Preciso para tu Cocina',
  chopper:          'Cortes Rápidos y Uniformes',
  'shredder-tool':  'Preparación de Carnes sin Esfuerzo',
  'smoker-kit':     'Ahumado Artesanal para tus Bebidas',
  // Oficina
  'ink-cartridge':  'Impresión de Alta Calidad',
  paper:            'Impresión Profesional y Confiable',
  'seat-cushion':   'Comodidad para Largas Jornadas',
  'desk-organizer': 'Orden y Productividad en tu Escritorio',
  'office-chair':   'Ergonomía para Tu Jornada de Trabajo',
  // Deporte
  'yoga-mat':       'Práctica Cómoda y Estable',
  'resistance-band':'Entrenamiento en Cualquier Lugar',
  kettlebell:       'Fuerza Funcional para tu Rutina',
  dumbbell:         'Fuerza y Tonificación en Casa',
  'jump-rope':      'Cardio Efectivo y Portátil',
  'sports-bottle':  'Hidratación para tu Entrenamiento',
  'camping-chair':  'Comodidad al Aire Libre',
  goggles:          'Visión Clara en el Agua',
  golf:             'Rendimiento en el Campo de Golf',
  backpack:         'Carga Cómoda para tus Aventuras',
  'sleeping-bag':   'Descanso en Cualquier Terreno',
  'card-binder':    'Organización Segura de tu Colección',
  'waist-trimmer':  'Apoyo y Sudoración para tu Entrenamiento',
  // Belleza
  sunscreen:        'Protección Solar Avanzada',
  moisturizer:      'Hidratación Profunda para tu Piel',
  serum:            'Tratamiento Intensivo para tu Piel',
  'organizer-beauty':'Orden para tu Rutina de Belleza',
  'stretch-marks':  'Cuidado Intensivo para tu Piel',
  // Bebés
  'baby-wipes':     'Higiene y Cuidado para tu Bebé',
  diapers:          'Protección y Confort para tu Bebé',
  'baby-monitor':   'Vigilancia Tranquila desde Cualquier Lugar',
  'baby-carrier':   'Cercanía y Comodidad para tu Bebé',
  'breast-pump':    'Lactancia Cómoda y Eficiente',
  swaddle:          'Sueño Seguro y Tranquilo',
  'baby-bottle':    'Alimentación Segura y sin Cólicos',
  earmuffs:         'Protección Auditiva para los más Pequeños',
  // Herramientas
  'water-filter':   'Agua Pura y Limpia desde tu Nevera',
  ladder:           'Altura Segura para cada Trabajo',
  'light-strip':    'Iluminación de Ambiente a tu Medida',
  'floor-lamp':     'Iluminación Moderna para tu Espacio',
  'outdoor-light':  'Iluminación Elegante para Exteriores',
  'extension-cord': 'Alcance y Potencia donde lo Necesitas',
  'vent-cover':     'Flujo de Aire Limpio y Controlado',
  'shower-head':    'Ducha Premium en tu Hogar',
  'picture-hanger': 'Decoración Precisa y sin Complicaciones',
}

// ── Public functions ───────────────────────────────────────────────────────────

/** Returns the canonical productType for a title using word-boundary matching. */
export function detectProductType(title: string): string | null {
  const lower = title.toLowerCase()
  for (const entry of PRODUCT_TYPE_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (testKeyword(lower, kw)) return entry.type
    }
  }
  return null
}

/** Returns a specific Spanish benefit for a productType, or null if not mapped. */
export function getBenefitForProductType(productType: string | null): string | null {
  if (!productType) return null
  return PRODUCT_TYPE_BENEFITS[productType] ?? null
}
