import type { CategoryPage } from '@/types'

/**
 * SEO landing page: Gaming
 * Route: /categoria/gaming
 *
 * Products: game-001 (PS5 DualSense), game-002 (Xbox Controller), game-003 (Razer BlackShark),
 *           game-004 (Logitech G502), game-005 (Nintendo Switch Lite)
 */
const gaming: CategoryPage = {
  slug: 'gaming',
  name: 'Gaming',
  icon: '🎮',
  badge: 'Top ventas',
  canonicalCategory: 'gaming',

  seoTitle: 'Accesorios gaming Amazon Colombia — Mandos, ratones y auriculares 2025 | GOODPRICE',
  seoDescription:
    'Los mejores accesorios gaming de Amazon con envío a Colombia. PS5 DualSense, Xbox Controller, ' +
    'Razer, Logitech y Nintendo Switch — precios verificados, envío confirmado.',
  keywords: [
    'accesorios gaming colombia amazon',
    'mando ps5 colombia precio',
    'control xbox amazon colombia',
    'raton gaming colombia',
    'auriculares gaming precio',
    'nintendo switch colombia',
    'gaming setup colombia',
    'videojuegos amazon colombia',
  ],

  tagline: 'El setup gaming definitivo — desde mandos de consola hasta ratones de alta precisión, todo con envío a Colombia.',
  intro:
    'Colombia es uno de los mercados gamer de más rápido crecimiento en Latinoamérica. ' +
    'Pero conseguir accesorios de calidad a precios justos sigue siendo un reto — ' +
    'las tiendas locales tienen inventario limitado y precios notablemente más altos que Amazon.\n\n' +
    'En esta selección encontrarás los accesorios gaming más vendidos a nivel mundial, ' +
    'disponibles hoy en Amazon con envío verificado a Colombia: el DualSense de PS5 con retroalimentación háptica, ' +
    'el controller Xbox compatible con PC y consola, el Razer BlackShark V2 X con calidad de audio sorprendente ' +
    'para gaming a menos de $40, el Logitech G502 HERO con 61.000 reseñas y una precisión de 25.600 DPI, ' +
    'y la Nintendo Switch Lite para gaming portátil.\n\n' +
    'Todos los accesorios son oficiales (no copias ni aftermarket), con garantía de fábrica y posibilidad de devolución.',

  featuredProductIds: ['game-001', 'game-002', 'game-003', 'game-004', 'game-005'],
  relatedGuideSlugs: [],

  relatedCategories: [
    { slug: 'auriculares',  label: 'Auriculares',  icon: '🎧' },
    { slug: 'laptops',      label: 'Laptops',      icon: '💻' },
    { slug: 'home-office',  label: 'Home Office',  icon: '🖥️' },
  ],

  stats: [
    { label: 'Accesorios seleccionados', value: '5' },
    { label: 'Rango de precio',          value: '$40 – $200' },
    { label: 'Mejor valoración',         value: '4.7 ★' },
    { label: 'Plataformas',             value: 'PS5 · Xbox · PC · Nintendo' },
  ],

  faqs: [
    {
      question: '¿El mando de PS5 (DualSense) funciona en Colombia?',
      answer:
        'Sí, el DualSense funciona exactamente igual en Colombia que en cualquier otro país. ' +
        'La conectividad es por Bluetooth o USB-C, y no tiene restricciones regionales. ' +
        'Funciona con PS5, PC vía Bluetooth o cable, y en algunos juegos de PS4 con adaptadores.\n\n' +
        'La retroalimentación háptica y los gatillos adaptativos solo funcionan completamente en PS5 — ' +
        'en PC el soporte depende del juego. Steam tiene soporte nativo para DualSense en muchos títulos.',
    },
    {
      question: '¿Puedo usar el controller Xbox con PC?',
      answer:
        'Sí, es perfectamente compatible. El controller Xbox Wireless conecta por Bluetooth en PC con Windows 10/11 ' +
        'sin necesidad de drivers adicionales. También puedes conectarlo con cable USB-C para latencia cero.\n\n' +
        'La ventaja del controller Xbox sobre el DualSense en PC es el soporte nativo en prácticamente todos los juegos de Steam ' +
        'y el Xbox Game Pass. Si juegas en PC además de consola, el controller Xbox es más versátil.',
    },
    {
      question: '¿El Razer BlackShark V2 X es bueno para consola y PC?',
      answer:
        'Es una de las mejores relaciones calidad-precio del mercado gaming. Conecta por cable 3.5mm, ' +
        'lo que lo hace compatible con PS5, Xbox, Nintendo Switch, PC y móvil sin adaptadores ni drivers.\n\n' +
        'Su calidad de audio supera con creces lo que se espera a menos de $40: drivers de 50mm con sonido virtual 7.1, ' +
        'micrófono cardioide con buena cancelación de ruido, y construcción ligera (240g). ' +
        'Para alguien que busca su primer headset gaming o un backup económico, es difícil encontrar algo mejor.',
    },
    {
      question: '¿Qué ratón gaming elegir para principiantes?',
      answer:
        'El Logitech G502 HERO es el punto de entrada perfecto para gaming serio. ' +
        'Con más de 61.000 reseñas y 4.7 estrellas, es el ratón gaming más popular del mercado por una razón: ' +
        'sensor de 25.600 DPI, 11 botones programables, peso ajustable y compatibilidad con Logitech G Hub.\n\n' +
        'No necesitas un ratón de $100+ para empezar. El G502 HERO a $39 te da herramientas profesionales ' +
        'que no superarás hasta que seas un jugador muy avanzado. El modelo HERO usa Logitech G HUB para personalización.',
    },
    {
      question: '¿La Nintendo Switch Lite llega a Colombia por Amazon?',
      answer:
        'Sí, la Nintendo Switch Lite tiene envío confirmado a Colombia. Es importante notar que la Switch Lite ' +
        'es exclusivamente portátil — no se conecta a TV como la Switch estándar. ' +
        'Es perfecta para gaming en viajes, transporte público, o para quienes ya tienen una Switch en el hogar.\n\n' +
        'Al comprar en Amazon, recibes la consola en su versión internacional (misma que en cualquier otra región), ' +
        'con acceso a la Nintendo eShop regional. Los juegos de Nintendo Switch no tienen region lock, ' +
        'por lo que puedes comprar cartuchos de cualquier región.',
    },
  ],

  trendingQueries: [
    'mando ps5 colombia precio',
    'raton gaming precision',
    'auriculares gaming pc',
    'nintendo switch precio',
    'gaming setup completo',
  ],

  popularComparisons: [
    'PS5 DualSense vs Xbox Wireless Controller',
    'Auriculares gaming con cable vs inalámbrico',
    'Nintendo Switch Lite vs Switch OLED',
  ],

  publishedAt: '2025-05-23',
  updatedAt: '2025-05-26',
}

export default gaming
