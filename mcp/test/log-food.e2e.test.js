// log_food against the real api/server.js in a child process, on a temp data directory: what the
// server stores when the MCP logs a food, and that the server's merge stamps it like any entry
// (api/sync-stamps.js), so a later removal on a phone stays removed. Same harness as
// log-workout.e2e.test.js.
// Needs api/'s dependencies (`npm ci` in api/). Without them it skips on a laptop and fails in CI,
// so a green run there always means it ran.
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'api')
const HAVE_API = fs.existsSync(path.join(API, 'node_modules', '@simplewebauthn', 'server'))
if (!HAVE_API && process.env.CI) throw new Error('api/node_modules is missing: run `npm ci` in api/ before the MCP tests in CI')

const SECRET = crypto.randomBytes(32).toString('hex')
const UID = 'u_mcp_food'
const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}
const TOKEN = mint(UID)
const at = (d, hh) => new Date(`${d}T${hh}:00`).getTime()
const OATS = { id: 'oats', name: 'Oats', kcal: 380, protein: 13, carbs: 66, fat: 7, fibre: 10, isCustom: true, favourite: false, _ts: 1000 }
const DOC = {
  unit: 'kg', restSec: 120, routines: [], workouts: [], customEx: [], bodyweight: [],
  foods: [OATS], foodLog: [], nutritionTargets: { kcal: 2200 },
  deleted: {}, edited: { restSec: 900 },
  _rev: 5, _wid: 'w-seed', _ts: 1000,
}

let child, dataDir, base, log = ''
const get = async p => (await fetch(base + p, { headers: { authorization: 'Bearer ' + TOKEN } })).json()
const stored = () => JSON.parse(fs.readFileSync(path.join(dataDir, `state-${UID}.json`), 'utf8'))

describe.skipIf(!HAVE_API)('log_food against the real api', () => {
  let logFood
  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-mcp-e2e-'))
    fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 })
    fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: [{ id: UID, name: 'Matt', created: new Date().toISOString() }], creds: [], subs: [], invites: [] }))
    fs.writeFileSync(path.join(dataDir, `state-${UID}.json`), JSON.stringify(DOC))
    child = spawn(process.execPath, ['server.js'], {
      cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' },
    })
    child.stderr.on('data', d => { log += d })
    // The boot line names the port the child bound (api/test/helpers.mjs boundPort): address and
    // readiness signal at once.
    const port = await new Promise((resolve, reject) => {
      const give = setTimeout(() => reject(new Error('server never announced a port:\n' + log)), 20000)
      child.stdout.on('data', d => {
        log += d
        const m = /gym-api on :(\d+)/.exec(log)
        if (m) { clearTimeout(give); resolve(+m[1]) }
      })
      child.once('exit', code => { clearTimeout(give); reject(new Error(`server exited (${code}):\n${log}`)) })
    })
    base = `http://127.0.0.1:${port}`
    // The read tools read the same directory the server writes, as on a real install.
    process.env.OPENGYM_DATA = dataDir
    process.env.OPENGYM_UID = UID
    ;({ logFood } = await import('../src/nutrition-tools.js'))
  }, 30000)
  afterAll(() => {
    child?.kill('SIGKILL')
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const env = () => ({ OPENGYM_URL: base, OPENGYM_TOKEN: TOKEN })

  test('stored: the document as it was plus one stamped entry, one revision on', async () => {
    const r = await logFood.handler({ food: 'oats', grams: 60, meal: 'breakfast' }, { env: env() })
    expect(r.logged).toBe(true)
    const after = stored()
    expect(after._rev).toBe(6)
    expect(after.foodLog).toHaveLength(1)
    expect(after.foodLog[0]).toMatchObject({ foodId: 'oats', grams: 60, meal: 'breakfast', source: 'manual', n: { kcal: 228 } })
    // stamped by the server's merge, as an edit made now: a later removal can be weighed against it
    expect(after.foodLog[0]._ts).toBeGreaterThan(1000)
    expect(after.foods).toEqual(DOC.foods)
    expect(after.nutritionTargets).toEqual(DOC.nutritionTargets)
    expect(after.edited).toEqual(DOC.edited)
  })

  test('a phone removing the entry afterwards: it stays removed', async () => {
    const cur = await get('/api/data')
    const id = cur.state.foodLog[0].id
    const next = { ...cur.state, foodLog: [], deleted: { ...(cur.state.deleted || {}), foodLog: { [id]: Date.now() + 1000 } } }
    const res = await fetch(base + '/api/data', {
      method: 'PUT', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ state: next, baseRev: cur.rev, baseWid: cur.state._wid }),
    })
    expect(res.status).toBe(200)
    expect(stored().foodLog).toEqual([])
    // and the MCP logging something else on top keeps it gone
    expect((await logFood.handler({ food: 'oats', grams: 20, meal: 'snack' }, { env: env() })).logged).toBe(true)
    expect(stored().foodLog.map(e => e.grams)).toEqual([20])
  })
})
