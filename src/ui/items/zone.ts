import { useState } from 'react'
import { zoneOnDay } from '../../domain/itinerary'
import { isDay } from '../../domain/time'
import { useTrip } from '../tripData'

/**
 * The time zone of an item on `day`. A new one follows the plan, where the journeys have taken you by
 * then (the day after flying to Tokyo is in Tokyo time), until someone picks a zone, or a city or an
 * airport that has one. An item being edited keeps its own.
 */
export function useItemZone(saved: string | undefined, day: string): [string, (zone: string) => void] {
  const t = useTrip()
  const [picked, setPicked] = useState(saved)
  return [picked ?? (isDay(day) ? zoneOnDay(day, t.stays, t.transports) : undefined) ?? t.trip.timeZone, setPicked]
}
