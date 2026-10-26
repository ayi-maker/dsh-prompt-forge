/**
 * Host-half tests. Mounts `apply()` against a fake Cordis context, captures the
 * registrations, then drives a full forge cycle through the `prompt_forge` tool.
 *
 * Run: node test/host.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'

const dir = await mkdtemp(join(tmpdir(), 'pf-host-test-'))

const captured = { tools: [], commands: [], skills: [], projections: [] }

function makeScope() {
  return {
    tools: {
      register(definition) {
        captured.tools.push(definition)
        return () => {}
      },
    },
    commands: {
      register(definition) {
        captured.commands.push(definition)
        return () => {}
      },
    },
    skills: {
      register(definition) {
        captured.skills.push(definition)
        return () => {}
      },
    },
    sessionProjections: {
      register(definition) {
        captured.projections.push(definition)
        return () => {}
      },
    },
    effect(factory) {
      const dispose = typeof factory === 'function' ? factory() : undefined
      return () => dispose?.()
    },
    on() {
      return () => {}
    },
  }
}

apply(
  {
    ...makeScope(),
    get() {
      return undefined
    },
    inject(_deps, body) {
      body(makeScope())
    },
  },
  { dataDir: dir },
)

const tool = captured.tools.find((entry) => entry.name === 'prompt_forge')
const agent = { id: 'session-test' }
const run = (args) => tool.execute(args, { agent })

async function test(name, body) {
  try {
    await body()
    console.log(`  ok   ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

console.log('host half')

await test('registers the prompt_forge tool', () => {
  assert.ok(tool, 'prompt_forge was not registered')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.output.render, 'function')
})

await test('registers the /prompt command', () => {
  assert.ok(captured.commands.some((entry) => entry.name === 'prompt'))
})

await test('registers the prompt-forge skill', () => {
  assert.ok(captured.skills.some((entry) => entry.name === 'prompt-forge'))
})

await test('start creates a record with all ten gaps', async () => {
  const out = await run({ action: 'start', brief: '我想让 AI 帮我写周报，但每次都不满意', title: '写周报' })
  assert.equal(out.ok, true)
  assert.equal(out.score, 0)
  assert.equal(out.readyToFinalize, false)
  assert.equal(out.gaps.length, 10)
})

await test('update fills slots and raises the score', async () => {
  const out = await run({
    action: 'update',
    slots: [
      { key: 'outcome', value: '写出一份 1 分钟能扫完、领导不用追问细节的周报。' },
      { key: 'deliverable', value: 'Markdown，五个小节，800 字以内。' },
      { key: 'constraints', value: '必须做：每项带量化结果。绝不：写空话、编造数据。' },
    ],
  })
  assert.equal(out.ok, true)
  assert.equal(out.score, 48)
  assert.equal(out.gaps.length, 7)
})

await test('rejects an unknown slot key without writing', async () => {
  const out = await run({ action: 'update', slots: [{ key: 'nope', value: 'x' }] })
  assert.equal(out.ok, false)
  assert.match(out.error, /outcome/)
})

await test('reaches readyToFinalize once priority 1-2 slots are filled', async () => {
  const out = await run({
    action: 'update',
    slots: [
      { key: 'context', value: '手上只有零散笔记。' },
      { key: 'quality', value: '每项都有数字，风险有求援动作。' },
      { key: 'audience', value: '直属领导。' },
    ],
  })
  assert.equal(out.readyToFinalize, true)
  assert.equal(out.score, 82)
})

await test('finalize assembles and marks the record final', async () => {
  const out = await run({ action: 'finalize' })
  assert.equal(out.ok, true)
  assert.equal(out.status, 'final')
  assert.match(out.final, /^# 提示词：写周报/)
  assert.match(out.final, /每项带量化结果/)
})

await test('omits unconfirmed optional sections from the final prompt', async () => {
  const out = await run({ action: 'finalize' })
  for (const heading of ['## 角色', '## 执行方法', '## 参考样例与反例', '## 务必避免']) {
    assert.ok(!out.final.includes(heading), `${heading} should be omitted when unconfirmed`)
  }
  assert.ok(!out.final.includes('待补'), 'final must not leak placeholders')
})

await test('editing after finalize drops the status back out of final', async () => {
  const out = await run({ action: 'update', slots: [{ key: 'outcome', value: '改过的目标' }] })
  assert.equal(out.ok, true)
  assert.notEqual(out.status, 'final', 'a stale final must not survive an edit')
  assert.equal(out.status, 'ready')
  assert.match(out.draft, /改过的目标/)
})

await test('re-finalizing picks up the edit', async () => {
  const out = await run({ action: 'finalize' })
  assert.equal(out.status, 'final')
  assert.match(out.final, /改过的目标/)
})

await test('status reports the current record', async () => {
  const out = await run({ action: 'status' })
  assert.equal(out.ok, true)
  assert.equal(out.status, 'final')
})

await test('list returns the record', async () => {
  const out = await run({ action: 'list' })
  assert.equal(out.ok, true)
  assert.equal(out.items.length, 1)
})

await test('the store is persisted as readable JSON', async () => {
  const raw = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8'))
  assert.equal(raw.version, 1)
  const ids = Object.keys(raw.records)
  assert.equal(ids.length, 1)
  assert.equal(raw.records[ids[0]].status, 'final')
  assert.equal(Object.keys(raw.records[ids[0]].slots).length, 6)
})

await test('delete removes the record', async () => {
  const out = await run({ action: 'delete' })
  assert.equal(out.ok, true)
  const after = await run({ action: 'status' })
  assert.equal(after.ok, false)
})

// The session projection replaces Client polling: it must tick on every
// prompt_forge tool call and stay silent on everything else.
await test('registers a session projection keyed promptForge', () => {
  const projection = captured.projections.find((entry) => entry.key === 'promptForge')
  assert.ok(projection, 'promptForge projection was not registered')
  assert.equal(projection.stateVersion, 1)
  assert.equal(typeof projection.apply, 'function')
  assert.equal(typeof projection.wire?.view, 'function')
  assert.equal(projection.init({}, 0).tick, 0)
})

await test('projection ticks on a prompt_forge tool call', () => {
  const projection = captured.projections.find((entry) => entry.key === 'promptForge')
  const state = { tick: 0 }
  const next = projection.apply(state, { type: 'tool/call', data: { name: 'prompt_forge' } })
  assert.equal(next.tick, 1)
  assert.notEqual(next, state, 'must return a new reference so the change is pushed')
})

await test('projection ignores unrelated events', () => {
  const projection = captured.projections.find((entry) => entry.key === 'promptForge')
  const state = { tick: 5 }
  for (const event of [
    { type: 'tool/call', data: { name: 'read' } },
    { type: 'user/message', data: {} },
    { type: 'turn/end', data: {} },
    { type: 'tool/call', data: {} },
    undefined,
    null,
  ]) {
    const next = projection.apply(state, event)
    assert.equal(next, state, 'unrelated events must return the same reference')
  }
})

await test('projection wire view exposes the tick', () => {
  const projection = captured.projections.find((entry) => entry.key === 'promptForge')
  assert.deepEqual(projection.wire.view({ tick: 3 }), { tick: 3 })
})

// The `/prompt` command must not stop at "record created, 0/100". It has to
// hand the idea back to the model and wake the driver.
await test('/prompt wakes the agent to continue the interview', async () => {
  const command = captured.commands.find((entry) => entry.name === 'prompt')
  assert.ok(command, '/prompt command must be registered')

  const followedUp = []
  const invocation = {
    agent: {
      id: 'session-command-test',
      followup(message) {
        followedUp.push(message)
      },
    },
    rawInput: '把周报写得更像人话',
  }
  const result = await command.handler(invocation)
  assert.equal(result.kind, 'success')
  assert.equal(followedUp.length, 1, 'agent.followup must be called exactly once')

  const message = followedUp[0]
  const text = message.content?.[0]?.text ?? ''
  assert.match(text, /把周报写得更像人话/, 'the idea must be carried into the followup')
  assert.match(text, /ask_user_question/, 'the followup must instruct the model to ask questions')
  assert.match(text, /prompt_forge/, 'the followup must reference the update tool')
})

await test('/prompt falls back to text when the agent cannot be woken', async () => {
  const command = captured.commands.find((entry) => entry.name === 'prompt')
  const result = await command.handler({ agent: { id: 'session-no-followup' }, rawInput: '写周报' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /完整度|还差的要素|开始提问/)
})

console.log('\nall host tests passed')
