import { mkdtemp, readdir, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Credentials, DeviceSummary, InviteResponse, MemberSummary, SyncResponse } from '../../src/domain/serverProtocol.ts'
import { attachment, FILE, stay, traveller, trip } from '../../src/test/fixtures.ts'
import { createApp } from './app.ts'
import { loadConfig, type Config } from './config.ts'
import { Store } from './store.ts'

let dir: string
let config: Config
let store: Store
let server: Server
let url: string
let fakeFetch: typeof fetch = async () => {
  throw new Error('no network in tests')
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'waypoints-server-'))
  config = await loadConfig({ DATA_DIR: join(dir, 'data'), FILES_DIR: join(dir, 'files') })
  store = new Store(config.dataDir, join(config.filesDir, 'backups'))
  await store.load()
  server = createApp(config, store, undefined, { fetchFn: (...args) => fakeFetch(...args), lookupTimeoutMs: 200 }).listen(0)
  await new Promise((r) => server.once('listening', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

async function call<T>(path: string, body?: object, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as T }
}

const ok = async <T>(path: string, body?: object, token?: string) => {
  const res = await call<T>(path, body, token)
  if (res.status !== 200) throw new Error(`${path}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

const registerAdmin = (name = 'Max') => ok<Credentials>('/api/register', { serverCode: config.serverCode, name, deviceLabel: 'Pixel' })

async function invite(admin: Credentials, name: string) {
  const { code } = await ok<InviteResponse>('/api/invites', {}, admin.token)
  return ok<Credentials>('/api/register', { inviteCode: code, name, deviceLabel: 'iPhone' })
}

describe('joining the server', () => {
  it('makes whoever has the server code an admin', async () => {
    expect(await call('/api/register', { serverCode: 'WRONG-CODE-0000', name: 'Eve', deviceLabel: 'x' })).toMatchObject({ status: 403 })
    const admin = await registerAdmin()
    expect(admin.member).toMatchObject({ name: 'Max', admin: true })
    expect(await ok('/api/me', undefined, admin.token)).toMatchObject({ app: 'waypoints-server', protocol: 1, member: admin.member, deviceId: admin.deviceId })
    // Tokens are only stored hashed.
    expect(JSON.stringify(store.data)).not.toContain(admin.token)
  })

  it('lets only admins invite new people, once each, for 7 days', async () => {
    const admin = await registerAdmin()
    const ana = await invite(admin, 'Ana')
    expect(ana.member).toMatchObject({ name: 'Ana', admin: false })

    expect(await call('/api/invites', {}, ana.token)).toMatchObject({ status: 403 })

    const { code, expiresAt } = await ok<InviteResponse>('/api/invites', {}, admin.token)
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86_400_000)
    // A name is needed for a new member, and asking without one doesn't use the invite up.
    expect(await call('/api/register', { inviteCode: code, deviceLabel: 'x' })).toMatchObject({ status: 400 })
    // Names are unique: they're how people pick each other for trips.
    expect(await call('/api/register', { inviteCode: code, name: 'ana', deviceLabel: 'x' })).toMatchObject({ status: 409 })
    await ok('/api/register', { inviteCode: code.toLowerCase().replace(/-/g, ' '), name: 'Bo', deviceLabel: 'x' })
    expect(await call('/api/register', { inviteCode: code, name: 'Cy', deviceLabel: 'x' })).toMatchObject({ status: 403 })

    const old = await ok<InviteResponse>('/api/invites', {}, admin.token)
    Object.values(store.data.invites)[0].expiresAt = '2020-01-01T00:00:00.000Z'
    expect(await call('/api/register', { inviteCode: old.code, name: 'Cy', deviceLabel: 'x' })).toMatchObject({ status: 403 })
    expect(store.data.invites).toEqual({})
  })

  it('adds another phone to a member with a sign-in code: their own, or anyone’s from an admin', async () => {
    const admin = await registerAdmin()
    const ana = await invite(admin, 'Ana')
    const bo = await invite(admin, 'Bo')

    const own = await ok<InviteResponse>('/api/invites', { memberId: ana.member.id }, ana.token)
    expect(own.memberName).toBe('Ana')
    const tablet = await ok<Credentials>('/api/register', { inviteCode: own.code, name: 'ignored', deviceLabel: 'Tablet' })
    expect(tablet.member).toEqual(ana.member)

    expect(await call('/api/invites', { memberId: bo.member.id }, ana.token)).toMatchObject({ status: 403 })
    const forBo = await ok<InviteResponse>('/api/invites', { memberId: bo.member.id }, admin.token)
    expect((await ok<Credentials>('/api/register', { inviteCode: forBo.code, deviceLabel: 'New phone' })).member).toEqual(bo.member)

    const devices = await ok<DeviceSummary[]>('/api/devices', undefined, ana.token)
    expect(devices.map((d) => [d.label, d.current])).toEqual([
      ['iPhone', true],
      ['Tablet', false],
    ])
    await ok('/api/devices/remove', { deviceId: tablet.deviceId }, ana.token)
    expect(await call('/api/me', undefined, tablet.token)).toMatchObject({ status: 401 })
    expect(await call('/api/devices/remove', { deviceId: bo.deviceId }, ana.token)).toMatchObject({ status: 404 })
  })

  it('lets the admin sign back in as anyone with the server code (a lost phone)', async () => {
    const admin = await registerAdmin()
    await invite(admin, 'Ana')
    expect(await call('/api/admin/members', { serverCode: 'nope' })).toMatchObject({ status: 403 })
    const members = await ok<MemberSummary[]>('/api/admin/members', { serverCode: config.serverCode })
    expect(members.map((m) => m.name)).toEqual(['Ana', 'Max'])
    const back = await ok<Credentials>('/api/register', { serverCode: config.serverCode, memberId: admin.member.id, deviceLabel: 'New Pixel' })
    expect(back.member).toEqual(admin.member)
    expect(Object.keys(store.data.members)).toHaveLength(2)
  })

  it('slows down guessing codes', async () => {
    for (let i = 0; i < 20; i++) await call('/api/register', { inviteCode: `GUESS-${i}`, name: 'Eve', deviceLabel: 'x' })
    expect(await call('/api/register', { serverCode: config.serverCode, name: 'Max', deviceLabel: 'x' })).toMatchObject({ status: 429 })
  })
})

describe('removing someone from the server', () => {
  it('is for admins, and stops all their phones', async () => {
    const admin = await registerAdmin()
    const ana = await invite(admin, 'Ana')
    expect(await call('/api/members/remove', { memberId: admin.member.id }, ana.token)).toMatchObject({ status: 403 })
    expect(await call('/api/members/remove', { memberId: admin.member.id }, admin.token)).toMatchObject({ status: 400 })
    await ok('/api/members/remove', { memberId: ana.member.id }, admin.token)
    expect(await call('/api/sync', { trips: [] }, ana.token)).toMatchObject({ status: 401 })
    expect((await ok<MemberSummary[]>('/api/members', undefined, admin.token)).map((m) => m.name)).toEqual(['Max'])
  })
})

describe('syncing over HTTP', () => {
  it('stores trips, keeps daily copies on the files disk, and answers browsers from the app', async () => {
    const admin = await registerAdmin()
    const records = { trips: [trip()], travellers: [traveller('max00001', 'Max', { memberId: admin.member.id })], stays: [stay()] }
    const res = await ok<SyncResponse>('/api/sync', { trips: [{ id: 'trip0001', cursor: 0, records }] }, admin.token)
    expect(res.trips).toEqual([{ id: 'trip0001', cursor: 3, records: {}, files: [] }])
    expect(res.fileLimit).toBe(25 * 1024 * 1024)
    expect(await call('/api/sync', { trips: 'all' }, admin.token)).toMatchObject({ status: 400 })
    expect(await readdir(join(dir, 'files', 'backups'))).toHaveLength(1)

    const reloaded = new Store(config.dataDir, join(config.filesDir, 'backups'))
    await reloaded.load()
    expect(reloaded.data.trips.trip0001.records.stays?.stay0001.rec).toEqual(stay())

    const preflight = await fetch(`${url}/api/sync`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://waypoints-pwa.github.io', 'Access-Control-Request-Private-Network': 'true' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
  })
})

describe('photos and documents', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
  const filePath = (id = 'file0001', thumb = false) => `/api/files?trip=trip0001&id=${id}${thumb ? '&thumb=1' : ''}`
  const upload = (token: string, bytes: Uint8Array, id = 'file0001', thumb = false) =>
    fetch(`${url}${filePath(id, thumb)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: bytes })
  const download = (token: string, id = 'file0001', thumb = false) => fetch(`${url}${filePath(id, thumb)}`, { headers: { Authorization: `Bearer ${token}` } })

  /** Max and Ana on a trip with a photo; Cy is on the server but not on the trip. */
  async function setUp() {
    const max = await registerAdmin()
    const ana = await invite(max, 'Ana')
    const cy = await invite(max, 'Cy')
    const records = {
      trips: [trip()],
      travellers: [traveller('max00001', 'Max', { memberId: max.member.id }), traveller('ana00001', 'Ana', { memberId: ana.member.id })],
      attachments: [attachment()],
    }
    await ok<SyncResponse>('/api/sync', { trips: [{ id: 'trip0001', cursor: 0, records }] }, max.token)
    return { max, ana, cy }
  }

  it("go up once their record has, and reach the trip's other members", async () => {
    const { max, ana } = await setUp()
    expect((await download(ana.token)).status).toBe(404) // not sent yet
    expect((await upload(max.token, FILE)).status).toBe(200)
    expect((await upload(max.token, JPEG, 'file0001', true)).status).toBe(200)

    const res = await ok<SyncResponse>('/api/sync', { trips: [] }, ana.token)
    expect(res.trips[0].files).toEqual([{ id: 'file0001', thumb: true }])
    const file = await download(ana.token)
    expect(file.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(FILE)
    expect(new Uint8Array(await (await download(ana.token, 'file0001', true)).arrayBuffer())).toEqual(JPEG)
    expect(await readdir(join(dir, 'files', 'trips', 'trip0001'))).toEqual(['file0001', 'file0001.thumb'])

    // Once there, a file stays as it is: another preview sent later changes nothing.
    expect((await upload(ana.token, new Uint8Array([0xff, 0xd8, 0xff, 9]), 'file0001', true)).status).toBe(200)
    expect(new Uint8Array(await (await download(max.token, 'file0001', true)).arrayBuffer())).toEqual(JPEG)
  })

  it('are only for the people on the trip', async () => {
    const { max, cy } = await setUp()
    await upload(max.token, FILE)
    expect((await download(cy.token)).status).toBe(404)
    expect((await upload(cy.token, FILE)).status).toBe(404)
    expect((await fetch(`${url}${filePath()}`)).status).toBe(401)
    expect((await download(max.token, '../store')).status).toBe(400)
  })

  it('must be the file their record was added with', async () => {
    const { max } = await setUp()
    expect((await upload(max.token, new Uint8Array([1, 2, 4]))).status).toBe(422)
    expect((await upload(max.token, new Uint8Array([1, 2, 3, 4]))).status).toBe(422)
    expect((await upload(max.token, FILE, 'file0009')).status).toBe(404) // no such attachment
    expect((await upload(max.token, new Uint8Array([1, 2, 3]), 'file0001', true)).status).toBe(400) // a preview must be a JPEG
    config.maxFileBytes = 2
    const tooLarge = await upload(max.token, FILE)
    expect(tooLarge.status).toBe(413)
    expect(((await tooLarge.json()) as { error: string }).error).toContain('files up to')
    expect((await ok<SyncResponse>('/api/sync', { trips: [] }, max.token)).trips[0].files).toEqual([])
  })

  it('go when their attachment is deleted', async () => {
    const { max, ana } = await setUp()
    await upload(max.token, FILE)
    await upload(max.token, JPEG, 'file0001', true)
    const deleted = attachment({ deletedAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z' })
    await ok<SyncResponse>('/api/sync', { trips: [{ id: 'trip0001', cursor: 0, records: { attachments: [deleted] } }] }, ana.token)
    expect(await readdir(join(dir, 'files', 'trips', 'trip0001'))).toEqual([])
    expect((await download(max.token)).status).toBe(404)
    expect((await upload(max.token, FILE)).status).toBe(404)
  })
})

describe('reading Google Maps links', () => {
  const SHORT = 'https://maps.app.goo.gl/abc'
  const PLACE =
    'https://www.google.com/maps/place/Torre+dos+Cl%C3%A9rigos/@41.1457911,-8.6168211,17z/data=!4m7!3m6!1s0xd2464e251ced649:0x425ec51327127c21!8m2!3d41.1456705!4d-8.6145977?entry=tts'
  const LIST_ID = 'AbCdEfGhIjKlMnOp'
  const LIST_URL = `https://www.google.com/maps/@/data=!3m1!4b1!4m3!11m2!2s${LIST_ID}!3e3?entry=tts`
  const LIST_BODY = `)]}'
${JSON.stringify([
    [
      [LIST_ID, 1, null, 1, 1],
      4,
      [2, 1, 'x'],
      ['Owner Person', 'photo', '123'],
      'Porto',
      '',
      null,
      null,
      [[null, [null, null, '', null, 'R. das Carmelitas 144, Porto', [null, null, 41.1469, -8.6149], ['964166591612806729', '-6017264553893446605'], '/g/1'], 'Livraria Lello', 'Book tickets', null, null, null, [], [], null, null, null, ['Owner Person', 'photo', '123']]],
    ],
  ])}`
  const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } })

  const asker = async () => (await registerAdmin()).token

  it('answers with the place after one redirect, and keeps to the signed-in', async () => {
    const asked: string[] = []
    fakeFetch = async (input) => {
      asked.push(String(input))
      return redirect(PLACE)
    }
    expect(await call('/api/google-maps', { url: SHORT })).toMatchObject({ status: 401 })
    const answer = await ok<{ kind: string; place: { name: string; lat: number; lng: number } }>('/api/google-maps', { url: SHORT }, await asker())
    expect(answer).toMatchObject({ kind: 'place', place: { name: 'Torre dos Clérigos', lat: 41.1456705, lng: -8.6145977 } })
    expect(asked).toEqual([SHORT])
  })

  it('answers with a list’s places, without who made it', async () => {
    const asked: string[] = []
    fakeFetch = async (input) => {
      asked.push(String(input))
      return asked.length === 1 ? redirect(LIST_URL) : new Response(LIST_BODY, { status: 200 })
    }
    const res = await call<{ kind: string; name: string; places: { name: string }[] }>('/api/google-maps', { url: SHORT }, await asker())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ kind: 'list', name: 'Porto', places: [{ name: 'Livraria Lello' }] })
    expect(JSON.stringify(res.body)).not.toContain('Owner Person')
    expect(asked[1]).toContain('/maps/preview/entitylist/getlist')
  })

  it('refuses links that are not Google Maps, and redirects that leave it, without fetching them', async () => {
    const asked: string[] = []
    fakeFetch = async (input) => {
      asked.push(String(input))
      return redirect('https://evil.com/maps')
    }
    const token = await asker()
    expect(await call('/api/google-maps', { url: 'https://example.com' }, token)).toMatchObject({ status: 400, body: { error: "That's not a Google Maps link." } })
    expect(asked).toEqual([])
    expect(await call('/api/google-maps', { url: SHORT }, token)).toMatchObject({ status: 400 })
    expect(asked).toEqual([SHORT])
  })

  it('refuses too many redirects', async () => {
    let n = 0
    fakeFetch = async () => redirect(`https://www.google.com/maps/r${++n}`)
    expect(await call('/api/google-maps', { url: SHORT }, await asker())).toMatchObject({ status: 400 })
    expect(n).toBe(5)
  })

  it('gives up when Google is slow', async () => {
    fakeFetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    expect(await call('/api/google-maps', { url: SHORT }, await asker())).toMatchObject({ status: 502, body: { error: "Google Maps didn't answer." } })
  })
})
