/** Leesbare foutmelding voor in de UI. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Er ging iets mis.'
}
