import { type ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Download, Library, Settings, Tv } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useHoverIntent } from '@/hooks/use-hover-intent'
import { cn } from '@/lib/utils'

import popcornUrl from '../../../../resources/popcorn.png?url'

function navIconClassName(isActive: boolean): string {
  return cn(
    'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:bg-accent hover:text-accent-foreground',
    isActive && 'bg-accent text-foreground'
  )
}

function SidebarHoverLabel({
  label,
  children
}: {
  label: string
  children: (handlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    onFocus: () => void
    onBlur: () => void
  }) => ReactElement
}): ReactElement {
  const {
    open,
    setOpen,
    onTriggerEnter,
    onTriggerLeave,
    onContentEnter,
    onContentLeave,
    onTriggerFocus,
    onTriggerBlur
  } = useHoverIntent()

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        {children({
          onMouseEnter: onTriggerEnter,
          onMouseLeave: onTriggerLeave,
          onFocus: onTriggerFocus,
          onBlur: onTriggerBlur
        })}
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={10}
        className="w-auto border-border px-3 py-2 text-sm font-medium shadow-md"
        onMouseEnter={onContentEnter}
        onMouseLeave={onContentLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {label}
      </PopoverContent>
    </Popover>
  )
}

export function RootLayout(): ReactElement {
  return (
    <div className="bg-background flex h-screen overflow-hidden border-border">
      <aside className="border-border border-r flex h-full min-h-0 w-[4.5rem] shrink-0 flex-col items-center py-3">
        <div className="flex shrink-0 flex-col items-center">
          <SidebarHoverLabel label="Home">
            {({ onMouseEnter, onMouseLeave, onFocus, onBlur }) => (
              <NavLink
                to="/"
                end
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                className={({ isActive }) => cn(navIconClassName(isActive), 'mb-1')}
                aria-label="Home"
              >
                <img src={popcornUrl} alt="" className="size-9 select-none" draggable={false} />
              </NavLink>
            )}
          </SidebarHoverLabel>

          <div className="bg-border my-2 h-px w-8 shrink-0" aria-hidden />
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6"
          aria-label="Main"
        >
          <SidebarHoverLabel label="Library">
            {({ onMouseEnter, onMouseLeave, onFocus, onBlur }) => (
              <NavLink
                to="/library"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                className={({ isActive }) => navIconClassName(isActive)}
                aria-label="Library"
              >
                <Library className="size-5" />
              </NavLink>
            )}
          </SidebarHoverLabel>

          <SidebarHoverLabel label="TV shows">
            {({ onMouseEnter, onMouseLeave, onFocus, onBlur }) => (
              <NavLink
                to="/tv"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                className={({ isActive }) => navIconClassName(isActive)}
                aria-label="TV shows"
              >
                <Tv className="size-5" />
              </NavLink>
            )}
          </SidebarHoverLabel>

          <SidebarHoverLabel label="Downloads">
            {({ onMouseEnter, onMouseLeave, onFocus, onBlur }) => (
              <NavLink
                to="/downloads"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                className={({ isActive }) => navIconClassName(isActive)}
                aria-label="Downloads"
              >
                <Download className="size-5" />
              </NavLink>
            )}
          </SidebarHoverLabel>

          <SidebarHoverLabel label="Settings">
            {({ onMouseEnter, onMouseLeave, onFocus, onBlur }) => (
              <NavLink
                to="/settings"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                className={({ isActive }) => navIconClassName(isActive)}
                aria-label="Settings"
              >
                <Settings className="size-5" />
              </NavLink>
            )}
          </SidebarHoverLabel>
        </nav>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <Outlet />
      </main>
    </div>
  )
}
