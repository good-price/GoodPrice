/**
 * HowItWorks — 3-step value proposition
 *
 * Pure Server Component. Zero JS. Placed on the homepage after featured products
 * to capture users who scrolled past the hero without converting.
 */

const steps = [
  {
    number: '01',
    icon:   '🔍',
    title:  'Encuentra productos verificados',
    body:   'Revisamos el catálogo de Amazon y seleccionamos solo los productos con ' +
            'envío internacional confirmado a Colombia, rating mínimo 4.0 y cientos ' +
            'de reseñas reales de compradores.',
  },
  {
    number: '02',
    icon:   '🔔',
    title:  'Activa una alerta de precio',
    body:   'Sin registro. Ingresa tu email y te avisamos por correo cuando el precio ' +
            'del producto que elegiste baje. Gratis, sin spam, cancela cuando quieras.',
  },
  {
    number: '03',
    icon:   '💡',
    title:  'Compra con información real',
    body:   'Cada producto muestra su precio convertido a pesos colombianos, la ' +
            'calificación de Amazon y el enlace directo al producto. ' +
            'Lo que ves es lo que encuentras en Amazon.',
  },
]

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading">
      <div className="text-center mb-6">
        <h2
          id="how-it-works-heading"
          className="text-xl font-bold text-gray-900"
        >
          ¿Cómo funciona GOODPRICE?
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Una herramienta real para compradores inteligentes en Colombia.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map(step => (
          <div
            key={step.number}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3"
          >
            {/* Step number + icon */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-300 tracking-widest">
                {step.number}
              </span>
              <span className="text-2xl" aria-hidden="true">{step.icon}</span>
            </div>

            {/* Content */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                {step.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Link to full methodology */}
      <p className="text-center text-xs text-gray-400 mt-4">
        <a href="/metodologia" className="hover:text-amber-600 underline underline-offset-2">
          Ver metodología completa y política de transparencia →
        </a>
      </p>
    </section>
  )
}
