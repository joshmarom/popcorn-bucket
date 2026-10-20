import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'

const COLUMNS = 7
const PER_COLUMN = 9
const DURATIONS = [64, 82, 58, 90, 70, 86, 62]

export function PosterWall({ posters }: { posters: string[] }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const columns = useMemo(() => splitColumns(posters), [posters])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? true)
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [perspective:1400px]"
    >
      {columns.length > 0 ? (
        // Columns loop by translating -50%, so the viewport sits a quarter of the way down.
        <motion.div
          className="absolute top-1/2 left-1/2 flex w-[170%] gap-4 sm:w-[140%] lg:left-[62%] lg:w-[115%]"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, x: '-50%', y: '-21%', rotateX: 24, rotateZ: -14, scale: 1.12 }}
          animate={{ opacity: 1, x: '-50%', y: '-25%', rotateX: 22, rotateZ: -12, scale: 1 }}
          transition={{ duration: 1.8, ease: [0.32, 0.72, 0, 1] }}
        >
          {columns.map((column, index) => (
            <div
              key={index}
              className="wall-column flex min-w-0 flex-1 flex-col"
              style={
                {
                  '--wall-duration': `${DURATIONS[index % DURATIONS.length]}s`,
                  '--wall-direction': index % 2 === 0 ? 'normal' : 'reverse',
                  '--wall-state': visible ? 'running' : 'paused'
                } as React.CSSProperties
              }
            >
              {[...column, ...column].map((src, tile) => (
                <div key={`${src}-${tile}`} className="pb-4">
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    decoding="async"
                    className="aspect-[2/3] w-full rounded-lg bg-surface object-cover shadow-[0_20px_40px_rgb(0_0_0/0.5)]"
                  />
                </div>
              ))}
            </div>
          ))}
        </motion.div>
      ) : null}
    </div>
  )
}

function splitColumns(posters: string[]): string[][] {
  if (posters.length === 0) return []
  const columns: string[][] = Array.from({ length: COLUMNS }, () => [])
  let cursor = 0
  for (let tile = 0; tile < COLUMNS * PER_COLUMN; tile += 1) {
    columns[tile % COLUMNS]?.push(posters[cursor % posters.length] ?? '')
    cursor += 1
  }
  return columns
}
