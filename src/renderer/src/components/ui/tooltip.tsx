import * as React from 'react'
import { useCallback } from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { assignRef, useSurfaceMotion } from '@/lib/surface-motion'
import { cn } from '@/lib/utils'

function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const { setHost, setSurface } = useSurfaceMotion('tooltip')
  const nodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setHost(node)
      setSurface(node)
      assignRef(ref, node)
    },
    [ref, setHost, setSurface]
  )
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        ref={nodeRef}
        className={cn(
          't-layer-host t-tip bg-popover text-popover-foreground z-50 max-w-xs rounded-md border px-3 py-1.5 text-xs shadow-md',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
