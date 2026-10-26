/**
 * Client-half tests. Emulates the Web module loader and a minimal React, runs
 * apply() against a fake slot/locale context, and asserts that every slot
 * registration happens and every component renders without throwing — a throw
 * here is what would blank the slot entry in the real page.
 *
 * Run: node test/client.test.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

/** Just enough React for function components built with createElement. */
function makeReact() {
  const createElement = (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } })
  return {
    createElement,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
  }
}

let loaded = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry
      },
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  },
  document: {
    createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {}, remove() {} }),
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    querySelector: () => null,
  },
  navigator: { clipboard: { writeText: async () => {} } },
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  AbortSignal: { timeout: () => undefined },
  console,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const registrations = []

function fakeCtx() {
  return {
    effect(factory) {
      const dispose = typeof factory === 'function' ? factory() : undefined
      return () => dispose?.()
    },
    get(name) {
      if (name === 'connection') {
        return {
          rpc: {
            async call() {
              return { ok: true, value: { active: null, history: [] } }
            },
          },
        }
      }
      if (name === 'layout') return { selectPanel() {} }
      if (name === 'locale') {
        return { register: () => () => {}, bind: () => (key) => key }
      }
      return undefined
    },
    slots: {
      inject(slotName, callback) {
        const entry = { slotName }
        registrations.push(entry)
        entry.effect = callback()
        return () => {}
      },
      register(options, component) {
        const entry = registrations[registrations.length - 1]
        entry.options = options
        entry.component = component
        return () => {}
      },
    },
  }
}

async function test(name, body) {
  try {
    await body()
    console.log(`  ok   ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

console.log('client half')

await test('the module loads through the Web module loader', () => {
  assert.ok(loaded, 'client.js did not call window.__ModuleLoader__.load')
  assert.equal(loaded.id, 'dsh-prompt-forge')
  assert.equal(typeof loaded.factory, 'function')
})

const mod = loaded.factory((name) => {
  if (name === 'react') return makeReact()
  throw new Error(`unexpected require: ${name}`)
})

await test('declares only the services it hard-depends on', () => {
  // Spread across the vm realm boundary: the array comes from another context,
  // so compare contents rather than identity.
  assert.equal([...mod.inject].join(','), 'slots,locale')
})

await test('apply registers the three slots', () => {
  mod.apply(fakeCtx())
  const slots = registrations.map((entry) => entry.slotName)
  for (const slot of ['sidebar.panellist', 'main', 'conversation.input.dock']) {
    assert.ok(slots.includes(slot), `missing registration for ${slot}`)
  }
  assert.equal(registrations.length, 3)
})

await test('each registration carries a stable key', () => {
  for (const entry of registrations) {
    const key = entry.options?.id ?? entry.options?.key
    assert.equal(key, 'prompt-forge', `${entry.slotName} must key on prompt-forge`)
  }
})

await test('every component renders without throwing', () => {
  const fakeHook = (selector) => selector({ current: 'session-x', byId: {} })
  for (const entry of registrations) {
    const tree = entry.component({
      size: 16,
      active: false,
      sessionId: 'session-x',
      session: { sessionId: 'session-x' },
      useSessions: fakeHook,
    })
    assert.ok(tree !== null && tree !== undefined, `${entry.slotName} rendered nothing`)
  }
})

await test('the sidebar icon is an accessible svg', () => {
  const icon = registrations.find((entry) => entry.slotName === 'sidebar.panellist')
  const tree = icon.component({ size: 20, active: true })
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props.width, 20)
  assert.equal(tree.props['aria-hidden'], true)
})

// The polling refactor: the dock must subscribe to the session projection
// instead of running a timer, and the panel must read from the shared store.
await test('no polling timer remains in the client bundle', () => {
  assert.ok(!source.includes('setInterval'), 'client.js must not poll with setInterval')
  assert.ok(!/POLL_MS/.test(source), 'POLL_MS constant must be gone')
})

await test('the dock subscribes to the session projection', () => {
  assert.ok(source.includes('useProjection'), 'client must read useProjection')
  assert.ok(source.includes("FORGE_KEY"), 'client must reference the projection key')
  assert.ok(source.includes('promptForge'), 'projection key must be promptForge')
})

await test('the panel and dock share one forge store', () => {
  assert.ok(source.includes('forgeStore'), 'client must use a shared forge store')
  assert.ok(source.includes('refreshForge'), 'client must refresh through the shared store')
  // One refresh path, not two independent pollers.
  const count = (source.match(/refreshForge\(/g) ?? []).length
  assert.ok(count >= 2, 'dock and panel must both call refreshForge')
})

await test('the dock bar can be dismissed', () => {
  // The progress bar must render a close button, and dismissal must stick via
  // localStorage so a closed bar stays closed until a new record appears.
  assert.ok(source.includes('pf-dock-close'), 'dock must have a close button')
  assert.ok(source.includes('dismiss'), 'dock must implement dismissal')
  assert.ok(source.includes('localStorage'), 'dismissal must persist in localStorage')
  assert.ok(source.includes('action.dismiss'), 'dismiss button must be localized')
})

console.log('\nall client tests passed')
