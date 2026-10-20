import type { ReactElement, ReactNode } from 'react'

const questions: { q: string; a: ReactNode }[] = [
  {
    q: 'What does it cost?',
    a: 'Nothing. Popcorn Bucket is free, and the source is on GitHub.'
  },
  {
    q: 'macOS says the app cannot be opened',
    a: 'The Mac build is not notarized by Apple yet. Open System Settings, go to Privacy and Security, and choose Open Anyway next to Popcorn Bucket. You only do this once.'
  },
  {
    q: 'Windows shows a SmartScreen warning',
    a: 'The installer is not code signed yet. Choose More info, then Run anyway.'
  },
  {
    q: 'Does it run on Intel Macs?',
    a: 'Not yet. The macOS download is built for Apple silicon.'
  },
  {
    q: 'Do I need anything else installed?',
    a: (
      <>
        No. The app plays MP4, MKV, WebM, and MOV on its own. For formats it cannot open, like AVI,
        install{' '}
        <a className="text-ink underline" href="https://mpv.io/">
          mpv
        </a>{' '}
        and Popcorn Bucket hands the file over and keeps tracking your place.
      </>
    )
  },
  {
    q: 'Where do the videos come from?',
    a: 'Public torrent indexers. Popcorn Bucket does not host any video. Check what you are allowed to download where you live.'
  }
]

export function Faq(): ReactElement {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl px-6 py-24">
      <h2 id="faq-title" className="m-0 text-5xl leading-none font-bold [font-stretch:75%]">
        Before you install
      </h2>
      <div className="mt-12 border-t border-line">
        {questions.map((item) => (
          <details key={item.q} className="group border-b border-line">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-xl font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              {item.q}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5 shrink-0 text-muted transition-transform duration-500 ease-fluid group-open:rotate-45"
              >
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" fill="none" />
              </svg>
            </summary>
            <p className="mt-0 mb-6 max-w-[60ch] text-lg text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
