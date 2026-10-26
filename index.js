/**
 * dsh-prompt-forge — Host half.
 *
 * A "prompt forge": the user gives a vague idea, the agent asks a short series
 * of option-bearing questions (3-5 per round), and the confirmed decisions are
 * folded into a complete, reliable, efficient prompt.
 *
 * This half owns the durable forge records (`$DSH_HOME/prompt-forge/store.json`),
 * the `prompt_forge` agent tool, the `prompt-forge` skill, the `/prompt`
 * command, and the host RPC channel the Client panel reads.
 *
 * Every write goes through `recordStore` so the Client and the tool always see
 * the same JSON.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

import {
  CHECKLIST_EN,
  CHECKLIST_ZH,
  SECTIONS_EN,
  SECTIONS_ZH,
  SLOTS,
  SLOT_BY_KEY,
  TOTAL_WEIGHT,
} from './slots.js'

export const name = 'dsh-prompt-forge'
export const inject = ['tools']

const RPC_CHANNEL = '/dsh-prompt-forge'
const STORE_VERSION = 1
const MAX_RECORDS = 200

// Session projection: a monotonic counter that ticks every time this session
// runs the prompt_forge tool. The Client subscribes to it through
// `useProjection('promptForge')` instead of polling, then pulls the full
// record once per tick.
const FORGE_PROJECTION_KEY = 'promptForge'
const forgeStateSchema = z.object({ tick: z.number() })
const forgeViewSchema = z.object({ tick: z.number() })


// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let storePath = null
let cache = null
let writeChain = Promise.resolve()

function resolveHome() {
  const fromEnv = process.env.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

function storeFileOf(config) {
  if (storePath !== null) return storePath
  const dir =
    typeof config?.dataDir === 'string' && config.dataDir.length > 0
      ? config.dataDir
      : join(resolveHome(), 'prompt-forge')
  storePath = join(dir, 'store.json')
  return storePath
}

function emptyStore() {
  return { version: STORE_VERSION, records: {}, order: [] }
}

function normalizeStore(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return emptyStore()
  const records = {}
  const source = raw.records
  if (source !== null && typeof source === 'object' && !Array.isArray(source)) {
    for (const [id, record] of Object.entries(source)) {
      if (record === null || typeof record !== 'object' || Array.isArray(record)) continue
      if (typeof record.id !== 'string' || record.id.length === 0) continue
      records[id] = normalizeRecord(record)
    }
  }
  const order = Array.isArray(raw.order)
    ? raw.order.filter((id) => typeof id === 'string' && records[id] !== undefined)
    : []
  for (const id of Object.keys(records)) if (!order.includes(id)) order.push(id)
  return { version: STORE_VERSION, records, order }
}

function normalizeRecord(record) {
  const slots = {}
  const source = record.slots
  if (source !== null && typeof source === 'object' && !Array.isArray(source)) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'string' && value.trim().length > 0) slots[key] = value
    }
  }
  return {
    id: record.id,
    sessionId: typeof record.sessionId === 'string' ? record.sessionId : undefined,
    title: typeof record.title === 'string' ? record.title : '',
    brief: typeof record.brief === 'string' ? record.brief : '',
    taskType: typeof record.taskType === 'string' ? record.taskType : '',
    lang: record.lang === 'en' ? 'en' : 'zh',
    status: record.status === 'final' ? 'final' : record.status === 'ready' ? 'ready' : 'drafting',
    slots,
    draft: typeof record.draft === 'string' ? record.draft : '',
    final: typeof record.final === 'string' ? record.final : '',
    note: typeof record.note === 'string' ? record.note : '',
    revision: Number.isInteger(record.revision) ? record.revision : 0,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
  }
}

async function loadStore(config) {
  if (cache !== null) return cache
  const file = storeFileOf(config)
  try {
    const text = await readFile(file, 'utf8')
    cache = normalizeStore(JSON.parse(text))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[dsh-prompt-forge] store read failed, starting empty:', error?.message ?? error)
    }
    cache = emptyStore()
  }
  return cache
}

function saveStore(config, store) {
  const file = storeFileOf(config)
  const snapshot = JSON.stringify(store, null, 2)
  writeChain = writeChain.then(async () => {
    await mkdir(join(file, '..'), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, snapshot, 'utf8')
    await rename(tmp, file)
  })
  return writeChain
}

function pruneStore(store) {
  if (store.order.length <= MAX_RECORDS) return
  const keep = store.order.slice(0, MAX_RECORDS)
  const kept = new Set(keep)
  for (const id of Object.keys(store.records)) if (!kept.has(id)) delete store.records[id]
  store.order = keep
}

// ---------------------------------------------------------------------------
// Forge logic
// ---------------------------------------------------------------------------

function newId() {
  return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function filledKeys(record) {
  const out = new Set()
  for (const slot of SLOTS) {
    const value = record.slots[slot.key]
    if (typeof value === 'string' && value.trim().length > 0) out.add(slot.key)
  }
  return out
}

function scoreOf(record) {
  const filled = filledKeys(record)
  let score = 0
  for (const slot of SLOTS) if (filled.has(slot.key)) score += slot.weight
  return Math.round((score / TOTAL_WEIGHT) * 100)
}

function gapsOf(record, lang) {
  const filled = filledKeys(record)
  return SLOTS.filter((slot) => !filled.has(slot.key))
    .slice()
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
    .map((slot) => ({
      key: slot.key,
      label: lang === 'en' ? slot.labelEn : slot.label,
      priority: slot.priority,
      weight: slot.weight,
      question: lang === 'en' ? slot.questionEn : slot.question,
      options: slot.options,
      guidance: slot.guidance,
    }))
}

function readyToFinalize(record) {
  const filled = filledKeys(record)
  return SLOTS.filter((slot) => slot.priority <= 2).every((slot) => filled.has(slot.key))
}

function assemblePrompt(record) {
  const lang = record.lang === 'en' ? 'en' : 'zh'
  const sections = lang === 'en' ? SECTIONS_EN : SECTIONS_ZH
  const missing = lang === 'en' ? '(to be filled)' : '（待补）'
  const lines = []
  const title = record.title.trim().length > 0 ? record.title.trim() : lang === 'en' ? 'Untitled task' : '未命名任务'
  lines.push(lang === 'en' ? `# Prompt: ${title}` : `# 提示词：${title}`)
  lines.push('')
  if (record.brief.trim().length > 0) {
    lines.push(lang === 'en' ? `> Drafted from: ${record.brief.trim()}` : `> 起稿：${record.brief.trim()}`)
    lines.push('')
  }
  for (const [key, heading] of sections) {
    const value = record.slots[key]
    const filled = typeof value === 'string' && value.trim().length > 0
    // Optional elements (priority > 2) that were never confirmed are omitted
    // entirely instead of shipping a placeholder into the final prompt.
    if (!filled && (SLOT_BY_KEY.get(key)?.priority ?? 4) > 2) continue
    lines.push(`## ${heading}`)
    lines.push(filled ? value.trim() : missing)
    lines.push('')
  }
  const checklist = lang === 'en' ? CHECKLIST_EN : CHECKLIST_ZH
  lines.push(lang === 'en' ? '## Self-check before answering' : '## 回答前自检')
  for (const item of checklist) lines.push(`- [ ] ${item}`)
  lines.push('')
  return lines.join('\n').trim() + '\n'
}

function summarize(record) {
  return {
    id: record.id,
    title: record.title,
    brief: record.brief.length > 120 ? `${record.brief.slice(0, 120)}…` : record.brief,
    status: record.status,
    score: scoreOf(record),
    updatedAt: record.updatedAt,
  }
}

function toWire(record) {
  const lang = record.lang === 'en' ? 'en' : 'zh'
  const filled = filledKeys(record)
  return {
    id: record.id,
    title: record.title,
    brief: record.brief,
    taskType: record.taskType,
    lang,
    status: record.status,
    score: scoreOf(record),
    readyToFinalize: readyToFinalize(record),
    slots: SLOTS.map((slot) => ({
      key: slot.key,
      label: lang === 'en' ? slot.labelEn : slot.label,
      value: record.slots[slot.key] ?? '',
      filled: filled.has(slot.key),
      priority: slot.priority,
      guidance: slot.guidance,
    })),
    gaps: gapsOf(record, lang),
    draft: record.draft.trim().length > 0 ? record.draft : assemblePrompt(record),
    final: record.final,
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function findForSession(store, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  for (const id of store.order) {
    const record = store.records[id]
    if (record !== undefined && record.sessionId === sessionId) return record
  }
  return undefined
}

/** Resolve `id` when given, else the newest record of this session. */
function pick(store, id, sessionId) {
  if (typeof id === 'string' && id.length > 0) return store.records[id]
  return findForSession(store, sessionId)
}

function touch(record, patch) {
  Object.assign(record, patch)
  record.revision += 1
  record.updatedAt = Date.now()
  // Any edit after finalize stales the stored final text: drop the record back
  // to drafting/ready so the panel cannot offer a finalized prompt that no
  // longer matches the confirmed elements.
  record.status = readyToFinalize(record) ? 'ready' : 'drafting'
  return record
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  '把「模糊想法」锻造成「完整、可靠、高效」的提示词的锻造台。一个任务 = 一条 forge 记录，含十项要素：',
  'outcome 目标与成功标准 / deliverable 交付物形态 / constraints 硬约束 / context 背景与输入 / quality 质量标准 /',
  'audience 受众 / role 角色 / method 方法 / examples 参考样例 / risks 失败模式。',
  '',
  '标准流程：action "start" 建记录（拿到 gaps 与 askHints）→ 用 ask_user_question 每轮问 3-5 个带选项的问题',
  '→ action "update" 把用户确认的决定写入 slots（返回新的 gaps 与自动拼好的草稿）→ 反复 2-4 轮',
  '→ readyToFinalize 为 true 后 action "finalize"，把最终提示词原文完整交给用户。',
  '',
  'action: start | update | draft | finalize | status | list | get | delete。省略 id 时使用当前会话最近一条记录。',
  '返回含 score（0-100 完整度）、readyToFinalize、gaps（还缺什么、该怎么问）、draft（实时草稿）。',
  '用户界面上有一个「提示词」面板，读的是同一份数据，会实时刷新。',
].join('\n')

function toolParameters() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'update', 'draft', 'finalize', 'status', 'list', 'get', 'delete'],
        description: '要执行的操作。',
      },
      id: { type: 'string', description: '锻造记录 id；省略时用当前会话最近一条。' },
      sessionId: { type: 'string', description: '会话 id；省略时取发起本次工具调用的 Agent 的会话。' },
      brief: { type: 'string', description: 'start 用：用户原始想法/模糊描述的原话摘要。' },
      title: { type: 'string', description: 'start 用：任务短标题（不给就自动从 brief 截取）。' },
      taskType: { type: 'string', description: 'start 用：任务类型，如写作/代码/分析/设计/研究。' },
      lang: { type: 'string', enum: ['zh', 'en'], description: '最终提示词语言，默认 zh。' },
      slots: {
        type: 'array',
        description: 'update 用：本问已确认的要素。key 必须是十要素之一，value 写成可直接塞进提示词的具体决定。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: {
              type: 'string',
              enum: SLOTS.map((slot) => slot.key),
            },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
        },
      },
      draft: { type: 'string', description: 'draft 用：手动覆盖草稿文本（不传则按 slots 自动拼装）。' },
      final: { type: 'string', description: 'finalize 用：手动覆盖最终提示词（不传则用自动拼装结果）。' },
      note: { type: 'string', description: '可选备注，例如用户的特别偏好。' },
    },
    required: ['action'],
  }
}

function toolOutputSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    properties: {
      ok: { type: 'boolean' },
      action: { type: 'string' },
      id: { type: 'string' },
      status: { type: 'string' },
      title: { type: 'string' },
      score: { type: 'number' },
      readyToFinalize: { type: 'boolean' },
      gaps: { type: 'array', items: { type: 'object', additionalProperties: true } },
      draft: { type: 'string' },
      final: { type: 'string' },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      text: { type: 'string' },
      error: { type: 'string' },
    },
  }
}

function gapLines(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) return ''
  return gaps
    .map((gap) => `- [${gap.key}] ${gap.label}：${gap.question}｜可选：${(gap.options ?? []).join(' / ')}`)
    .join('\n')
}

function buildToolText(value) {
  const lines = []
  if (value.error !== undefined) return `prompt_forge 失败：${value.error}`
  switch (value.action) {
    case 'start':
      lines.push(`已开启提示词锻造：${value.id}`)
      lines.push(`标题：${value.title || '(未命名)'}｜当前完整度：${value.score}/100`)
      lines.push('')
      lines.push('下一轮请用 ask_user_question 问这些缺口（每轮 3-5 个，都给选项）：')
      lines.push(gapLines(value.gaps))
      lines.push('')
      lines.push('本轮结束后用 action "update" 把确认的决定落盘。')
      break
    case 'update':
      lines.push(`已记录。完整度：${value.score}/100${value.readyToFinalize ? '（要素已齐，可以 finalize）' : ''}`)
      if (Array.isArray(value.gaps) && value.gaps.length > 0) {
        lines.push('')
        lines.push('还缺：')
        lines.push(gapLines(value.gaps.slice(0, 5)))
      }
      lines.push('')
      lines.push('—— 当前草稿 ——')
      lines.push(value.draft)
      break
    case 'draft':
      lines.push(`草稿（完整度 ${value.score}/100）：`)
      lines.push('')
      lines.push(value.draft)
      break
    case 'finalize':
      lines.push(`已定稿：${value.id}`)
      lines.push('')
      lines.push(value.final)
      break
    case 'status':
      lines.push(`${value.title || '(未命名)'}｜${value.status}｜完整度 ${value.score}/100`)
      if (Array.isArray(value.gaps) && value.gaps.length > 0) {
        lines.push('')
        lines.push('还缺：')
        lines.push(gapLines(value.gaps))
      } else {
        lines.push('要素已齐全。')
      }
      break
    case 'list':
      if (!Array.isArray(value.items) || value.items.length === 0) lines.push('还没有任何锻造记录。')
      else {
        lines.push(`共 ${value.items.length} 条：`)
        for (const item of value.items) {
          lines.push(`- ${item.id}｜${item.title || '(未命名)'}｜${item.status}｜${item.score}/100`)
        }
      }
      break
    case 'get':
      lines.push(value.draft ?? '')
      break
    case 'delete':
      lines.push(`已删除 ${value.id ?? ''}`)
      break
    default:
      lines.push(JSON.stringify(value))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Skill: the interview playbook the model loads on demand
// ---------------------------------------------------------------------------

const SKILL_CONTENT = `# 提示词锻造（prompt-forge）

把用户**模糊的想法**，经过 2-4 轮**带选项的反问**，锻造成一份**完整、可靠、高效**的提示词。

## 触发
用户说"帮我做个提示词""我想做…但不知道怎么写清楚""把这句话改成 prompt""提示词怎么写才好"，或用了 \`/prompt\`。

## 铁律
1. **每轮 3-5 个问题**，不多不少。每个问题都要给 **2-4 个具体选项**，并允许用户自定义回答（ask_user_question 自带）。
2. 选项要写到"用户点一下就等于做了决定"的颗粒度，不要问"你想要什么风格？"这种空题。
3. **不问用户已经说过的东西**，也不要把十个槽位一次问完。
4. **每轮问完立刻落盘**：\`prompt_forge {action:'update', slots:[...]}\`。不要攒到最后一次性写。
5. **不替用户编造关键约束**。用户没说的，要么问，要么在提示词里显式写成"待确认"。
6. 用户说"随便/你定"时，选最稳妥的那个选项并**告知你的默认选择**，让用户可以纠正。

## 流程
1. \`prompt_forge {action:'start', brief, title, taskType}\` → 得到 \`id\`、\`gaps\`、每个缺口该怎么问。
2. 从 \`gaps\` 里取 **priority 最小的 3-5 个**，用 \`ask_user_question\` 问第一轮。
3. \`prompt_forge {action:'update', id, slots:[{key,value}, ...]}\` → 返回新的 \`gaps\` 和自动草稿。
4. 重复 2-3 轮，直到 \`readyToFinalize === true\`。
5. \`prompt_forge {action:'finalize', id}\` → **把 \`final\` 原文完整贴给用户**（放在代码块里），另起一段说明还能改哪里。
6. 用户要改：\`update\` 对应槽位后重新 \`finalize\`。

## 十要素（写进 slots 的 value 时按这个标准写）
| key | 要素 | 写好的标志 |
|---|---|---|
| outcome | 目标与成功标准 | 一句可判定的目标 + 一条"做对了的表现" |
| deliverable | 交付物形态 | 结构、篇幅、语言、是否出文件 |
| constraints | 硬约束 | 必须做 / 绝不 两栏，具体可核对 |
| context | 背景与输入 | 已知事实、已有材料、已排除方案 |
| quality | 质量标准 | 可验证、可复现、可交付 |
| audience | 受众与场景 | 谁看、在哪用、专业深度 |
| role | 角色 | 只在能改变输出时才写 |
| method | 方法 | 一次交付 or 分步确认；结论先行 or 方案对比 |
| examples | 参考样例 | 一个正例或反例，越具体越好 |
| risks | 失败模式 | 这类任务最常见的 2-3 种翻车方式 |

## 提问示范
用户："我想让 AI 帮我写周报，但每次都不满意。"

第一轮（问 priority 1 的缺口）：
- outcome：这次周报最想解决的问题是？〔向上汇报工作量 / 暴露风险求资源 / 给自己留档 / 对齐下周计划〕
- deliverable：什么形态？〔Markdown 周报，5 个小节 / 一页纸三段式 / 表格按项目列 / 直接对话〕
- constraints：有哪些硬约束？〔只能写我提供的项目名 / 必须每项带量化结果 / 不许写"积极推进"这类空话 / 有时长上限〕

第二轮（问 priority 2）：
- quality：怎样算合格？〔领导看完不用追问细节 / 每项都有数字或产出物 / 风险有明确求援动作 / 只读 1 分钟能抓住重点〕
- audience：读者是谁？〔直属领导 / 跨部门 / 记录留存〕

第三轮收尾（priority 3-4，可选）：
- role / method / examples / risks

## 交付
定稿后给用户三样东西：
1. 完整提示词原文（代码块，可直接复制）；
2. 一句话说明它为什么可靠（关键约束在哪几节被固定住）；
3. 一句"想改哪里告诉我"。
`

// ---------------------------------------------------------------------------
// Plugin apply
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  /** Session projection: tick per prompt_forge tool call, pushed to the Client. */
  ctx.inject(['sessionProjections'], (scope) => {
    try {
      const dispose = scope.sessionProjections.register({
        key: FORGE_PROJECTION_KEY,
        stateVersion: 1,
        stateSchema: forgeStateSchema,
        init() {
          return { tick: 0 }
        },
        apply(state, event) {
          if (event?.type === 'tool/call' && event.data?.name === 'prompt_forge') {
            return { tick: state.tick + 1 }
          }
          return state
        },
        wire: {
          viewSchema: forgeViewSchema,
          view(state) {
            return { tick: state.tick }
          },
        },
      })
      scope.effect(() => dispose, 'prompt-forge projection')
    } catch (error) {
      console.warn('[dsh-prompt-forge] projection registration skipped:', error?.message ?? error)
    }
  })

  /** The `prompt_forge` tool. */
  ctx.effect(() => {
    const dispose = ctx.tools.register({
      name: 'prompt_forge',
      description: TOOL_DESCRIPTION,
      parameters: toolParameters(),
      output: {
        schema: toolOutputSchema(),
        render(_args, value) {
          return [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }]
        },
      },
      async execute(args, exec) {
        const action = typeof args?.action === 'string' ? args.action : ''
        const sessionId =
          typeof args?.sessionId === 'string' && args.sessionId.length > 0
            ? args.sessionId
            : exec?.agent?.id ?? undefined
        try {
          switch (action) {
            case 'start': {
              const store = await loadStore(config)
              const brief = typeof args?.brief === 'string' ? args.brief.trim() : ''
              if (brief.length === 0) {
                return { ok: false, action, error: 'brief 不能为空：先写下用户的原话或模糊想法。', text: '' }
              }
              const title =
                typeof args?.title === 'string' && args.title.trim().length > 0
                  ? args.title.trim()
                  : brief.length > 24
                    ? `${brief.slice(0, 24)}…`
                    : brief
              const record = normalizeRecord({
                id: newId(),
                sessionId,
                title,
                brief,
                taskType: typeof args?.taskType === 'string' ? args.taskType : '',
                lang: args?.lang === 'en' ? 'en' : 'zh',
                status: 'drafting',
                slots: {},
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              store.records[record.id] = record
              store.order.unshift(record.id)
              pruneStore(store)
              await saveStore(config, store)
              const wire = toWire(record)
              const value = {
                ok: true,
                action,
                id: wire.id,
                status: wire.status,
                title: wire.title,
                score: wire.score,
                readyToFinalize: wire.readyToFinalize,
                gaps: wire.gaps,
                draft: wire.draft,
              }
              return { ...value, text: buildToolText(value) }
            }
            case 'update': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) {
                return { ok: false, action, error: '找不到锻造记录，先 action "start" 建一条。', text: '' }
              }
              const incoming = Array.isArray(args?.slots) ? args.slots : []
              const written = []
              for (const item of incoming) {
                if (item === null || typeof item !== 'object') continue
                const key = typeof item.key === 'string' ? item.key : ''
                if (!SLOT_BY_KEY.has(key)) continue
                const value = typeof item.value === 'string' ? item.value.trim() : ''
                if (value.length === 0) continue
                record.slots[key] = value
                written.push(key)
              }
              if (written.length === 0) {
                return {
                  ok: false,
                  action,
                  id: record.id,
                  error: `没有可写入的要素。slots[].key 必须是：${SLOTS.map((slot) => slot.key).join(' / ')}`,
                  text: '',
                }
              }
              if (typeof args?.note === 'string' && args.note.trim().length > 0) record.note = args.note.trim()
              touch(record, { draft: '' })
              store.order = [record.id, ...store.order.filter((id) => id !== record.id)]
              await saveStore(config, store)
              const wire = toWire(record)
              const value = {
                ok: true,
                action,
                id: wire.id,
                status: wire.status,
                title: wire.title,
                score: wire.score,
                readyToFinalize: wire.readyToFinalize,
                gaps: wire.gaps,
                draft: wire.draft,
                written,
              }
              return { ...value, text: buildToolText(value) }
            }
            case 'draft': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) {
                return { ok: false, action, error: '找不到锻造记录。', text: '' }
              }
              const manual = typeof args?.draft === 'string' ? args.draft.trim() : ''
              touch(record, { draft: manual })
              await saveStore(config, store)
              const wire = toWire(record)
              const value = {
                ok: true,
                action,
                id: wire.id,
                status: wire.status,
                title: wire.title,
                score: wire.score,
                readyToFinalize: wire.readyToFinalize,
                gaps: wire.gaps,
                draft: wire.draft,
              }
              return { ...value, text: buildToolText(value) }
            }
            case 'finalize': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) {
                return { ok: false, action, error: '找不到锻造记录。', text: '' }
              }
              const manual = typeof args?.final === 'string' ? args.final.trim() : ''
              const final = manual.length > 0 ? manual : assemblePrompt(record)
              touch(record, { final, status: 'final', draft: record.draft })
              record.status = 'final'
              store.order = [record.id, ...store.order.filter((id) => id !== record.id)]
              await saveStore(config, store)
              const wire = toWire(record)
              const value = {
                ok: true,
                action,
                id: wire.id,
                status: 'final',
                title: wire.title,
                score: wire.score,
                readyToFinalize: true,
                gaps: [],
                final: wire.final,
                draft: wire.draft,
              }
              return { ...value, text: buildToolText(value) }
            }
            case 'status': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) {
                return {
                  ok: false,
                  action,
                  error: '当前会话还没有锻造记录。先 action "start" 建一条。',
                  text: 'prompt_forge：当前会话还没有锻造记录。',
                }
              }
              const wire = toWire(record)
              const value = {
                ok: true,
                action,
                id: wire.id,
                status: wire.status,
                title: wire.title,
                score: wire.score,
                readyToFinalize: wire.readyToFinalize,
                gaps: wire.gaps,
                draft: wire.draft,
                final: wire.final,
              }
              return { ...value, text: buildToolText(value) }
            }
            case 'list': {
              const store = await loadStore(config)
              const items = store.order.map((id) => summarize(store.records[id])).filter(Boolean)
              const value = { ok: true, action, items }
              return { ...value, text: buildToolText(value) }
            }
            case 'get': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) return { ok: false, action, error: '找不到锻造记录。', text: '' }
              const wire = toWire(record)
              const value = { ok: true, action, id: wire.id, status: wire.status, title: wire.title, score: wire.score, gaps: wire.gaps, draft: wire.draft, final: wire.final }
              return { ...value, text: buildToolText(value) }
            }
            case 'delete': {
              const store = await loadStore(config)
              const record = pick(store, args?.id, sessionId)
              if (record === undefined) return { ok: false, action, error: '找不到锻造记录。', text: '' }
              delete store.records[record.id]
              store.order = store.order.filter((id) => id !== record.id)
              await saveStore(config, store)
              const value = { ok: true, action, id: record.id }
              return { ...value, text: buildToolText(value) }
            }
            default:
              return {
                ok: false,
                action,
                error: `未知 action "${action}"，可用：start/update/draft/finalize/status/list/get/delete。`,
                text: '',
              }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn('[dsh-prompt-forge] tool failed:', message)
          return { ok: false, action, error: message, text: `prompt_forge 失败：${message}` }
        }
      },
    })
    return () => {
      try {
        dispose?.()
      } catch {
        /* already gone */
      }
    }
  }, 'prompt-forge tool')

  /** Runtime skill: the interview playbook, discovered from the skill catalog. */
  ctx.inject(['skills'], (scope) => {
    try {
      const dispose = scope.skills.register({
        name: 'prompt-forge',
        description:
          '把用户模糊的想法锻造成完整、可靠、高效的提示词：每轮 3-5 个带选项的反问，逐个确认十个要素后定稿。Used when the user wants to turn a vague idea into a precise prompt.',
        whenToUse:
          '用户说"帮我做个提示词""把这句话写成 prompt""提示词怎么写才准""我想做…但描述不清"时加载。',
        source: 'runtime',
        invocation: { modelInvocable: true, userInvocable: true },
        content: SKILL_CONTENT,
      })
      scope.effect(() => dispose, 'prompt-forge skill')
    } catch (error) {
      console.warn('[dsh-prompt-forge] skill registration skipped:', error?.message ?? error)
    }
  })

  /** `/prompt [想法]` — deterministic entry point. */
  ctx.inject(['commands'], (scope) => {
    try {
      const dispose = scope.commands.register({
        name: 'prompt',
        description: '开启提示词锻造：把模糊想法反问成一份精准提示词',
        input: { hint: '可选：一句话描述你的想法' },
        handler: async (invocation) => {
          const sessionId = invocation?.agent?.id
          const agent = invocation?.agent
          const raw = typeof invocation?.rawInput === 'string' ? invocation.rawInput.trim() : ''
          try {
            const store = await loadStore(config)
            let record = findForSession(store, sessionId)
            if (raw.length > 0) {
              record = normalizeRecord({
                id: newId(),
                sessionId,
                title: raw.length > 24 ? `${raw.slice(0, 24)}…` : raw,
                brief: raw,
                lang: 'zh',
                status: 'drafting',
                slots: {},
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              store.records[record.id] = record
              store.order.unshift(record.id)
              pruneStore(store)
              await saveStore(config, store)
            }
            if (record === undefined) {
              return {
                kind: 'success',
                text: '提示词锻造已就绪。\n直接告诉我你的想法（哪怕只有一句话），我会一轮一轮问清楚，最后给你一份完整提示词。',
              }
            }
            const wire = toWire(record)
            const gaps = wire.gaps.slice(0, 4).map((gap) => `· ${gap.label}：${gap.question}`).join('\n')

            // The command itself cannot run the interview — it can only hand the
            // idea back to the model as a user message and wake the driver. Without
            // this, `/prompt` created a record and stopped at 0/100 forever.
            if (agent !== undefined && typeof agent.followup === 'function') {
              const brief = record.brief.length > 0 ? record.brief : raw
              const kickoff =
                `【提示词锻造】请继续推进这条锻造记录（id ${record.id}）。\n\n` +
                `用户的想法：${brief}\n\n` +
                `现在立刻执行：先加载 prompt-forge 技能，然后用 ask_user_question 问第一轮（3-5 个问题，` +
                `每个都给 2-4 个具体选项），优先问这些缺口：\n${gaps}\n\n` +
                `问完一轮后调用 prompt_forge（action "update"）把用户确认的决定落盘，再继续下一轮，直到 readyToFinalize 后 finalize。`
              let followupMessage
              try {
                const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
                followupMessage = createUserMessage({
                  content: [{ type: 'text', text: kickoff }],
                  source: { kind: 'user' },
                })
              } catch {
                // dsh-llm unavailable: fall back to a plain object the driver may
                // still accept, and if not, the followup is simply skipped.
                followupMessage = { role: 'user', content: [{ type: 'text', text: kickoff }], source: { kind: 'user' } }
              }
              try {
                agent.followup(followupMessage)
                return { kind: 'success', text: '已开始锻造，我会马上反问。' }
              } catch {
                /* fall through to the text-only reply */
              }
            }

            return {
              kind: 'success',
              text: `提示词锻造：${wire.title}（完整度 ${wire.score}/100）\n还差的要素：\n${gaps}\n\n把想法补充给我，或直接说"开始提问"。`,
            }
          } catch (error) {
            return { kind: 'error', text: `提示词锻造不可用：${error instanceof Error ? error.message : String(error)}` }
          }
        },
      })
      scope.effect(() => dispose, 'prompt-forge command')
    } catch (error) {
      console.warn('[dsh-prompt-forge] command registration skipped:', error?.message ?? error)
    }
  })

  /** Host RPC the Client panel reads. */
  ctx.inject(['connection'], (scope) => {
    try {
      const connection = scope.root?.connection ?? scope.connection
      if (connection === undefined || connection.rpc === undefined) return
      const dispose = connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
        try {
          const body = payload !== null && typeof payload === 'object' ? payload : {}
          const store = await loadStore(config)
          if (endpoint === 'state') {
            const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
            const active = findForSession(store, sessionId)
            return {
              ok: true,
              value: {
                active: active === undefined ? null : toWire(active),
                history: store.order.map((id) => summarize(store.records[id])).filter(Boolean),
              },
            }
          }
          if (endpoint === 'get') {
            const id = typeof body.id === 'string' ? body.id : ''
            const record = store.records[id]
            if (record === undefined) {
              return { ok: false, error: { code: 'pf/not-found', message: `no record ${id}`, details: {} } }
            }
            return { ok: true, value: { record: toWire(record) } }
          }
          if (endpoint === 'delete') {
            const id = typeof body.id === 'string' ? body.id : ''
            const record = store.records[id]
            if (record === undefined) {
              return { ok: false, error: { code: 'pf/not-found', message: `no record ${id}`, details: {} } }
            }
            delete store.records[id]
            store.order = store.order.filter((entry) => entry !== id)
            await saveStore(config, store)
            return { ok: true, value: { deleted: id } }
          }
          return { ok: false, error: { code: 'pf/unknown-endpoint', message: `unknown endpoint ${endpoint}`, details: {} } }
        } catch (error) {
          return {
            ok: false,
            error: {
              code: 'pf/failed',
              message: error instanceof Error ? error.message : String(error),
              details: {},
            },
          }
        }
      })
      scope.effect(() => dispose, 'prompt-forge rpc')
    } catch (error) {
      console.warn('[dsh-prompt-forge] rpc registration skipped:', error?.message ?? error)
    }
  })
}
