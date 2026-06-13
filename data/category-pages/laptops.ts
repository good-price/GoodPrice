import type { CategoryPage } from '@/types'

/**
 * SEO landing page: Laptops & Accesorios
 * Route: /categoria/laptops
 *
 * Products: ofic-002 (Anker Hub), ofic-003 (Laptop Stand), ofic-001 (MX Master 3S), elec-004 (PowerCore)
 * Note: The catalog focuses on laptop accessories — the page covers "todo para tu laptop"
 */
const laptops: CategoryPage = {
  slug: 'laptops',
  name: 'Laptops & Accesorios',
  icon: '💻',
  badge: 'Essentials',
  canonicalCategory: 'oficina',

  seoTitle: 'Accesorios para laptop en Amazon Colombia — Hub, soporte, ratón y más 2025 | GOODPRICE',
  seoDescription:
    'Los mejores accesorios para laptop disponibles en Amazon con envío a Colombia. ' +
    'Hub USB-C, soporte ergonómico, ratón inalámbrico y batería portátil — todo verificado.',
  keywords: [
    'accesorios laptop amazon colombia',
    'hub usb-c laptop colombia',
    'soporte ergonomico laptop',
    'raton inalambrico laptop',
    'bateria portatil laptop colombia',
    'perifericos macbook colombia',
    'accesorios trabajo remoto',
    'laptop setup colombia',
  ],

  tagline: 'Todo lo que necesita tu laptop para rendir al máximo — accesorios esenciales con envío confirmado a Colombia.',
  intro:
    'Una buena laptop es solo el comienzo. Los accesorios correctos marcan la diferencia entre trabajar ' +
    'con frustración constante — sin puertos, con dolor de cuello, sin batería de respaldo — ' +
    'y tener un setup fluido que potencia tu productividad.\n\n' +
    'Esta selección cubre los cuatro accesorios con mayor impacto en el día a día de cualquier usuario de laptop, ' +
    'independientemente de la marca o sistema operativo: connectivity (hub USB-C), ergonomía (soporte ajustable), ' +
    'productividad (ratón de precisión) y autonomía (batería portátil). ' +
    'Todos son compatibles con MacBook, Dell, Lenovo, HP, ASUS y cualquier laptop moderna.\n\n' +
    'Verificamos el envío a Colombia de cada producto antes de publicarlo. ' +
    'Los precios en Amazon son en promedio un 35–50 % más bajos que en tiendas físicas en Colombia para estos accesorios.',

  featuredProductIds: ['ofic-001', 'elec-004'],
  relatedGuideSlugs: ['gadgets-home-office-colombia'],

  relatedCategories: [
    { slug: 'home-office',  label: 'Home Office',  icon: '🖥️' },
    { slug: 'gaming',       label: 'Gaming',       icon: '🎮' },
    { slug: 'auriculares',  label: 'Auriculares',  icon: '🎧' },
  ],

  stats: [
    { label: 'Accesorios esenciales',  value: '4' },
    { label: 'Inversión total',        value: '< $170 USD' },
    { label: 'Compatibilidad',        value: 'Mac · Windows · Linux' },
    { label: 'Envío a Colombia',       value: 'Verificado' },
  ],

  faqs: [
    {
      question: '¿Por qué necesito un hub USB-C si mi laptop tiene puertos?',
      answer:
        'Las laptops delgadas modernas (MacBook Air/Pro, Dell XPS, Lenovo ThinkPad X1) sacrifican puertos ' +
        'para reducir el grosor. La mayoría tiene 2 USB-C y poco más. ' +
        'Sin un hub, conectar una pantalla externa, un teclado USB, una memoria y la corriente al mismo tiempo ' +
        'se convierte en un juego de Tetris frustrante.\n\n' +
        'El hub Anker 7-en-1 agrega HDMI 4K, 2× USB-A 3.0, lector SD/microSD y carga de 100W en un solo cable. ' +
        'El precio de $35 se amortiza la primera semana de uso si trabajas con periféricos externos.',
    },
    {
      question: '¿El soporte para laptop sirve para cualquier marca y tamaño?',
      answer:
        'Sí. El soporte Amazon Basics ajustable soporta laptops de hasta 15 pulgadas, ' +
        'lo que incluye prácticamente todos los modelos del mercado: MacBook Air 13"/15", MacBook Pro hasta 16", ' +
        'Dell XPS 13/15, Lenovo ThinkPad, HP Pavilion, ASUS ZenBook y similares.\n\n' +
        'El diseño de aluminio plegable pesa menos de 500g, se ajusta en 6 ángulos diferentes ' +
        'y tiene bases de silicona antideslizante que protegen tanto el escritorio como la laptop. ' +
        'También funciona con tablets en modo horizontal.',
    },
    {
      question: '¿El ratón MX Master 3S funciona sin receptor USB?',
      answer:
        'Sí, conecta por Bluetooth nativo en Windows, macOS y iPadOS sin necesitar ningún dongle. ' +
        'Si prefieres más estabilidad (especialmente en entornos con mucho Bluetooth), ' +
        'incluye el receptor Logi Bolt USB que ocupa uno de los puertos USB-A.\n\n' +
        'La función Easy-Switch del MX Master 3S permite emparejar hasta 3 dispositivos simultáneamente ' +
        'y cambiar entre ellos con un botón. Ideal para quienes usan laptop + desktop o laptop + tablet.',
    },
    {
      question: '¿Puede una batería portátil cargar una laptop?',
      answer:
        'Depende de la potencia del banco de energía y del requerimiento de la laptop. ' +
        'La Anker PowerCore Slim 10000 tiene un puerto USB-C con Power Delivery de 18W, ' +
        'lo que es suficiente para cargar laptops ultraligeras (como MacBook Air M1/M2) en emergencias, ' +
        'aunque lentamente. Para laptops de mayor consumo (MacBook Pro 16", gaming laptops), ' +
        'sirve para ralentizar el descenso de batería pero no para carga rápida.\n\n' +
        'Para carga rápida de laptops, existen bancos de energía de 20.000–26.800mAh con 65–100W PD, ' +
        'aunque son notablemente más pesados y caros. La PowerCore Slim es ideal para teléfonos y tablets.',
    },
    {
      question: '¿Hay laptops disponibles directamente en Amazon para Colombia?',
      answer:
        'Amazon tiene laptops disponibles, pero el envío internacional a Colombia de electrónicos grandes ' +
        'es más complejo: aranceles de importación más altos, riesgo de daño en tránsito, ' +
        'y la garantía del fabricante puede no aplicar en Colombia para productos de importación paralela.\n\n' +
        'Para laptops, generalmente es más conveniente comprar en Colombia a través de distribuidores oficiales ' +
        '(Apple Colombia, Dell Colombia, LG Colombia) que incluyen garantía local. ' +
        'Donde Amazon realmente destaca para laptops es en sus accesorios — hubs, soportes, ratones, teclados, ' +
        'que son más livianos, baratos de enviar y sin problemas de garantía.',
    },
  ],

  trendingQueries: [
    'hub usb-c macbook colombia',
    'soporte laptop ergonomico',
    'raton bluetooth laptop',
    'bateria externa laptop',
    'accesorios macbook air colombia',
  ],

  popularComparisons: [
    'Hub USB-C 7 en 1 vs Thunderbolt dock',
    'Ratón Bluetooth vs con receptor',
    'Soporte fijo vs soporte ajustable',
  ],

  publishedAt: '2025-05-24',
  updatedAt: '2025-05-26',
}

export default laptops
