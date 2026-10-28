import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Mortgage, MortgageDocument } from '@/domain/types'
import { useData } from '@/hooks/useData'
import {
  applePackageMessage,
  CATEGORY_LABELS,
  formatFileSize,
  isApplePackageName,
  isPreviewable,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/documents'
import { messageOf } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { Button, IconButton } from '../ui/Button'
import { Section } from '../ui/Card'
import { FormError } from '../ui/Field'
import { DownloadIcon, ExternalIcon, PencilIcon, TrashIcon, UploadIcon } from '../ui/icons'
import { ConfirmDialog } from '../ui/Modal'
import { DocumentEditDialog } from './DocumentEditDialog'
import { downloadBlob, openInNewTab } from './fileActions'
import { FileBadge } from './FileBadge'
import { UploadDialog } from './UploadDialog'

type Dialog =
  | { kind: 'upload'; files: File[] }
  | { kind: 'edit'; document: MortgageDocument }
  | { kind: 'delete'; document: MortgageDocument }
  | null

/** Documenten bij een hypotheek: slepen of kiezen om te uploaden, openen, downloaden, bewerken. */
export function DocumentsSection({
  mortgage,
  documents,
}: {
  mortgage: Mortgage
  documents: MortgageDocument[]
}) {
  const { deleteDocument, getDocumentFile } = useData()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const dragDepth = useRef(0)

  // Een bestand dat naast de dropzone wordt losgelaten, zou de browser anders openen
  // (en daarmee de app verlaten).
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const sorted = [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const startUpload = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    setMessage(null)
    setDialog({ kind: 'upload', files: [...files] })
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragging(true)
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      // Mappen (ook iWork-"pakketten") kan een browser niet als bestand uploaden.
      const folders = [...e.dataTransfer.items]
        .map((item) => item.webkitGetAsEntry?.())
        .filter((entry) => entry?.isDirectory)
        .map((entry) => entry!.name)
      const files = [...e.dataTransfer.files].filter((f) => !folders.includes(f.name))
      if (files.length > 0) startUpload(files)
      if (folders.length > 0) {
        setMessage(
          folders
            .map((name) =>
              isApplePackageName(name)
                ? applePackageMessage(name)
                : `"${name}" is een map; kies de bestanden zelf.`,
            )
            .join(' '),
        )
      }
    },
  }

  async function open(doc: MortgageDocument) {
    setMessage(null)
    try {
      if (isPreviewable(doc.mimeType))
        await openInNewTab(() => getDocumentFile(doc.id), doc.fileName)
      else downloadBlob(await getDocumentFile(doc.id), doc.fileName)
    } catch (error) {
      setMessage(messageOf(error))
    }
  }

  async function download(doc: MortgageDocument) {
    setMessage(null)
    try {
      downloadBlob(await getDocumentFile(doc.id), doc.fileName)
    } catch (error) {
      setMessage(messageOf(error))
    }
  }

  return (
    <div {...dropHandlers} className="relative">
      <Section
        title="Documenten"
        description="Offertes, akte, taxatierapport, jaaroverzichten en andere stukken bij deze hypotheek."
        actions={
          <Button size="sm" icon={<UploadIcon />} onClick={() => inputRef.current?.click()}>
            Document uploaden
          </Button>
        }
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            startUpload(e.target.files)
            e.target.value = '' // zelfde bestand opnieuw kunnen kiezen
          }}
        />

        {message && (
          <div className="mb-4">
            <FormError message={message} />
          </div>
        )}

        {sorted.length > 0 && (
          <ul className="-mx-4 mb-4 divide-y divide-slate-100 border-b border-slate-100 sm:-mx-5">
            {sorted.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 sm:px-5"
              >
                <FileBadge mimeType={doc.mimeType} fileName={doc.fileName} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void open(doc)}
                    className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-slate-900 hover:underline"
                    title={
                      isPreviewable(doc.mimeType)
                        ? `${doc.fileName} openen`
                        : `${doc.fileName} downloaden`
                    }
                  >
                    {doc.fileName}
                  </button>
                  <p className="tabular flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                      {CATEGORY_LABELS[doc.category]}
                    </span>
                    <span>{formatFileSize(doc.sizeBytes)}</span>
                    <span>· {formatDate(doc.createdAt.slice(0, 10))}</span>
                    {doc.description && <span className="truncate">· {doc.description}</span>}
                  </p>
                </div>
                <div className="flex shrink-0">
                  {isPreviewable(doc.mimeType) && (
                    // Op mobiel opent een tik op de naam het bestand al; scheelt ruimte.
                    <span className="hidden sm:contents">
                      <IconButton label="Openen" onClick={() => void open(doc)}>
                        <ExternalIcon />
                      </IconButton>
                    </span>
                  )}
                  <IconButton label="Downloaden" onClick={() => void download(doc)}>
                    <DownloadIcon />
                  </IconButton>
                  <IconButton
                    label="Document bewerken"
                    onClick={() => setDialog({ kind: 'edit', document: doc })}
                  >
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label="Document verwijderen"
                    onClick={() => setDialog({ kind: 'delete', document: doc })}
                    className="hover:text-red-600"
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition-colors ${
            sorted.length === 0 ? 'py-10' : 'py-5'
          } ${dragging ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
        >
          <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 [&_svg]:size-5">
            <UploadIcon />
          </span>
          <span className="text-sm font-medium text-slate-900">
            {sorted.length === 0 ? 'Nog geen documenten' : 'Meer documenten toevoegen'}
          </span>
          <span className="mt-1 max-w-sm text-sm text-slate-500">
            Sleep bestanden hierheen of klik om te kiezen. Alle bestandstypen (PDF, afbeeldingen,
            Excel, Numbers, …), max. {formatFileSize(MAX_FILE_SIZE_BYTES)} per bestand.
          </span>
        </button>
      </Section>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 ring-2 ring-slate-900 backdrop-blur-[1px]">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <UploadIcon /> Laat los om te uploaden
          </p>
        </div>
      )}

      {dialog?.kind === 'upload' && (
        <UploadDialog
          mortgage={mortgage}
          initialFiles={dialog.files}
          onClose={() => setDialog(null)}
          onDone={({ failed }) =>
            setMessage(failed.length ? `Niet alles is geüpload. ${failed.join(' ')}` : null)
          }
        />
      )}
      {dialog?.kind === 'edit' && (
        <DocumentEditDialog document={dialog.document} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Document verwijderen?"
        message={
          dialog?.kind === 'delete' && (
            <>
              <strong>{dialog.document.fileName}</strong> wordt definitief verwijderd.
            </>
          )
        }
        onConfirm={() =>
          dialog?.kind === 'delete' ? deleteDocument(dialog.document.id) : undefined
        }
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
