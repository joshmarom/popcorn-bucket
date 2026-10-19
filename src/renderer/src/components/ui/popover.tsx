import * as React from 'react'
import { useCallback } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { assignRef, useSurfaceMotion } from '@/lib/surface-motion'
import { cn } from '@/lib/utils'

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ref,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { setHost, setSurface } = useSurfaceMotion('dropdown')
  const hostRef = useCallback(
    (node: HTMLDivElement | null) => {
      setHost(node)
      assignRef(ref, node)
    },
    [ref, setHost]
  )
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        ref={hostRef}
        className="t-layer-host z-50 outline-hidden"
        {...props}
      >
        <div
          ref={setSurface}
          data-origin="top-center"
          className={cn(
            't-dropdown bg-popover text-popover-foreground w-72 rounded-md border p-4 shadow-lg',
            className
          )}
        >
          {children}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
