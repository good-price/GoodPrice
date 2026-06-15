import type { ProductCategory } from './types'

export const CATEGORY_BENEFIT_POOLS: Record<ProductCategory, string[]> = {
  electronica: [
    'Tecnología Avanzada',
    'Conectividad Inteligente',
    'Rendimiento de Alto Nivel',
    'Experiencia Premium',
    'Potencia para tu Día a Día',
    'Velocidad y Eficiencia',
    'Solución Tecnológica Confiable',
  ],
  gaming: [
    'Control de Precisión',
    'Experiencia Inmersiva',
    'Rendimiento Competitivo',
    'Dominio en Cada Partida',
    'Ventaja para Gaming',
    'Juego sin Compromisos',
    'Rendimiento de Alto Nivel',
  ],
  hogar: [
    'Comodidad Duradera',
    'Diseño para el Hogar',
    'Eficiencia en Casa',
    'Calidad que Perdura',
    'Confort para tu Espacio',
    'Solución Inteligente para el Hogar',
    'Bienestar en tu Hogar',
  ],
  cocina: [
    'Practicidad Real',
    'Versatilidad en Cocina',
    'Solución de Cocina',
    'Calidad para tu Mesa',
    'Eficiencia Culinaria',
    'Para los Amantes de la Cocina',
    'Cocinado Fácil y Rápido',
  ],
  oficina: [
    'Productividad Diaria',
    'Ergonomía Profesional',
    'Eficiencia en Oficina',
    'Trabajo sin Interrupciones',
    'Rendimiento Profesional',
    'Solución para tu Espacio de Trabajo',
    'Confort y Productividad',
  ],
  deporte: [
    'Rendimiento Activo',
    'Entrenamiento Optimizado',
    'Movilidad y Confort',
    'Para tu Mejor Versión',
    'Equipo para el Deportista',
    'Supera tus Límites',
    'Calidad para el Movimiento',
  ],
  belleza: [
    'Cuidado Profesional',
    'Protección Dermatológica',
    'Rutina de Cuidado',
    'Piel Saludable y Radiante',
    'Cuidado que Marca la Diferencia',
    'Belleza con Ciencia',
    'Tu Piel, tu Prioridad',
  ],
  bebes: [
    'Seguridad Garantizada',
    'Confort para el Bebé',
    'Cuidado Esencial',
    'Diseñado para los más Pequeños',
    'Tranquilidad para los Padres',
    'Suavidad y Protección',
    'Lo Mejor para tu Bebé',
  ],
  mascotas: [
    'Bienestar Animal',
    'Cuidado Confiable',
    'Vida Sana para tu Mascota',
    'Calidad para tu Compañero',
    'Comodidad para tu Mascota',
    'Cuidado que tu Mascota Merece',
    'Salud y Felicidad Animal',
  ],
  herramientas: [
    'Trabajo Eficiente',
    'Solución Profesional',
    'Potencia y Precisión',
    'Calidad para cada Proyecto',
    'Herramienta Confiable',
    'Rendimiento en Cada Uso',
    'Construcción sin Límites',
  ],
}

/** Returns the benefit pool for a category, guaranteed non-empty. */
export function getCategoryBenefits(category: ProductCategory): string[] {
  return CATEGORY_BENEFIT_POOLS[category]
}
