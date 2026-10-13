import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, getSetting, isLive } from '../db/db'
import { getServerConfig, type ServerConfig } from '../db/serverState'
import type { Day, Trip } from '../db/types'
import { findRelease, unseenReleases, type Release } from '../domain/changelog'
import { toDay } from '../domain/time'
import { getLastSeenVersion, markReleasesSeen, RELEASES } from '../lib/releases'

/** Today on this device. Re-renders at midnight and when the app comes back to the foreground. */
export function useToday(): Day {
  const [today, setToday] = useState(() => toDay(new Date()))
  useEffect(() => {
    const refresh = () => setToday(toDay(new Date()))
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
  return today
}

/** The time now, updated every minute: for "next up". */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
  return now
}

export const useTrips = (): Trip[] | undefined => useLiveQuery(() => db.trips.toArray().then((trips) => trips.filter(isLive)), [])

/** A local setting, live. Undefined while loading. */
export function useSetting<T>(key: string): { value: T | undefined } | undefined {
  return useLiveQuery(async () => ({ value: await getSetting<T>(key) }), [key])
}

/** Releases this device hasn't seen the notes for yet, newest first. */
export function useUnseenReleases(): Release[] {
  const state = useLiveQuery(async () => ({ lastSeen: await getLastSeenVersion(), hasTrips: (await db.trips.count()) > 0 }), [])
  const isNewInstall = state !== undefined && !state.lastSeen && !state.hasTrips
  useEffect(() => {
    // Nothing is "new" on a fresh install.
    if (isNewInstall) void markReleasesSeen()
  }, [isNewInstall])

  if (!state || isNewInstall) return []
  if (!state.lastSeen) {
    const current = findRelease(RELEASES, __APP_VERSION__)
    return current ? [current] : []
  }
  return unseenReleases(RELEASES, state.lastSeen, __APP_VERSION__)
}

/** The sync server this phone is connected to: null if none, undefined while loading. */
export const useServer = (): ServerConfig | null | undefined => useLiveQuery(() => getServerConfig().then((c) => c ?? null), [])

/** Connected, and not disconnected by the server since. */
export const usable = (server: ServerConfig | null | undefined) => (server && server.lastErrorStatus !== 401 ? server : undefined)

/** Something loaded once on first use (the built-in city and airport lists): undefined until it's there. */
export function useLoaded<T>(load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<{ loaded: T }>()
  useEffect(() => {
    let live = true
    load()
      .then((loaded) => live && setValue({ loaded }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [load])
  return value?.loaded
}
