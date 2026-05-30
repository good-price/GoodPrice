import type { CategoryPage } from '@/types'

/**
 * SEO landing page: Home Office
 * Route: /categoria/home-office
 *
 * Products: ofic-001 (MX Master 3S), ofic-002 (Anker Hub USB-C), ofic-003 (Laptop Stand), elec-004 (PowerCore)
 * Guide: gadgets-home-office-colombia
 */
const homeOffice: CategoryPage = {
  slug: 'home-office',
  name: 'Home Office',
  icon: '🖥️',
  badge: 'Esencial',
  canonicalCategory: 'oficina',

  seoTitle: 'Setup home office desde Colombia — Los mejores accesorios en Amazon 2025 | GOODPRICE',
  seoDescription:
    'Arma tu home office con los mejores accesorios de Amazon disponibles en Colombia. ' +
    'Ratón ergonómico, hub USB-C, soporte para laptop y más — todo bajo $200 USD.',
  keywords: [
    'home office colombia amazon',
    'accesorios trabajo desde casa colombia',
    'setup home office economico',
    'raton ergonomico colombia',
    'hub usb-c amazon colombia',
    'soporte laptop ergonomico',
    'productividad trabajo remoto',
    'mejor setup oficina casa',
  ],

  tagline: 'Transforma cualquier escritorio en un setup profesional — accesorios seleccionados para el trabajador remoto en Colombia.',
  intro:
    'El trabajo remoto permanente exige un espacio bien equipado. No se trata de gastar mucho — ' +
    'se trata de gastar bien. Los cuatro accesorios de esta página resuelven los problemas más comunes ' +
    'del trabajo desde casa: conectividad limitada, ergonomía deficiente, batería agotada y productividad baja.\n\n' +
    'Todos están disponibles en Amazon con envío a Colombia y suman menos de $200 USD en total. ' +
    'Son el mismo setup que usan desarrolladores, diseñadores y ejecutivos en Silicon Valley — ' +
    'y no por casualidad: cada uno es el mejor en su categoría a su precio.\n\n' +
    'Si quieres ver el análisis detallado con casos de uso específicos, nuestra guía de home office ' +
    'desglosa cada accesorio con veredicto claro sobre cuándo y por qué comprarlo.',

  featuredProductIds: ['ofic-001', 'ofic-002', 'ofic-003', 'elec-004'],
  relatedGuideSlugs: ['gadgets-home-office-colombia'],

  relatedCategories: [
    { slug: 'laptops',      label: 'Laptops',      icon: '💻' },
    { slug: 'auriculares',  label: 'Auriculares',   icon: '🎧' },
    { slug: 'gaming',       label: 'Gaming',        icon: '🎮' },
  ],

  stats: [
    { label: 'Accesorios seleccionados', value: '4' },
    { label: 'Setup completo',           value: '< $200' },
    { label: 'Marcas premium',           value: 'Logitech · Anker' },
    { label: 'Envío a Colombia',         value: 'Confirmado' },
  ],

  faqs: [
    {
      question: '¿Necesito un hub USB-C si tengo MacBook?',
      answer:
        'Casi con seguridad sí. Los MacBook Air y Pro modernos tienen únicamente puertos USB-C/Thunderbolt, ' +
        'lo que significa que conectar un monitor externo, una memoria USB-A, o leer una tarjeta SD requiere un adaptador.\n\n' +
        'El hub Anker 7-en-1 soluciona todo esto con un solo cable: HDMI 4K para pantalla externa, ' +
        'dos puertos USB-A 3.0 para periféricos, lector de SD y microSD, y carga passthrough de 100W ' +
        'para que el MacBook no pierda batería mientras trabajas. Con más de 43.000 reseñas en Amazon, ' +
        'es la solución más confiable del mercado.',
    },
    {
      question: '¿El ratón Logitech MX Master 3S funciona con Mac y Windows?',
      answer:
        'Sí, es completamente compatible con ambos sistemas operativos. Conecta por Bluetooth o receptor USB Logi Bolt ' +
        'y funciona de inmediato. Con la app Logi Options+ (gratuita para Mac y Windows) puedes personalizar ' +
        'cada botón y ajustar el comportamiento de la rueda MagSpeed.\n\n' +
        'La función Easy-Switch permite cambiar entre tres dispositivos con un botón — ideal si trabajas con ' +
        'Mac de escritorio, laptop y tablet simultáneamente. La batería dura 70 días con carga completa.',
    },
    {
      question: '¿Qué beneficio real tiene un soporte para laptop?',
      answer:
        'El beneficio principal es ergonómico: trabajar con la pantalla a nivel de los ojos en lugar de inclinada hacia abajo ' +
        'reduce la tensión cervical y el dolor de espalda durante jornadas largas. ' +
        'Esto no es trivial — los fisioterapeutas la llaman "posición neutral de la columna cervical".\n\n' +
        'El beneficio secundario es práctico: al elevar la laptop, el espacio debajo queda libre para un teclado externo, ' +
        'lo que convierte cualquier laptop en una estación de trabajo tipo desktop sin perder portabilidad. ' +
        'El soporte Amazon Basics se dobla completamente y cabe en cualquier mochila.',
    },
    {
      question: '¿Cuánto cuesta armar un home office básico productivo desde Amazon?',
      answer:
        'Con los cuatro accesorios de esta página (ratón $79 + hub $35 + soporte $23 + batería portátil $25), ' +
        'el total es aproximadamente $162 USD sin contar el envío. ' +
        'Con envío estándar a Colombia (generalmente $10–$25 dependiendo del peso), ' +
        'el setup completo queda por debajo de $200 USD.\n\n' +
        'Comparado con lo que costaría en tiendas físicas en Colombia (donde la diferencia puede ser del 40–60 %), ' +
        'comprar en Amazon representa un ahorro real de $60–$90 USD en este setup.',
    },
    {
      question: '¿Estos accesorios son compatibles con laptops Windows también?',
      answer:
        'Absolutamente. El hub Anker funciona con cualquier laptop que tenga puerto USB-C, incluyendo ' +
        'Dell XPS, Lenovo ThinkPad, HP Spectre, ASUS ZenBook y prácticamente cualquier Windows moderno. ' +
        'El soporte es universal (hasta 15 pulgadas) y el ratón MX Master 3S es multiplataforma por diseño.\n\n' +
        'La batería portátil Anker PowerCore funciona con cualquier dispositivo que cargue por USB, ' +
        'incluidos teléfonos Android e iPhone, tablets, y laptops que soporten carga por USB-C.',
    },
  ],

  trendingQueries: [
    'home office setup economico',
    'raton inalambrico productividad',
    'hub usb-c macbook',
    'soporte ergonomico laptop',
    'accesorios oficina amazon',
  ],

  popularComparisons: [
    'Hub USB-C Anker vs alternativas',
    'MX Master 3S vs MX Keys combo',
    'Soporte fijo vs soporte ajustable',
  ],

  publishedAt: '2025-05-22',
  updatedAt: '2025-05-26',
}

export default homeOffice
