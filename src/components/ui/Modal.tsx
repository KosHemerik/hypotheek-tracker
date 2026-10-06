import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { CloseIcon } from './icons'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  /** Knoppen onderaan; staan buiten het scrollgebied. */
  footer?: ReactNode
  size?: 'sm' | 'md'
}

/**
 * Modal op basis van het native `<dialog>`-element: focus-trap, Escape en
 * achtergrond-inert zijn dan gratis. Op mobiel schuift hij als sheet vanaf onderen in.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // Klik op de backdrop (buiten het paneel) sluit de modal.
        if (e.target === e.currentTarget) onClose()
      }}
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-white p-0 text-slate-900 shadow-xl sm:m-auto sm:rounded-2xl ${size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-lg'}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Sluiten"
              className="-mr-1 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Verwijderen',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  )
}
