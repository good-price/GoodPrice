/**
 * /metodologia — Methodology & Transparency
 *
 * Static page explaining how GOODPRICE works:
 * - Amazon-Only strategy and catalog philosophy
 * - How prices are sourced and validated
 * - How price tracking and alerts operate
 * - Affiliate relationship and trust principles
 *
 * Server Component. No JS needed.
 */

import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Cómo funciona GOODPRICE | Metodología y transparencia',
  description:
    'Descubre cómo GOODPRICE selecciona productos de Amazon para Colombia, ' +
    'cómo rastreamos precios y cómo funcionan las alertas inteligentes.',
  alternates: { canonical: `${SITE_URL}/metodologia` },
  openGraph: {
    title:       'Cómo funciona GOODPRICE | Metodología y transparencia',
    description: 'Cómo GOODPRICE selecciona productos Amazon para Colombia, rastrea precios y dispara alertas.',
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
  { id: 'catalogo',       label: 'Catálogo y selección'         },
  { id: 'precios',        label: 'Precios y seguimiento'         },
  { id: 'validacion',     label: 'Validación automática'         },
  { id: 'alertas',        label: 'Alertas de precio'             },
  { id: 'afiliados',      label: 'Relación con afiliados'        },
  { id: 'limitaciones',   label: 'Limitaciones'                  },
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
          GOODPRICE es una plataforma de curaduría Amazon para compradores en Colombia.
          Seleccionamos, validamos y rastreamos productos de Amazon para que tomes decisiones
          de compra con datos reales, sin ruido y con contexto de precio local.
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

      {/* ── 1. Catálogo y selección ───────────────────────────────────────── */}
      <Section id="catalogo" title="1. Catálogo y selección de productos">
        <p>
          Todos los productos de GOODPRICE provienen exclusivamente de{' '}
          <strong>Amazon</strong>. No comparamos con otros marketplaces. Esta decisión
          es intencional: nos permite controlar la calidad del catálogo, garantizar que
          los precios son verificables y mantener una experiencia consistente.
        </p>
        <p>
          Cada producto pasa por un proceso de selección manual antes de entrar al
          catálogo:
        </p>
        <ol className="list-decimal list-inside flex flex-col gap-2 ml-1">
          <li>
            Verificamos que el ASIN sea válido y el producto esté activo en Amazon.
          </li>
          <li>
            Validamos que la imagen principal sea accesible y de calidad aceptable.
          </li>
          <li>
            Confirmamos que el producto sea relevante para compradores en Colombia
            (disponible con envío internacional o a través de revendedores locales).
          </li>
          <li>
            Asignamos una puntuación de confianza basada en reseñas, precio y
            consistencia histórica. Solo los productos con puntuación suficiente son
            visibles al público.
          </li>
        </ol>
        <Callout type="info">
          El catálogo actual tiene <strong>99 productos curados</strong> en 10
          categorías. Agregamos nuevos productos cuando superan todos los criterios de
          validación.
        </Callout>
      </Section>

      {/* ── 2. Precios y seguimiento ──────────────────────────────────────── */}
      <Section id="precios" title="2. Precios y seguimiento">
        <div>
          <p className="font-semibold text-gray-800 mb-1">Fuente de precios</p>
          <p>
            Los precios de nuestro catálogo son precios de referencia en USD obtenidos
            de Amazon.com. Los actualizamos periódicamente mediante un proceso
            automatizado que consulta Amazon directamente.
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">Conversión a pesos colombianos</p>
          <p>
            Mostramos precios en COP usando la <strong>Tasa de Cambio de Referencia
            (TRM)</strong> del Banco de la República de Colombia, actualizada
            diariamente. La conversión es automática y se refleja en todas las páginas
            de producto.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Fuente de precios',   value: 'Amazon.com'               },
            { label: 'Moneda base',         value: 'USD'                      },
            { label: 'Conversión COP',      value: 'TRM diaria'               },
            { label: 'Historial',           value: 'Hasta 90 días de datos'   },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>
        <Callout type="warning">
          El precio en Amazon puede cambiar en cualquier momento. Siempre verifica el
          precio final en Amazon antes de confirmar tu compra.
        </Callout>
      </Section>

      {/* ── 3. Validación automática ──────────────────────────────────────── */}
      <Section id="validacion" title="3. Validación automática del catálogo">
        <p>
          Un proceso automático diario revisa todos los productos del catálogo para
          detectar y corregir problemas:
        </p>
        <ul className="flex flex-col gap-2">
          {[
            { label: 'Imágenes rotas', desc: 'Detecta URLs de imagen que fallan y las repara automáticamente cuando es posible (swap de CDN Amazon).' },
            { label: 'ASINs inactivos', desc: 'Identifica productos que Amazon ha dado de baja y los marca para revisión.' },
            { label: 'Restricciones Colombia', desc: 'Detecta productos con restricciones de envío a Colombia y los señala en el catálogo.' },
            { label: 'Puntuación de confianza', desc: 'Recalcula la puntuación de cada producto. Los que caen por debajo del umbral mínimo se ocultan automáticamente.' },
          ].map(({ label, desc }) => (
            <li key={label} className="flex gap-3">
              <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
              <span>
                <strong className="text-gray-800">{label}:</strong>{' '}
                {desc}
              </span>
            </li>
          ))}
        </ul>
        <Callout type="success">
          Este proceso mantiene la calidad del catálogo sin intervención manual
          constante. Los errores que no se pueden reparar automáticamente se registran
          para revisión del equipo.
        </Callout>
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
          La relación de afiliados <strong>no influye en la selección del catálogo</strong>.
          Incluimos únicamente productos que consideramos genuinamente útiles y bien
          valorados por compradores. Si un producto cae por debajo de nuestros criterios
          de calidad, lo ocultamos aunque siga generando comisión.
        </p>
      </Section>

      {/* ── 6. Limitaciones ───────────────────────────────────────────────── */}
      <Section id="limitaciones" title="6. Limitaciones importantes">
        <p>Queremos ser honestos sobre lo que GOODPRICE no garantiza:</p>
        <ul className="flex flex-col gap-2">
          {[
            'Los precios pueden cambiar en tiempo real. Siempre verifica el precio final en Amazon antes de confirmar tu compra.',
            'El costo de envío internacional (~$12 USD estimado) puede variar según el peso, el vendedor y el destino exacto dentro de Colombia.',
            'La disponibilidad puede cambiar entre el momento en que rastreamos el precio y el momento en que haces tu compra.',
            'El historial de precios refleja los datos que hemos recopilado desde que empezamos a rastrear el producto. No tenemos datos previos a esa fecha.',
            'El proceso de validación automática puede cometer errores. Si detectas un producto con información incorrecta, escríbenos.',
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
        <p>Última actualización de esta página: junio 2026.</p>
      </div>

    </div>
  )
}
