import { CheckCircle, XCircle } from 'lucide-react'

interface ReviewScoreboardProps {
  rating: number   // 1–10
  pros: string[]
  cons: string[]
  verdict: string
}

function RatingRing({ rating }: { rating: number }) {
  // SVG circle: r=28 → circumference = 2π×28 ≈ 175.9
  const circumference = 175.9
  const fill = (rating / 10) * circumference
  const color =
    rating >= 8 ? '#1D9E75' : rating >= 6 ? '#F7A823' : '#DC2626'

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="relative w-16 h-16">
        <svg
          viewBox="0 0 64 64"
          className="w-full h-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="32" cy="32" r="28"
            fill="none" stroke="#E5E7EB" strokeWidth="6"
          />
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${fill} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900"
          aria-label={`Puntuación: ${rating} de 10`}
        >
          {rating}
        </span>
      </div>
      <span className="text-[10px] text-gray-400 font-medium">/ 10</span>
    </div>
  )
}

export function ReviewScoreboard({
  rating,
  pros,
  cons,
  verdict,
}: ReviewScoreboardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Verdict */}
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-4 flex items-start gap-4">
        <RatingRing rating={rating} />
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Veredicto
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{verdict}</p>
        </div>
      </div>

      {/* Pros / cons */}
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="p-5">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-3">
            Lo mejor
          </p>
          <ul className="space-y-2" aria-label="Ventajas">
            {pros.map((pro, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle
                  className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {pro}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-5">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-3">
            Lo mejorable
          </p>
          <ul className="space-y-2" aria-label="Desventajas">
            {cons.map((con, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <XCircle
                  className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
