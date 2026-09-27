import { type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogMovieListItem } from '@shared/catalog'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'

export function MovieGrid({ items }: { items: CatalogMovieListItem[] }): ReactElement {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((m) => (
        <li key={m.id}>
          <Link to={`/movie/${m.id}`} className="block text-left" state={{ from: 'home' }}>
            <Card className="cursor-pointer overflow-hidden pt-0 transition-shadow hover:shadow-md">
              <div className="bg-muted aspect-[2/3] w-full overflow-hidden">
                {m.posterUrl ? (
                  <img className="size-full object-cover" src={m.posterUrl} alt="" />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
                    No poster
                  </div>
                )}
              </div>
              <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
                <CardTitle className="line-clamp-2 text-sm leading-tight">{m.title}</CardTitle>
                {m.releaseYear != null && (
                  <span className="text-muted-foreground text-xs">{m.releaseYear}</span>
                )}
              </CardFooter>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
