/**
 * Openen en downloaden van blobs in de browser. Los van de opslag: de blob komt via
 * de repository (IndexedDB nu, Supabase Storage later).
 */

const REVOKE_AFTER_MS = 60_000

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/**
 * Opent een bestand in een nieuw tabblad. Het tabblad wordt synchroon (binnen de klik)
 * geopend, zodat popup-blockers het niet tegenhouden; de inhoud volgt zodra hij geladen is.
 */
export async function openInNewTab(load: () => Promise<Blob>, fileName: string) {
  const tab = window.open('', '_blank')
  try {
    const blob = await load()
    const url = URL.createObjectURL(blob)
    if (tab) {
      tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
    } else {
      // Popup toch geblokkeerd: dan maar downloaden.
      URL.revokeObjectURL(url)
      downloadBlob(blob, fileName)
    }
  } catch (error) {
    tab?.close()
    throw error
  }
}
