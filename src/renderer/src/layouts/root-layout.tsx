import { Suspense, useState, type ReactElement } from 'react'
import { ScrollContainerContext } from '@/lib/scroll-container'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ScreenTransitionProvider } from '@/lib/screen-transition'
import { Download, Library, Settings, type LucideIcon } from 'lucide-react'
import { BROWSE_SECTION_ORDER, BROWSE_SECTIONS, browseSectionForPath } from '@/lib/browse-sections'
import { cn } from '@/lib/utils'

import popcornUrl from '../../../../resources/popcorn.png?url'

function NavItem({
  to,
  label,
  icon: Icon,
  active
}: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
}): ReactElement {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors outline-none',
        'focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-offset-2',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:text-sidebar-foreground'
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span
        className={cn(
          'text-[0.6875rem] leading-tight transition-colors',
          active
            ? 'text-sidebar-accent-foreground'
            : 'text-muted-foreground/70 group-hover:text-sidebar-foreground'
        )}
      >
        {label}
      </span>
    </Link>
  )
}

export function RootLayout(): ReactElement {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const { pathname } = useLocation()
  const section = browseSectionForPath(pathname)
  const at = (path: string): boolean => pathname === path || pathname.startsWith(`${path}/`)

  return (
    <ScreenTransitionProvider>
      <div className="bg-background flex h-screen overflow-hidden border-border">
        <aside
          className="border-sidebar-border bg-sidebar flex h-full min-h-0 w-20 shrink-0 flex-col items-center border-r py-4"
          style={{ viewTransitionName: 'persistent-nav' }}
        >
          <Link
            to="/"
            aria-label="Popcorn Bucket"
            className="focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar flex size-12 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <img src={popcornUrl} alt="" className="size-9 select-none" draggable={false} />
          </Link>

          <nav className="mt-10 flex min-h-0 flex-1 flex-col items-center" aria-label="Main">
            <div className="flex flex-col items-center gap-1">
              {BROWSE_SECTION_ORDER.map((id) => (
                <NavItem
                  key={id}
                  to={BROWSE_SECTIONS[id].path}
                  label={BROWSE_SECTIONS[id].label}
                  icon={BROWSE_SECTIONS[id].icon}
                  active={section === id}
                />
              ))}
            </div>

            <div className="bg-sidebar-border my-4 h-px w-8 shrink-0" aria-hidden />

            <div className="flex flex-col items-center gap-1">
              <NavItem to="/library" label="Library" icon={Library} active={at('/library')} />
              <NavItem
                to="/downloads"
                label="Downloads"
                icon={Download}
                active={at('/downloads')}
              />
            </div>

            <div className="mt-auto pt-4">
              <NavItem to="/settings" label="Settings" icon={Settings} active={at('/settings')} />
            </div>
          </nav>
        </aside>

        <main
          ref={setScrollElement}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          <ScrollContainerContext.Provider value={scrollElement}>
            <Suspense
              fallback={
                <div className="text-muted-foreground p-8 text-sm" aria-busy="true">
                  Loading…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ScrollContainerContext.Provider>
        </main>
      </div>
    </ScreenTransitionProvider>
  )
}
