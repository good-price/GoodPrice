/**
 * app/opengraph-image.tsx
 *
 * Default OG image for GOODPRICE — served at /opengraph-image.
 * Next.js uses this automatically when no page-level OG image is specified.
 *
 * Generated at request time with the Edge runtime (no build step needed).
 * Size: 1200×630 — standard Open Graph recommendation.
 */

import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const alt         = 'GOODPRICE — Los mejores precios de Amazon para Colombia'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          width:           '100%',
          height:          '100%',
          background:      'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)',
          fontFamily:      'sans-serif',
          padding:         '60px',
          position:        'relative',
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          style={{
            position:        'absolute',
            inset:           0,
            backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)',
            backgroundSize:  '32px 32px',
            opacity:         0.3,
          }}
        />

        {/* Gold accent bar — top */}
        <div
          style={{
            position:   'absolute',
            top:        0,
            left:       0,
            right:      0,
            height:     '6px',
            background: 'linear-gradient(90deg, #F7A823, #ffc94a, #F7A823)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            '24px',
            position:       'relative',
            zIndex:         1,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
              background:   'rgba(247,168,35,0.15)',
              border:       '1px solid rgba(247,168,35,0.4)',
              borderRadius: '9999px',
              padding:      '8px 20px',
              color:        '#F7A823',
              fontSize:     '16px',
              fontWeight:   600,
              letterSpacing:'0.08em',
              textTransform:'uppercase',
            }}
          >
            Amazon · Colombia
          </div>

          {/* Brand name */}
          <div
            style={{
              fontSize:     '96px',
              fontWeight:   900,
              color:        '#ffffff',
              letterSpacing:'-0.02em',
              lineHeight:   1,
              textAlign:    'center',
            }}
          >
            GOOD
            <span style={{ color: '#F7A823' }}>PRICE</span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize:    '28px',
              fontWeight:  400,
              color:       '#9ca3af',
              textAlign:   'center',
              maxWidth:    '700px',
              lineHeight:  1.4,
            }}
          >
            Los mejores productos de Amazon curados para Colombia
          </div>

          {/* Stats strip */}
          <div
            style={{
              display:       'flex',
              gap:           '48px',
              marginTop:     '16px',
            }}
          >
            {[
              ['200+', 'Productos'],
              ['Precios', 'verificados'],
              ['Envío', 'a Colombia'],
            ].map(([value, label]) => (
              <div
                key={label}
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'center',
                  gap:           '4px',
                }}
              >
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#F7A823' }}>{value}</span>
                <span style={{ fontSize: '16px', color: '#6b7280' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gold accent bar — bottom */}
        <div
          style={{
            position:   'absolute',
            bottom:     0,
            left:       0,
            right:      0,
            height:     '4px',
            background: 'linear-gradient(90deg, transparent, #F7A823, transparent)',
          }}
        />
      </div>
    ),
    { ...size },
  )
}
