'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/hooks/useSearch'

export function SearchBar() {
  const { query, setQuery, handleSearch } = useSearch()

  return (
    <form onSubmit={handleSearch} className="flex w-full max-w-2xl">
      <Input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar productos..."
        className="rounded-r-none border-r-0 h-10 bg-white text-sm focus-visible:ring-0 focus-visible:ring-offset-0 border-gray-300"
      />
      <Button
        type="submit"
        className="rounded-l-none h-10 px-4 bg-[#F7A823] hover:bg-[#e8961a] text-black border border-[#F7A823]"
      >
        <Search className="h-4 w-4" />
      </Button>
    </form>
  )
}
