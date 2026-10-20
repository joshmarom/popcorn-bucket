import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactElement } from 'react'

const steps = [
  {
    title: 'Browse what is on',
    body: 'Trending movies and shows, streaming top 10s, and genre rows sit in one window. Search covers movies, shows, and collections at once.',
    src: '/screenshots/discover.png',
    alt: 'The Popcorn Bucket home screen with trending movie posters'
  },
  {
    title: 'Get the full picture',
    body: 'A title opens onto its backdrop, poster, cast, and trailers. The story is a few lines, and play sits under the poster when you are ready.',
    src: '/screenshots/overview.png',
    alt: 'A movie overview with a backdrop, poster, cast, and a play button'
  },
  {
    title: 'Press play',
    body: 'Play asks eight torrent indexers at once, picks the best release for your quality setting, and starts streaming. Every source is listed with its size and seeders if you would rather choose.',
    src: '/screenshots/play.png',
    alt: 'A movie page listing torrent sources with quality, size, and seeders'
  },
  {
    title: 'Pick up where you stopped',
    body: 'Your place is saved every few seconds, including when a file opens in mpv. Continue watching keeps it one click away, and My list holds the rest.',
    src: '/screenshots/resume.png',
    alt: 'The Popcorn Bucket library with movies under Continue watching'
  }
]

export function Walkthrough(): ReactElement {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  const reduce = useReducedMotion()

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = refs.current.indexOf(entry.target as HTMLElement)
          if (index >= 0) setActive(index)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )
    for (const el of refs.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const step = steps[active] ?? steps[0]!

  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
      <h2
        id="how-title"
        className="m-0 max-w-[16ch] text-5xl leading-none font-bold [font-stretch:75%] lg:text-6xl"
      >
        From trailer to couch in four steps
      </h2>

      <div className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <ol className="m-0 list-none p-0">
          {steps.map((item, index) => (
            <li
              key={item.title}
              ref={(el) => {
                refs.current[index] = el
              }}
              className="flex flex-col gap-6 py-10 lg:min-h-[64vh] lg:justify-center lg:py-0"
            >
              <div
                className={`transition-opacity duration-500 ease-fluid ${
                  active === index ? 'lg:opacity-100' : 'lg:opacity-35'
                }`}
              >
                <p className="m-0 text-sm font-semibold text-popcorn">
                  Step {index + 1} of {steps.length}
                </p>
                <h3 className="mt-3 mb-0 text-3xl leading-tight font-semibold">{item.title}</h3>
                <p className="mt-4 mb-0 max-w-[48ch] text-lg text-muted">{item.body}</p>
              </div>
              <img
                src={item.src}
                alt={item.alt}
                width={1600}
                height={1000}
                loading="lazy"
                className="w-full rounded-xl ring-1 ring-line lg:hidden"
              />
            </li>
          ))}
        </ol>

        <div className="hidden lg:block">
          <div className="sticky top-[14vh]">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface shadow-[0_40px_80px_rgb(0_0_0/0.55)] ring-1 ring-line">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.img
                  key={step.src}
                  src={step.src}
                  alt={step.alt}
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
                />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
