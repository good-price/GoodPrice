'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export function useSearch() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const trimmed = query.trim()
      if (trimmed) {
        router.push(`/productos?q=${encodeURIComponent(trimmed)}`)
      }
    },
    [query, router]
  )

  return { query, setQuery, handleSearch }
}
