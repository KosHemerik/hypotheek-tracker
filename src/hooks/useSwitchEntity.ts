import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useData } from './useData'
import { usePeriod } from './usePeriod'

/**
 * Wisselt van entiteit en gaat naar het overzicht. Eerst navigeren, dan wisselen:
 * anders ziet een open detailpagina dat "zijn" hypotheek bij een andere entiteit hoort
 * en wisselt die meteen terug.
 */
export function useSwitchEntity() {
  const { selectEntity } = useData()
  const { search } = usePeriod()
  const navigate = useNavigate()
  return useCallback(
    async (id: string) => {
      await Promise.resolve(navigate(`/${search}`))
      selectEntity(id)
    },
    [navigate, search, selectEntity],
  )
}
