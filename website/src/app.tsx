import { useEffect, useState, type ReactElement } from 'react'
import { DownloadPanel, DownloadsProvider } from './download-panel'
import { GITHUB_URL } from './downloads'
import { Faq } from './faq'
import { PosterWall } from './poster-wall'
import { loadPosterUrls } from './posters'
import { Walkthrough } from './walkthrough'

const navLink =
  'inline-flex min-h-11 items-center rounded-full px-4 no-underline transition-colors duration-300 ease-fluid hover:bg-white/10'

export function App(): ReactElement {
  const [posters, setPosters] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    loadPosterUrls(controller.signal)
      .then((urls) => {
        if (!controller.signal.aborted) setPosters(urls)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <DownloadsProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-popcorn px-4 py-2 text-popcorn-ink focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <a
            className="flex min-h-11 items-center gap-3 no-underline"
            href="/"
            aria-label="Popcorn Bucket home"
          >
            <img src="/favicon.png" alt="" width={36} height={36} className="size-9" />
            <span className="hidden text-lg font-semibold [font-stretch:112%] sm:inline">
              Popcorn Bucket
            </span>
          </a>
          <nav
            className="flex items-center gap-1 rounded-full bg-theater/75 p-1 text-sm font-medium ring-1 ring-white/10 backdrop-blur-xl"
            aria-label="Main"
          >
            <a className={navLink} href="#how">
              How it works
            </a>
            <a className={navLink} href="#faq">
              FAQ
            </a>
            <a className={`${navLink} max-sm:hidden`} href={GITHUB_URL}>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="relative isolate flex min-h-svh items-end overflow-hidden lg:items-center">
          <PosterWall posters={posters} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(20_22_29/0.7)_0%,rgb(20_22_29/0.35)_30%,rgb(20_22_29/0.92)_68%,#14161d_100%)] lg:bg-[linear-gradient(90deg,#14161d_0%,rgb(20_22_29/0.94)_34%,rgb(20_22_29/0.35)_62%,rgb(20_22_29/0.15)_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,#14161d)]"
          />

          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-40 pb-16 lg:py-32">
            <h1 className="m-0 text-6xl leading-[0.92] font-bold tracking-[-0.01em] [font-stretch:75%] sm:text-7xl lg:text-8xl">
              Movies and TV,
              <br />
              <span className="sm:whitespace-nowrap">
                without the <span className="whitespace-nowrap">tab juggling</span>
              </span>
            </h1>
            <p className="mt-6 mb-0 max-w-[34rem] text-lg text-ink/85 lg:text-xl">
              Popcorn Bucket is a desktop app that finds a torrent for anything you browse, starts
              playing it, and remembers where you stopped.
            </p>
            <div className="mt-10">
              <DownloadPanel />
            </div>
          </div>
        </section>

        <Walkthrough />
        <Faq />

        <section aria-labelledby="get-title" className="px-4 pt-8 pb-24 sm:px-6">
          <div className="relative isolate mx-auto flex min-h-[560px] max-w-7xl items-end overflow-hidden rounded-3xl ring-1 ring-line lg:items-center">
            <PosterWall posters={posters} />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(20_22_29/0.4)_0%,rgb(20_22_29/0.94)_62%)] lg:bg-[linear-gradient(90deg,#14161d_0%,rgb(20_22_29/0.92)_40%,rgb(20_22_29/0.2)_100%)]"
            />
            <div className="relative z-10 flex flex-col items-start gap-8 p-8 sm:p-12 lg:p-16">
              <h2
                id="get-title"
                className="m-0 max-w-[12ch] text-6xl leading-[0.92] font-bold [font-stretch:75%] lg:text-7xl"
              >
                Your next movie is two clicks away
              </h2>
              <DownloadPanel />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">
            Made by{' '}
            <a className="text-ink underline" href="https://github.com/joshmarom">
              Josh Marom
            </a>
            . Source on{' '}
            <a className="text-ink underline" href={GITHUB_URL}>
              GitHub
            </a>
            .
          </p>
          <p className="m-0 max-w-[60ch]">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>
      </footer>
    </DownloadsProvider>
  )
}
