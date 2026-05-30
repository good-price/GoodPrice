import type { CategoryPage } from '@/types'

/**
 * SEO landing page: Auriculares Bluetooth
 * Route: /categoria/auriculares
 *
 * Products: elec-001 (AirPods Pro 2), elec-002 (Galaxy Buds2 Pro), game-003 (Razer BlackShark V2 X)
 * Guide: mejores-auriculares-bluetooth
 */
const auriculares: CategoryPage = {
  slug: 'auriculares',
  name: 'Auriculares Bluetooth',
  icon: '🎧',
  badge: '2025',
  canonicalCategory: 'electronica',

  seoTitle: 'Mejores auriculares Bluetooth para Colombia — Guía 2025 | GOODPRICE',
  seoDescription:
    'Compara los mejores auriculares Bluetooth disponibles en Amazon con envío a Colombia. ' +
    'AirPods Pro 2, Galaxy Buds2 Pro, Razer y más. Precios reales, análisis honesto.',
  keywords: [
    'auriculares bluetooth colombia',
    'mejores auriculares inalámbricos',
    'airpods pro colombia precio',
    'samsung galaxy buds colombia',
    'auriculares cancelación de ruido',
    'comprar auriculares amazon colombia',
    'auriculares gaming colombia',
    'auriculares true wireless',
  ],

  tagline: 'Encuentra los auriculares perfectos para tu día a día — selección curada y verificada para Colombia.',
  intro:
    'Elegir unos buenos auriculares en Colombia es más difícil de lo que parece. ' +
    'Las tiendas locales suelen cobrar entre un 30 % y un 50 % más que Amazon, y no siempre tienen los modelos más recientes. ' +
    'En GOODPRICE verificamos cada producto para confirmar que Amazon lo envía directamente a Colombia antes de publicarlo.\n\n' +
    'En esta página encontrarás los auriculares con mejor relación calidad-precio de 2025: ' +
    'desde los AirPods Pro 2 de Apple con la mejor cancelación de ruido del mercado, ' +
    'hasta el Razer BlackShark V2 X para gaming a menos de $40. ' +
    'Cada modelo ha sido elegido por precio real, calidad de audio confirmada y disponibilidad de envío.\n\n' +
    'Si buscas análisis más detallados, nuestra guía de compra compara los modelos premium cara a cara ' +
    'con veredictos claros según tu dispositivo y presupuesto.',

  featuredProductIds: ['elec-001', 'elec-002', 'game-003'],
  relatedGuideSlugs: ['mejores-auriculares-bluetooth'],

  relatedCategories: [
    { slug: 'gaming',      label: 'Gaming',      icon: '🎮' },
    { slug: 'home-office', label: 'Home Office',  icon: '🖥️' },
    { slug: 'laptops',     label: 'Laptops',      icon: '💻' },
  ],

  stats: [
    { label: 'Modelos analizados', value: '3' },
    { label: 'Rango de precio',    value: '$39 – $190' },
    { label: 'Mejor valoración',   value: '4.8 ★' },
    { label: 'Envío a Colombia',   value: 'Confirmado' },
  ],

  faqs: [
    {
      question: '¿Los auriculares de Amazon llegan directamente a Colombia?',
      answer:
        'Sí, Amazon envía directamente a Colombia en la mayoría de sus productos. ' +
        'El proceso es simple: se compra desde amazon.com, se selecciona Colombia como destino, ' +
        'y el paquete llega en 7 a 21 días hábiles según el tipo de envío elegido. ' +
        'En GOODPRICE solo mostramos productos con envío confirmado a Colombia, ' +
        'por lo que no tendrás sorpresas al hacer checkout.\n\n' +
        'Ten en cuenta que los productos comprados en Amazon internacional pueden estar sujetos a ' +
        'arancel de importación por la DIAN si el valor supera los $200 USD. ' +
        'Para paquetes bajo ese valor, el proceso suele ser automático.',
    },
    {
      question: '¿Qué diferencia hay entre cancelación de ruido activa (ANC) y modo transparencia?',
      answer:
        'La cancelación de ruido activa (ANC) usa micrófonos externos para detectar el sonido del entorno ' +
        'y genera una onda de audio opuesta que lo neutraliza en tiempo real. ' +
        'Es muy eficaz contra ruidos constantes como motores de avión, aire acondicionado o tráfico. ' +
        'Consume más batería que el modo estándar.\n\n' +
        'El modo transparencia (o modo ambiente) hace lo opuesto: deja pasar el sonido exterior de forma controlada ' +
        'para que puedas escuchar el entorno sin quitarte los auriculares. ' +
        'Útil en reuniones informales, al cruzar la calle o cuando necesitas estar atento al entorno. ' +
        'Los AirPods Pro 2 y los Galaxy Buds2 Pro tienen ambos modos, y los implementan mejor que ningún otro en su rango de precio.',
    },
    {
      question: '¿Vale la pena pagar más de $100 USD por unos auriculares?',
      answer:
        'Depende de tu uso principal. Para escuchar música casualmente o en llamadas de trabajo, ' +
        'auriculares en el rango de $40–$80 ofrecen excelente calidad. ' +
        'El salto a $100–$200 tiene sentido si: viajas frecuentemente (donde ANC premium marca diferencia real), ' +
        'usas el audio 4+ horas al día, o necesitas integración profunda con tu ecosistema (iPhone → AirPods Pro).\n\n' +
        'Para gaming, el Razer BlackShark V2 X a $39 demuestra que no siempre hay que gastar más. ' +
        'Su calidad de audio es notablemente superior a su precio y funciona sin necesidad de Bluetooth ' +
        '(cable 3.5mm, compatible con PS5, Xbox, PC y móvil).',
    },
    {
      question: '¿Los AirPods Pro funcionan con Android?',
      answer:
        'Sí, los AirPods Pro funcionan con cualquier dispositivo Bluetooth, incluyendo Android. ' +
        'Sin embargo, en Android pierdes varias funciones clave: el emparejamiento automático al abrir el estuche, ' +
        'la configuración visual de batería, el audio espacial adaptativo, y la sincronización con otros dispositivos Apple.\n\n' +
        'Si usas Android, los Galaxy Buds2 Pro son una mejor inversión: ofrecen integración nativa en Samsung y ' +
        'funcionan bien en cualquier Android con la app Galaxy Wearable. La calidad de audio a 24-bit es única en su rango.',
    },
    {
      question: '¿Cuánto tiempo dura la batería en auriculares Bluetooth modernos?',
      answer:
        'Los auriculares premium actuales ofrecen 5–6 horas de reproducción continua con ANC activo, ' +
        'y el estuche de carga añade otras 20–24 horas adicionales. Sin ANC, la batería puede extenderse a 7–9 horas. ' +
        'Los AirPods Pro 2 con USB-C cargan 1 hora de escucha en solo 5 minutos con el estuche.\n\n' +
        'Para gaming con cable (como el Razer BlackShark V2 X), la batería no aplica — ' +
        'funciona enchufado sin necesidad de carga y la latencia es cero.',
    },
  ],

  trendingQueries: [
    'airpods pro colombia',
    'galaxy buds precio',
    'auriculares gaming ps5',
    'auriculares noise cancelling',
    'mejores auriculares 2025',
  ],

  popularComparisons: [
    'AirPods Pro 2 vs Galaxy Buds2 Pro',
    'ANC premium vs auriculares gaming',
    'Auriculares inalámbricos vs con cable',
  ],

  publishedAt: '2025-05-20',
  updatedAt: '2025-05-26',
}

export default auriculares
