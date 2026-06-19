'use client'

import Link from 'next/link'
import { Menu, Tag, TrendingUp, Grid3X3, BookOpen, Layers, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SearchCommand } from './search/SearchCommand'
import { CATEGORY_PAGES } from '@/data/category-pages'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#1a1f2e] shadow-md">
      <div className="flex items-center gap-3 px-4 py-2 max-w-7xl mx-auto">

        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <span className="text-white font-extrabold text-xl tracking-tight">
            GOOD<span className="text-[#F7A823]">PRICE</span>
          </span>
        </Link>

        {/*
          SearchCommand renders two things inside this flex row:
            1. Desktop: hidden md:flex flex-1 fake search bar (takes middle space)
            2. Mobile:  md:hidden icon button (sits between logo and hamburger)
          The modal it spawns is portaled to document.body and bypasses this
          header's z-index stacking context.
        */}
        <SearchCommand />

        {/* Desktop nav links — pushed right by SearchCommand's flex-1 */}
        <nav className="hidden lg:flex items-center gap-1">
          <Link href="/categorias">
            <Button variant="ghost" size="sm" className="text-white hover:text-[#F7A823] hover:bg-white/10 gap-1.5">
              <Grid3X3 className="h-4 w-4" />
              Categorías
            </Button>
          </Link>
          <Link href="/ofertas">
            <Button variant="ghost" size="sm" className="text-white hover:text-[#F7A823] hover:bg-white/10 gap-1.5">
              <Tag className="h-4 w-4" />
              Ofertas
            </Button>
          </Link>
          <Link href="/top-ventas">
            <Button variant="ghost" size="sm" className="text-white hover:text-[#F7A823] hover:bg-white/10 gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Top ventas
            </Button>
          </Link>
          <Link href="/guias">
            <Button variant="ghost" size="sm" className="text-white hover:text-[#F7A823] hover:bg-white/10 gap-1.5">
              <BookOpen className="h-4 w-4" />
              Guías
            </Button>
          </Link>
          <Link href="/seguimiento">
            <Button variant="ghost" size="sm" className="text-white hover:text-[#F7A823] hover:bg-white/10 gap-1.5">
              <Bell className="h-4 w-4" />
              Seguimiento
            </Button>
          </Link>
        </nav>

        {/* Mobile hamburger — ml-auto pushes it to the far right */}
        <div className="lg:hidden ml-auto">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                aria-label="Menú"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-[#1a1f2e] border-white/10 p-0">
              <div className="p-4 border-b border-white/10">
                <span className="text-white font-extrabold text-xl">
                  GOOD<span className="text-[#F7A823]">PRICE</span>
                </span>
              </div>
              <nav className="flex flex-col p-4 gap-1">
                <Link href="/categorias">
                  <Button variant="ghost" className="w-full justify-start text-white hover:text-[#F7A823] hover:bg-white/10 gap-2">
                    <Grid3X3 className="h-4 w-4" /> Categorías
                  </Button>
                </Link>
                <Link href="/ofertas">
                  <Button variant="ghost" className="w-full justify-start text-white hover:text-[#F7A823] hover:bg-white/10 gap-2">
                    <Tag className="h-4 w-4" /> Ofertas
                  </Button>
                </Link>
                <Link href="/top-ventas">
                  <Button variant="ghost" className="w-full justify-start text-white hover:text-[#F7A823] hover:bg-white/10 gap-2">
                    <TrendingUp className="h-4 w-4" /> Top ventas
                  </Button>
                </Link>
                <Link href="/guias">
                  <Button variant="ghost" className="w-full justify-start text-white hover:text-[#F7A823] hover:bg-white/10 gap-2">
                    <BookOpen className="h-4 w-4" /> Guías de compra
                  </Button>
                </Link>
                <Link href="/seguimiento">
                  <Button variant="ghost" className="w-full justify-start text-white hover:text-[#F7A823] hover:bg-white/10 gap-2">
                    <Bell className="h-4 w-4" /> Mis alertas
                  </Button>
                </Link>

                {/* Category landing pages */}
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-3 mb-2 flex items-center gap-1.5">
                    <Layers className="h-3 w-3" />
                    Guías por categoría
                  </p>
                  {CATEGORY_PAGES.map(cat => (
                    <Link key={cat.slug} href={`/categoria/${cat.slug}`}>
                      <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-[#F7A823] hover:bg-white/10 gap-2 text-sm">
                        <span aria-hidden="true">{cat.icon}</span>
                        {cat.name}
                      </Button>
                    </Link>
                  ))}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

      </div>
      {/* Mobile search row removed — SearchCommand's icon button is now inline */}
    </header>
  )
}
