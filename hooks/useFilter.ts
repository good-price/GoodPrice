'use client'

import { useState, useMemo } from 'react'
import { Product, FilterState, SortOption } from '@/types'

const defaultFilters: FilterState = {
  category: '',
  minPrice: 0,
  maxPrice: 1000,
  minRating: 0,
  brand: '',
  isTopSeller: false,
  isOffer: false,
  sortBy: 'relevance',
}

export function useFilter(products: Product[]) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)

  const filtered = useMemo(() => {
    let result = [...products]

    if (filters.category) {
      result = result.filter(p => p.category === filters.category)
    }
    if (filters.brand) {
      result = result.filter(p => p.brand?.toLowerCase() === filters.brand.toLowerCase())
    }
    if (filters.minRating > 0) {
      result = result.filter(p => p.rating >= filters.minRating)
    }
    if (filters.isTopSeller) {
      result = result.filter(p => p.isTopSeller)
    }
    if (filters.isOffer) {
      result = result.filter(p => p.isOffer)
    }

    result = result.filter(p => p.price >= filters.minPrice && p.price <= filters.maxPrice)

    switch (filters.sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        result.sort((a, b) => b.price - a.price)
        break
      case 'rating':
        result.sort((a, b) => b.rating - a.rating)
        break
      case 'reviews':
        result.sort((a, b) => b.reviews - a.reviews)
        break
    }

    return result
  }, [products, filters])

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => setFilters(defaultFilters)

  return { filters, filtered, updateFilter, resetFilters }
}
