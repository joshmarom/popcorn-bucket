import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function DeleteDownloadDialog({
  open,
  deleteBusy,
  titleToDelete,
  onOpenChange,
  onCancel,
  onConfirm
}: {
  open: boolean
  deleteBusy: boolean
  titleToDelete: string
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!deleteBusy} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete download?</DialogTitle>
          <DialogDescription>
            This removes the torrent from Popcorn Bucket and deletes downloaded data from disk.
            {titleToDelete ? (
              <>
                {' '}
                <span className="font-medium text-foreground">{titleToDelete}</span>
              </>
            ) : null}{' '}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={deleteBusy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={deleteBusy} onClick={onConfirm}>
            {deleteBusy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
