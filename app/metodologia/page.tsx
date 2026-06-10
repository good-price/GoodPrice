/**
 * /metodologia — Methodology & Transparency
 *
 * Static page explaining how GOODPRICE works:
 * - How prices are sourced and updated
 * - How product matching works
 * - How alerts fire and cooldown
 * - Affiliate relationship
 * - Limitations (honest)
 *
 * Server Component. No JS needed.
 */

import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Cómo funciona GOODPRICE | Metodología y transparencia',
  description:
    'Entiende cómo GOODPRICE compara precios de Amazon y MercadoLibre Colombia, ' +
    'cómo funcionan las alertas de precio y nuestra relación con los afiliados.',
  alternates: { canonical: `${SITE_URL}/metodologia` },
  openGraph: {
    title:       'Cómo funciona GOODPRICE | Metodología y transparencia',
    description: 'Entiende cómo GOODPRICE compara precios de Amazon y MercadoLibre Colombia.',
    url:         `${SITE_URL}/metodologia`,
    type:        'website',
  },
}

export const revalidate = 86400

// ── Section primitives ────────────────────────────────────────────────────────

function Section({ id, title, children }: {
  id: string; title: string; children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mb-10">
      <h2
        id={`${id}-heading`}
        className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100"
      >
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-gray-600 leading-relaxed">
        {children}
      </div>
    </section>
  )
}

function Callout({ type, children }: {
  type: 'info' | 'warning' | 'success'; children: React.ReactNode
}) {
  const styles = {
    info:    'bg-blue-50 border-blue-100 text-blue-800',
    warning: 'bg-amber-50 border-amber-100 text-amber-800',
    success: 'bg-emerald-50 border-emerald-100 text-emerald-800',
  }
  return (
    <div className={`text-sm rounded-xl border px-4 py-3 leading-relaxed ${styles[type]}`}>
      {children}
    </div>
  )
}

// ── Table of contents ─────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: 'fuentes',        label: 'Fuentes de precios'          },
  { id: 'comparacion',    label: 'Cómo comparamos'             },
  { id: 'actualizacion',  label: 'Frecuencia de actualización' },
  { id: 'alertas',        label: 'Alertas de precio'           },
  { id: 'afiliados',      label: 'Relación con afiliados'      },
  { id: 'limitaciones',   label: 'Limitaciones'                },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetodologiaPage() {
  return (
    <div className="max-w-2xl mx-auto">

      {/* Back */}
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver al inicio
      </a>

      {/* Page header */}
      <header className="mb-8">
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-1">
          Transparencia
        </p>
        <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mb-3">
          Cómo funciona GOODPRICE
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          GOODPRICE es una plataforma independiente de comparación de precios para
          compradores en Colombia. Comparamos precios de Amazon y MercadoLibre en
          tiempo real para que puedas tomar decisiones de compra con datos reales.
        </p>
      </header>

      {/* Table of contents */}
      <nav
        aria-label="Contenido"
        className="mb-10 bg-gray-50 rounded-xl border border-gray-100 p-4"
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          En esta página
        </p>
        <ol className="flex flex-col gap-1.5">
          {TOC_ITEMS.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-sm text-gray-600 hover:text-amber-600 transition-colors flex items-center gap-2"
              >
                <span className="text-gray-300 tabular-nums text-xs">{i + 1}.</span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── 1. Fuentes de precios ─────────────────────────────────────────── */}
      <Section id="fuentes" title="1. Fuentes de precios">
        <div>
          <p className="font-semibold text-gray-800 mb-1">🇺🇸 Amazon</p>
          <p>
            Los precios de Amazon en nuestro catálogo son precios de referencia en USD
            obtenidos del catálogo de Amazon.com. Los mantenemos actualizados cuando hay
            cambios significativos en los productos que seguimos. Para el precio exacto
            siempre recomendamos verificar en Amazon antes de comprar.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">🇨🇴 MercadoLibre Colombia</p>
          <p>
            Los precios de MercadoLibre se obtienen automáticamente usando la{' '}
            <strong>API pública oficial de MercadoLibre</strong> (api.mercadolibre.com).
            Usamos el catálogo de MercadoLibre Colombia (sitio MCO) para mostrar precios
            en pesos colombianos (COP), convertidos a USD usando la tasa de cambio vigente.
          </p>
        </div>
        <Callout type="info">
          No hacemos scraping de ningún sitio web. Todos los datos de MercadoLibre
          provienen de su API oficial, respetando sus términos de servicio y límites de
          velocidad.
        </Callout>
      </Section>

      {/* ── 2. Comparación ────────────────────────────────────────────────── */}
      <Section id="comparacion" title="2. Cómo hacemos la comparación">
        <p>
          Para cada producto de nuestro catálogo, buscamos el equivalente más cercano en
          MercadoLibre Colombia usando un <strong>algoritmo de coincidencia automática</strong>:
        </p>
        <ol className="list-decimal list-inside flex flex-col gap-2 ml-1">
          <li>
            Buscamos en ML con el nombre y características del producto (marca, modelo,
            categoría).
          </li>
          <li>
            Puntuamos cada resultado según: similitud del título, rango de precio
            esperado, calidad del listado y disponibilidad.
          </li>
          <li>
            Solo confirmamos la coincidencia cuando la puntuación supera un umbral mínimo
            de confianza. Si no encontramos una coincidencia confiable, no mostramos
            precio de ML para ese producto.
          </li>
        </ol>
        <div>
          <p className="font-semibold text-gray-800 mb-1">Costo total estimado</p>
          <p>
            Para facilitar la comparación, calculamos un <strong>costo total estimado</strong>:
          </p>
          <ul className="list-disc list-inside ml-1 flex flex-col gap-1 mt-1">
            <li>
              <strong>Amazon:</strong> precio + ~$12 USD de envío internacional
              (estimado para Colombia, 15–30 días hábiles).
            </li>
            <li>
              <strong>MercadoLibre:</strong> precio local incluyendo envío
              (generalmente gratuito en productos con envío estándar).
            </li>
          </ul>
        </div>
        <Callout type="warning">
          El envío de Amazon es un estimado. El costo real puede variar según el peso,
          el vendedor y el método de envío elegido. Siempre verifica en Amazon antes de comprar.
        </Callout>
      </Section>

      {/* ── 3. Actualización ──────────────────────────────────────────────── */}
      <Section id="actualizacion" title="3. Frecuencia de actualización">
        <p>
          Los precios de MercadoLibre se actualizan <strong>cada hora</strong> de forma
          automática mediante un proceso programado (cron job). La hora de la última
          actualización aparece en cada página de producto.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Frecuencia', value: 'Cada hora'                 },
            { label: 'Fuente',     value: 'API oficial de ML'         },
            { label: 'Cobertura',  value: '19 productos (creciendo)'  },
            { label: 'Historial',  value: 'Hasta 90 días de datos'    },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 4. Alertas ────────────────────────────────────────────────────── */}
      <Section id="alertas" title="4. Alertas de precio">
        <p>
          Las alertas son completamente gratuitas y no requieren registro. Funcionan en
          dos capas:
        </p>
        <div>
          <p className="font-semibold text-gray-800 mb-1">Seguimiento local (sin email)</p>
          <p>
            Al tocar &ldquo;Seguir precio&rdquo;, guardamos el producto en tu dispositivo
            (localStorage del navegador). No enviamos datos a ningún servidor. Puedes ver
            tus productos seguidos en{' '}
            <a href="/seguimiento" className="text-amber-600 hover:underline">
              /seguimiento
            </a>
            .
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">Alertas por email (opcional)</p>
          <p>
            Si proporcionas tu email, guardamos una suscripción en nuestros servidores y
            te enviamos un correo cuando se cumpla tu criterio de alerta:
          </p>
          <ul className="list-disc list-inside ml-1 flex flex-col gap-1 mt-1">
            <li>
              <strong>Cualquier caída:</strong> cuando el precio baja ≥3% respecto al
              promedio de los últimos 7 días.
            </li>
            <li>
              <strong>Mínimo histórico:</strong> cuando el precio alcanza el valor más
              bajo registrado (con tolerancia del 5%).
            </li>
            <li>
              <strong>Precio objetivo:</strong> cuando el precio cruza el límite en USD
              que tú defines.
            </li>
          </ul>
        </div>
        <Callout type="success">
          <strong>Anti-spam:</strong> máximo un email por suscripción cada 24 horas,
          aunque el precio siga cumpliendo el criterio. Puedes cancelar con un clic desde
          el enlace al pie de cualquier email de alerta.
        </Callout>
        <p>
          Tu email se usa exclusivamente para enviarte la alerta que solicitaste. No lo
          compartimos con terceros ni te añadimos a ninguna lista de marketing.
        </p>
      </Section>

      {/* ── 5. Afiliados ──────────────────────────────────────────────────── */}
      <Section id="afiliados" title="5. Relación con afiliados">
        <p>
          GOODPRICE es un sitio participante en el{' '}
          <strong>Programa de Afiliados de Amazon</strong> (tag: upgoodprice-20). Cuando
          compras a través de nuestros enlaces de Amazon, recibimos una pequeña comisión
          de Amazon.
        </p>
        <Callout type="info">
          Esta comisión <strong>no tiene ningún costo adicional para ti</strong>. El precio
          que pagas en Amazon es exactamente el mismo que si llegaras directamente. La
          comisión la paga Amazon, no tú.
        </Callout>
        <p>
          No somos afiliados de MercadoLibre. Mostramos precios de MercadoLibre como
          referencia informativa usando su API pública. Los enlaces a MercadoLibre no
          generan comisión para GOODPRICE.
        </p>
        <p>
          La relación de afiliados <strong>no influye en la objetividad</strong> de
          nuestra comparación. Mostramos el mejor precio independientemente de si es
          Amazon o MercadoLibre, incluyendo cuando MercadoLibre resulta más barato.
        </p>
      </Section>

      {/* ── 6. Limitaciones ───────────────────────────────────────────────── */}
      <Section id="limitaciones" title="6. Limitaciones importantes">
        <p>Queremos ser honestos sobre lo que GOODPRICE no garantiza:</p>
        <ul className="flex flex-col gap-2">
          {[
            'Los precios pueden cambiar en tiempo real. Siempre verifica el precio final antes de confirmar tu compra.',
            'El costo de envío de Amazon (~$12 USD) es un estimado. El valor exacto depende del peso, vendedor y destino.',
            'La disponibilidad en MercadoLibre puede variar según el vendedor individual.',
            'El producto encontrado en MercadoLibre puede ser de un vendedor diferente al oficial de la marca.',
            'El algoritmo de coincidencia puede cometer errores. Si detectas una comparación incorrecta, escríbenos.',
            'El historial de precios refleja los datos que hemos recopilado desde que empezamos a rastrear el producto. No tenemos datos previos a esa fecha.',
          ].map(text => (
            <li key={text} className="flex gap-2">
              <span className="text-gray-300 mt-0.5 flex-shrink-0">·</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Footer note */}
      <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400 flex flex-col gap-1">
        <p>
          ¿Tienes preguntas o encontraste un error en los datos?{' '}
          Escríbenos a{' '}
          <a href="mailto:hola@goodprice.co" className="text-amber-500 hover:underline">
            hola@goodprice.co
          </a>
        </p>
        <p>Última actualización de esta página: mayo 2026.</p>
      </div>

    </div>
  )
}
