import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { CatalogMovieDetails } from '@shared/catalog'
import type { TvShowDetails, TvShowListItem } from '@shared/tv'
import { isEpisodeMediaKey } from '@shared/tv'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { Bookmark, Library, Play, Tv, type LucideIcon } from 'lucide-react'
import { MovieCard } from '@/components/movie-card'
import { ShowCard } from '@/components/show-card'
import { useShowListFacts } from '@/components/use-show-list-facts'
import { MOVIE_GRID_CLASS } from '@/lib/movie-layout'
import { releaseYearFromDate } from '@/lib/movie-meta'
import { episodeNote, formatRemaining, loadShows, showsInProgress } from '@/lib/show-progress'

type PosterMovie = {
  id: number
  title: string
  posterUrl: string | null
  releaseYear: number | null
  runtime: number | null
  genres: string[]
  voteAverage: number | null
  progress: number | null
  note: string | null
}

type LibraryShow = TvShowListItem & { note?: string | null; progress?: number | null }

type LibraryData = {
  continueMovies: PosterMovie[]
  continueShows: LibraryShow[]
  listMovies: PosterMovie[]
  myShows: TvShowListItem[]
}

function showListItem(show: TvShowDetails): TvShowListItem {
  return {
    id: show.id,
    name: show.name,
    firstAirYear: show.firstAirYear,
    posterUrl: show.posterUrl,
    overview: show.overview,
    voteAverage: null,
    genres: []
  }
}

function watchedShare(progress: WatchProgress): number | null {
  if (progress.duration <= 0) return null
  return progress.position / progress.duration
}

async function loadMovies(ids: number[]): Promise<Map<number, CatalogMovieDetails>> {
  const out = new Map<number, CatalogMovieDetails>()
  const results = await Promise.all(ids.map((id) => window.api.catalog.getMovie(id)))
  results.forEach((res, i) => {
    if (res.ok) out.set(ids[i]!, res.movie)
  })
  return out
}

function toPosterMovie(movie: CatalogMovieDetails, progress: WatchProgress | null): PosterMovie {
  const resumable = progress != null && resumePosition(progress) > 0
  return {
    id: movie.id,
    title: movie.title,
    posterUrl: movie.posterUrl,
    releaseYear: releaseYearFromDate(movie.releaseDate),
    runtime: movie.runtime,
    genres: movie.genres,
    voteAverage: movie.voteAverage,
    progress: resumable && progress ? watchedShare(progress) : null,
    note: resumable && progress ? formatRemaining(progress) : null
  }
}

function useLibrary(): LibraryData | null {
  const [data, setData] = useState<LibraryData | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const [history, downloads, watchlist, showIds] = await Promise.all([
        window.api.history.list(),
        window.api.torrent.getAllMovieDownloads(),
        window.api.watchlist.get(),
        window.api.showWatchlist.get()
      ])
      const byId = new Map(history.map((p) => [p.movieId, p]))
      const continueIds = history
        .filter((p) => !isEpisodeMediaKey(p.movieId) && resumePosition(p) > 0)
        .map((p) => p.movieId)
      const listIds = watchlist.filter((id) => !isEpisodeMediaKey(id))
      const inProgress = showsInProgress(history, downloads)
      const movieIds = [...new Set([...continueIds, ...listIds])]
      const detailsIds = [...new Set([...inProgress.map((p) => p.showId), ...showIds])]
      const [movies, shows] = await Promise.all([loadMovies(movieIds), loadShows(detailsIds)])
      if (cancelled) return

      setData({
        continueMovies: continueIds.flatMap((id) => {
          const movie = movies.get(id)
          return movie ? [toPosterMovie(movie, byId.get(id) ?? null)] : []
        }),
        continueShows: inProgress.flatMap((p) => {
          const show = shows.get(p.showId)
          const item: TvShowListItem = show
            ? showListItem(show)
            : {
                id: p.showId,
                name: p.showName,
                firstAirYear: null,
                posterUrl: null,
                overview: '',
                voteAverage: null,
                genres: []
              }
          const share = watchedShare(p.progress)
          return [{ ...item, note: episodeNote(p), progress: share }]
        }),
        listMovies: listIds.flatMap((id) => {
          const movie = movies.get(id)
          return movie ? [toPosterMovie(movie, byId.get(id) ?? null)] : []
        }),
        myShows: showIds.flatMap((id) => {
          const show = shows.get(id)
          return show ? [showListItem(show)] : []
        })
      })
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  return data
}

function MoviePosterGrid({ movies }: { movies: PosterMovie[] }): ReactElement {
  return (
    <ul className={MOVIE_GRID_CLASS}>
      {movies.map((movie) => (
        <li key={movie.id}>
          <MovieCard
            href={`/movie/${movie.id}`}
            title={movie.title}
            posterUrl={movie.posterUrl}
            releaseYear={movie.releaseYear}
            runtime={movie.runtime}
            genres={movie.genres}
            voteAverage={movie.voteAverage}
            progress={movie.progress}
            note={movie.note}
          />
        </li>
      ))}
    </ul>
  )
}

function ShowPosterGrid({ shows }: { shows: LibraryShow[] }): ReactElement {
  const items = useShowListFacts(shows)
  return (
    <ul className={MOVIE_GRID_CLASS}>
      {items.map((show) => (
        <li key={show.id}>
          <ShowCard show={show} facts={show.facts} note={show.note} progress={show.progress} />
        </li>
      ))}
    </ul>
  )
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  count,
  children
}: {
  id: string
  icon: LucideIcon
  title: string
  description: string
  count: number
  children: ReactNode
}): ReactElement {
  return (
    <section className="space-y-4" aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={id} className="type-section">
              {title}
            </h2>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
        </div>
        <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums">
          {count}
        </span>
      </div>
      {children}
    </section>
  )
}

function Stat({ value, label }: { value: number; label: string }): ReactElement {
  return (
    <div className="bg-card border-border rounded-xl border px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  )
}

export function LibraryPage(): ReactElement {
  const data = useLibrary()
  const continueCount = (data?.continueMovies.length ?? 0) + (data?.continueShows.length ?? 0)
  const empty =
    data != null && continueCount === 0 && data.listMovies.length === 0 && data.myShows.length === 0
  const bothContinue =
    data != null && data.continueMovies.length > 0 && data.continueShows.length > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-16">
      <header className="flex items-center gap-4">
        <div className="bg-card border-border flex size-12 shrink-0 items-center justify-center rounded-2xl border">
          <Library className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="type-page">Library</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick up where you left off, and everything you saved for later.
          </p>
        </div>
      </header>

      {data == null && <p className="text-muted-foreground mt-8 text-sm">Loading…</p>}

      {empty && (
        <div className="border-border mt-10 flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <div className="bg-muted text-muted-foreground mb-4 flex size-14 items-center justify-center rounded-2xl">
            <Library className="size-7" aria-hidden />
          </div>
          <p className="text-base font-medium">Your library is empty</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Start a movie or episode, or save something to My list or My shows, and it will show up
            here.
          </p>
        </div>
      )}

      {data != null && !empty && (
        <div className="mt-12 space-y-12">
          <div className="grid max-w-xl grid-cols-3 gap-4">
            <Stat value={continueCount} label="In progress" />
            <Stat value={data.listMovies.length} label="My list" />
            <Stat value={data.myShows.length} label="My shows" />
          </div>

          {continueCount > 0 && (
            <Section
              id="library-continue"
              icon={Play}
              title="Continue watching"
              description="Movies and episodes you started"
              count={continueCount}
            >
              <div className="space-y-8">
                {data.continueMovies.length > 0 && (
                  <div className="space-y-3">
                    {bothContinue && <h3 className="type-kicker">Movies</h3>}
                    <MoviePosterGrid movies={data.continueMovies} />
                  </div>
                )}
                {data.continueShows.length > 0 && (
                  <div className="space-y-3">
                    {bothContinue && <h3 className="type-kicker">Shows</h3>}
                    <ShowPosterGrid shows={data.continueShows} />
                  </div>
                )}
              </div>
            </Section>
          )}

          {data.listMovies.length > 0 && (
            <Section
              id="library-list"
              icon={Bookmark}
              title="My list"
              description="Movies you saved"
              count={data.listMovies.length}
            >
              <MoviePosterGrid movies={data.listMovies} />
            </Section>
          )}

          {data.myShows.length > 0 && (
            <Section
              id="library-shows"
              icon={Tv}
              title="My shows"
              description="Shows you saved"
              count={data.myShows.length}
            >
              <ShowPosterGrid shows={data.myShows} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
