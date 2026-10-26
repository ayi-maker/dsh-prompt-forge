window.__ModuleLoader__.load({
  id: 'dsh-prompt-forge',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo } = React

    const NS = 'dsh-prompt-forge'
    const RPC_CHANNEL = '/dsh-prompt-forge'
    const PANEL_ID = 'prompt-forge'
    const FORGE_KEY = 'promptForge'

    const zh = {
      'nav': '提示词',
      'view.title': '提示词锻造台',
      'view.subtitle': '把模糊想法问成一份精准提示词',
      'empty.title': '还没有正在锻造的提示词',
      'empty.body': '在对话里说出你的想法（哪怕只有一句），或输入 /prompt。我会一轮一轮问清楚，草稿会在这里实时长出来。',
      'empty.example': '例如：「我想让 AI 帮我写周报，但每次都不满意」',
      'status.drafting': '锻造中',
      'status.ready': '要素已齐',
      'status.final': '已定稿',
      'score.label': '完整度',
      'score.ready': '要素齐全，可以定稿',
      'score.gaps': '还差 {count} 项',
      'section.slots': '十项要素',
      'section.prompt': '提示词',
      'section.gaps': '接下来该问什么',
      'section.history': '历史记录',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.copyDraft': '复制草稿',
      'action.copyFinal': '复制最终版',
      'action.refresh': '刷新',
      'action.delete': '删除',
      'action.open': '展开',
      'action.back': '回到对话',
      'action.dismiss': '关闭进度条',
      'action.dismiss.title': '关闭这条进度提示',
      'slot.missing': '待确认',
      'gaps.hint': '这些问题由助手在对话里问你；你也可以直接在对话里补充。',
      'history.empty': '暂无历史记录。',
      'history.current': '当前',
      'history.untitled': '（未命名）',
      'error.rpc': '无法连接 Host：{message}',
      'loading': '读取中…',
      'dock.title': '提示词锻造',
      'dock.empty': '说出想法，我来反问',
      'final.banner': '已定稿，可直接复制使用。',
    }

    const en = {
      'nav': 'Prompt',
      'view.title': 'Prompt Forge',
      'view.subtitle': 'Turn a vague idea into a precise prompt',
      'empty.title': 'Nothing in the forge yet',
      'empty.body': 'Describe your idea in the chat (even one sentence), or type /prompt. I ask questions; the draft grows here live.',
      'empty.example': 'e.g. "I want AI to write my weekly report, but I am never happy with it"',
      'status.drafting': 'Forging',
      'status.ready': 'Ready',
      'status.final': 'Final',
      'score.label': 'Completeness',
      'score.ready': 'All elements set — ready to finalize',
      'score.gaps': '{count} left',
      'section.slots': 'Ten elements',
      'section.prompt': 'Prompt',
      'section.gaps': 'What to ask next',
      'section.history': 'History',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.copyDraft': 'Copy draft',
      'action.copyFinal': 'Copy final',
      'action.refresh': 'Refresh',
      'action.delete': 'Delete',
      'action.open': 'Open',
      'action.back': 'Back to chat',
      'action.dismiss': 'Dismiss bar',
      'action.dismiss.title': 'Dismiss this progress bar',
      'slot.missing': 'Pending',
      'gaps.hint': 'The assistant asks these in the chat; you can also answer them right there.',
      'history.empty': 'No history yet.',
      'history.current': 'current',
      'history.untitled': '(untitled)',
      'error.rpc': 'Cannot reach the Host: {message}',
      'loading': 'Loading…',
      'dock.title': 'Prompt forge',
      'dock.empty': 'Say the idea, I ask the questions',
      'final.banner': 'Finalized — copy it and use it.',
    }

    const STYLE = `
.pf-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6}
.pf-head{display:flex;align-items:flex-start;gap:10px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.pf-head-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.pf-title{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
.pf-body{flex:1;min-height:0;overflow:auto;padding:16px 18px 28px;display:flex;flex-direction:column;gap:14px}
.pf-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px 14px}
.pf-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.pf-card-title{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.pf-badge{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:11px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.pf-badge.final{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.pf-badge.ready{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.pf-score{display:flex;align-items:center;gap:10px}
.pf-score-bar{position:relative;flex:1;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.pf-score-fill{position:absolute;inset:0 auto 0 0;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .25s ease}
.pf-score-num{font-variant-numeric:tabular-nums;font-size:12px;color:var(--dsw-alias-label-secondary);min-width:36px;text-align:right}
.pf-slots{display:flex;flex-direction:column;gap:1px}
.pf-slot{display:flex;gap:10px;padding:6px 8px;border-radius:6px;align-items:flex-start}
.pf-slot:hover{background:var(--dsw-alias-bg-layer-2)}
.pf-dot{width:7px;height:7px;border-radius:999px;margin-top:6px;flex:none;background:var(--dsw-alias-state-idle-primary)}
.pf-dot.on{background:var(--dsw-alias-state-success-primary)}
.pf-slot-main{min-width:0;flex:1}
.pf-slot-label{font-size:12px;font-weight:600}
.pf-slot-value{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.pf-slot-value.missing{font-style:italic;opacity:.7}
.pf-prompt{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.65;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;max-height:340px;overflow:auto}
.pf-gap{display:flex;flex-direction:column;gap:3px;padding:7px 9px;border-radius:6px;border:1px dashed var(--dsw-alias-border-l1)}
.pf-gap+.pf-gap{margin-top:6px}
.pf-gap-label{font-size:12px;font-weight:600}
.pf-gap-q{font-size:12px;color:var(--dsw-alias-label-secondary)}
.pf-gap-opts{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}
.pf-chip{font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.pf-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;line-height:1.5}
.pf-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.pf-btn.small{padding:2px 8px;font-size:11px}
.pf-history{display:flex;flex-direction:column;gap:2px}
.pf-hist{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}
.pf-hist:hover{background:var(--dsw-alias-bg-layer-2)}
.pf-hist.active{background:var(--dsw-alias-bg-layer-2);outline:1px solid var(--dsw-alias-border-l2)}
.pf-hist-main{flex:1;min-width:0;display:flex;flex-direction:column}
.pf-hist-title{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-hist-meta{font-size:11px;color:var(--dsw-alias-label-secondary)}
.pf-empty{display:flex;flex-direction:column;gap:8px;padding:24px 18px;align-items:flex-start}
.pf-empty-title{font-size:14px;font-weight:600}
.pf-empty-body{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:54ch}
.pf-empty-hint{font-size:12px;color:var(--dsw-alias-brand-primary)}
.pf-err{font-size:12px;color:var(--dsw-alias-state-error-primary);padding:10px 12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px}
.pf-note{font-size:12px;color:var(--dsw-alias-label-secondary)}
.pf-dock{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;font-size:12px}
.pf-dock-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;cursor:pointer;background:none;border:none;color:inherit;font:inherit;padding:0;text-align:left}
.pf-dock-title{font-weight:600;white-space:nowrap}
.pf-dock-preview{color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.pf-dock-bar{position:relative;width:64px;height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;flex:none}
.pf-dock-fill{position:absolute;inset:0 auto 0 0;background:var(--dsw-alias-brand-primary);border-radius:999px}
.pf-dock-close{appearance:none;border:none;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;padding:4px;border-radius:5px;flex:none;display:inline-flex;align-items:center;justify-content:center}
.pf-dock-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pf-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`

    function makeFallbackT() {
      return (key, params) => {
        let text = zh[key] ?? key
        if (params !== null && typeof params === 'object') {
          for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
        }
        return text
      }
    }

    function installStyle() {
      const style = document.createElement('style')
      style.dataset.plugin = NS
      style.textContent = STYLE
      document.head.appendChild(style)
      return () => style.remove()
    }

    // ------------------------------------------------------------------
    // Shared forge store: a single in-browser cache keyed by session id,
    // plus a tiny subscription set. The dock (session-scoped) is the only
    // component that talks to the Host — and it only does so when the
    // session projection reports a prompt_forge tick. The panel reads from
    // here, so two components never both poll.
    // ------------------------------------------------------------------
    const forgeStore = {
      bySession: new Map(), // sessionId -> { loaded, error, active, history, unavailable }
      listeners: new Set(),
    }

    function notifyForge() {
      for (const listener of forgeStore.listeners) listener()
    }

    function forgeStateOf(sessionId) {
      const key = typeof sessionId === 'string' ? sessionId : ''
      const entry = forgeStore.bySession.get(key)
      if (entry !== undefined) return entry
      return { loaded: false, error: null, active: null, history: [], unavailable: false }
    }

    function useForgeStore(sessionId) {
      const key = typeof sessionId === 'string' ? sessionId : ''
      const [, force] = useState(0)
      useEffect(() => {
        const listener = () => force((n) => n + 1)
        forgeStore.listeners.add(listener)
        return () => {
          forgeStore.listeners.delete(listener)
        }
      }, [key])
      return forgeStateOf(key)
    }

    async function refreshForge(connection, sessionId) {
      const key = typeof sessionId === 'string' ? sessionId : ''
      if (connection === undefined || connection === null || connection.rpc === undefined) {
        forgeStore.bySession.set(key, { loaded: true, error: null, active: null, history: [], unavailable: true })
        notifyForge()
        return
      }
      try {
        const result = await connection.rpc.call(RPC_CHANNEL, 'state', { sessionId }, AbortSignal.timeout(8000))
        if (result === undefined || result === null) return
        if (!result.ok) {
          forgeStore.bySession.set(key, {
            loaded: true,
            error: result.error?.message ?? 'rpc failed',
            active: null,
            history: [],
            unavailable: false,
          })
        } else {
          const value = result.value ?? {}
          forgeStore.bySession.set(key, {
            loaded: true,
            error: null,
            active: value.active ?? null,
            history: Array.isArray(value.history) ? value.history : [],
            unavailable: false,
          })
        }
      } catch (error) {
        forgeStore.bySession.set(key, {
          loaded: true,
          error: error instanceof Error ? error.message : String(error),
          active: null,
          history: [],
          unavailable: false,
        })
      }
      notifyForge()
    }

    // The dock is session-scoped and holds the only Host connection. It
    // subscribes to the session projection tick and re-reads only on change.
    function useForgeTick(useProjection) {
      const tick = typeof useProjection === 'function' ? useProjection(FORGE_KEY) : undefined
      return typeof tick?.tick === 'number' ? tick.tick : 0
    }

    function copyText(text) {
      const value = typeof text === 'string' ? text : ''
      if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(value).catch(() => fallbackCopy(value))
      }
      fallbackCopy(value)
      return Promise.resolve()
    }

    function fallbackCopy(value) {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      area.remove()
    }

    function CopyButton({ label, text, t }) {
      const [done, setDone] = useState(false)
      const onClick = useCallback(() => {
        void copyText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        })
      }, [text])
      return h('button', { type: 'button', className: 'pf-btn small', onClick }, done ? t('action.copied') : label)
    }

    function statusKey(status) {
      if (status === 'final') return 'status.final'
      if (status === 'ready') return 'status.ready'
      return 'status.drafting'
    }

    function Score({ record, t }) {
      const score = typeof record.score === 'number' ? Math.max(0, Math.min(100, record.score)) : 0
      const gaps = Array.isArray(record.gaps) ? record.gaps.length : 0
      return h(
        'div',
        { className: 'pf-card' },
        h(
          'div',
          { className: 'pf-card-head' },
          h('span', { className: 'pf-card-title' }, t('score.label')),
          h('span', { className: `pf-badge${record.status === 'final' ? ' final' : record.status === 'ready' ? ' ready' : ''}` }, t(statusKey(record.status))),
        ),
        h(
          'div',
          { className: 'pf-score' },
          h('div', { className: 'pf-score-bar' }, h('div', { className: 'pf-score-fill', style: { width: score + '%' } })),
          h('span', { className: 'pf-score-num' }, score + '%'),
        ),
        h('div', { className: 'pf-note', style: { marginTop: '6px' } }, record.readyToFinalize ? t('score.ready') : t('score.gaps', { count: gaps })),
      )
    }

    function SlotList({ record, t }) {
      const slots = Array.isArray(record.slots) ? record.slots : []
      return h(
        'div',
        { className: 'pf-card' },
        h('div', { className: 'pf-card-head' }, h('span', { className: 'pf-card-title' }, t('section.slots'))),
        h(
          'div',
          { className: 'pf-slots' },
          slots.map((slot) =>
            h(
              'div',
              { className: 'pf-slot', key: slot.key },
              h('span', { className: 'pf-dot' + (slot.filled ? ' on' : '') }),
              h(
                'div',
                { className: 'pf-slot-main' },
                h('div', { className: 'pf-slot-label' }, slot.label),
                h('div', { className: 'pf-slot-value' + (slot.filled ? '' : ' missing') }, slot.filled ? slot.value : slot.guidance ?? t('slot.missing')),
              ),
            ),
          ),
        ),
      )
    }

    function PromptBlock({ record, t }) {
      const isFinal = record.status === 'final' && typeof record.final === 'string' && record.final.length > 0
      const text = isFinal ? record.final : record.draft
      return h(
        'div',
        { className: 'pf-card' },
        h(
          'div',
          { className: 'pf-card-head' },
          h('span', { className: 'pf-card-title' }, t('section.prompt')),
          h(CopyButton, { label: isFinal ? t('action.copyFinal') : t('action.copyDraft'), text: text ?? '', t }),
        ),
        isFinal ? h('div', { className: 'pf-note', style: { marginBottom: '8px' } }, t('final.banner')) : null,
        h('div', { className: 'pf-prompt' }, text ?? ''),
      )
    }

    function GapList({ record, t }) {
      const gaps = Array.isArray(record.gaps) ? record.gaps : []
      if (gaps.length === 0) return null
      return h(
        'div',
        { className: 'pf-card' },
        h('div', { className: 'pf-card-head' }, h('span', { className: 'pf-card-title' }, t('section.gaps'))),
        h('div', { className: 'pf-note', style: { marginBottom: '8px' } }, t('gaps.hint')),
        gaps.slice(0, 6).map((gap) =>
          h(
            'div',
            { className: 'pf-gap', key: gap.key },
            h('div', { className: 'pf-gap-label' }, gap.label),
            h('div', { className: 'pf-gap-q' }, gap.question),
            Array.isArray(gap.options) && gap.options.length > 0
              ? h(
                  'div',
                  { className: 'pf-gap-opts' },
                  gap.options.map((option, index) => h('span', { className: 'pf-chip', key: index }, option)),
                )
              : null,
          ),
        ),
      )
    }

    function History({ data, t, onOpen, onDelete }) {
      const items = Array.isArray(data.history) ? data.history : []
      return h(
        'div',
        { className: 'pf-card' },
        h('div', { className: 'pf-card-head' }, h('span', { className: 'pf-card-title' }, t('section.history'))),
        items.length === 0
          ? h('div', { className: 'pf-note' }, t('history.empty'))
          : h(
              'div',
              { className: 'pf-history' },
              items.map((item) => {
                const active = data.active !== null && data.active !== undefined && data.active.id === item.id
                return h(
                  'div',
                  {
                    className: 'pf-hist' + (active ? ' active' : ''),
                    key: item.id,
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onOpen(item.id),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') onOpen(item.id)
                    },
                  },
                  h(
                    'div',
                    { className: 'pf-hist-main' },
                    h('div', { className: 'pf-hist-title' }, item.title || t('history.untitled')),
                    h('div', { className: 'pf-hist-meta' }, `${item.status} · ${item.score}%` + (active ? ` · ${t('history.current')}` : '')),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pf-btn small',
                      onClick: (event) => {
                        event.stopPropagation()
                        onDelete(item.id)
                      },
                    },
                    t('action.delete'),
                  ),
                )
              }),
            ),
      )
    }

    function Empty({ t }) {
      return h(
        'div',
        { className: 'pf-card' },
        h(
          'div',
          { className: 'pf-empty' },
          h('div', { className: 'pf-empty-title' }, t('empty.title')),
          h('div', { className: 'pf-empty-body' }, t('empty.body')),
          h('div', { className: 'pf-empty-hint' }, t('empty.example')),
        ),
      )
    }

    // Stand-in used only when an owner omits the standard sessions hook, so the
    // component still calls a hook in the same order on every render.
    function noopSnapshotHook(selector) {
      return selector(undefined)
    }

    function ForgePanel({ t, connection, useSessions }) {
      const readSession = typeof useSessions === 'function' ? useSessions : noopSnapshotHook
      const sessionId = readSession((snapshot) => snapshot?.current ?? '') ?? ''
      const data = useForgeStore(sessionId)
      const [pinnedId, setPinnedId] = useState(null)
      const [pinned, setPinned] = useState(null)

      const reload = useCallback(() => {
        void refreshForge(connection, sessionId)
      }, [connection, sessionId])

      // The panel is root-scoped and cannot subscribe to the session projection
      // the way the dock does, but it must still load on mount — otherwise the
      // sidebar opens onto an empty panel whenever the dock has not pulled yet.
      useEffect(() => {
        reload()
      }, [reload])

      useEffect(() => {
        if (pinnedId === null || connection === undefined || connection === null) {
          setPinned(null)
          return undefined
        }
        let alive = true
        void (async () => {
          try {
            const result = await connection.rpc.call(RPC_CHANNEL, 'get', { id: pinnedId }, AbortSignal.timeout(8000))
            if (!alive) return
            if (result?.ok && result.value?.record !== undefined) setPinned(result.value.record)
          } catch {
            /* keep previous pinned record */
          }
        })()
        return () => {
          alive = false
        }
      }, [pinnedId, connection, data.active?.updatedAt])

      const record = pinned ?? data.active

      const onDelete = useCallback(
        (id) => {
          if (connection === undefined || connection === null) return
          void connection.rpc
            .call(RPC_CHANNEL, 'delete', { id }, AbortSignal.timeout(8000))
            .then(() => {
              if (pinnedId === id) setPinnedId(null)
              reload()
            })
            .catch(() => undefined)
        },
        [connection, pinnedId, reload],
      )

      const head = h(
        'div',
        { className: 'pf-head' },
        h(
          'div',
          { className: 'pf-head-main' },
          h('div', { className: 'pf-title' }, record ? record.title || t('view.title') : t('view.title')),
          h('div', { className: 'pf-sub' }, t('view.subtitle')),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'pf-btn small',
            onClick: () => {
              setPinnedId(null)
              reload()
            },
          },
          t('action.refresh'),
        ),
      )

      if (data.unavailable) {
        return h('div', { className: 'pf-root' }, head, h('div', { className: 'pf-body' }, h('div', { className: 'pf-err' }, t('error.rpc', { message: 'RPC unavailable' }))))
      }
      if (data.error !== null) {
        return h('div', { className: 'pf-root' }, head, h('div', { className: 'pf-body' }, h('div', { className: 'pf-err' }, t('error.rpc', { message: data.error }))))
      }
      if (!data.loaded) {
        return h('div', { className: 'pf-root' }, head, h('div', { className: 'pf-body' }, h('div', { className: 'pf-note' }, t('loading'))))
      }

      return h(
        'div',
        { className: 'pf-root' },
        head,
        h(
          'div',
          { className: 'pf-body' },
          record === null || record === undefined
            ? h(Empty, { t })
            : h(React.Fragment, null, h(Score, { record, t }), h(SlotList, { record, t }), h(PromptBlock, { record, t }), h(GapList, { record, t })),
          h(History, { data, t, onOpen: (id) => setPinnedId(id), onDelete }),
        ),
      )
    }

    function ForgeDock({ t, connection, sessionId, onOpen, useProjection }) {
      const data = useForgeStore(sessionId)
      // Session projection: ticks every prompt_forge call in this session.
      const tick = useForgeTick(useProjection)

      useEffect(() => {
        // Pull once on mount, then only when the projection reports a change.
        void refreshForge(connection, sessionId)
      }, [connection, sessionId, tick])

      const record = data.active
      // Remember which record this session dismissed, so closing the bar sticks
      // across re-renders (and reloads) until a NEW record appears.
      const dismissKey = `dsh-prompt-forge:dismissed:${typeof sessionId === 'string' ? sessionId : ''}`
      const [dismissedId, setDismissedId] = useState(() => {
        try {
          return window.localStorage.getItem(dismissKey) ?? ''
        } catch {
          return ''
        }
      })

      // The dock is session-scoped but React keeps its state when the session
      // changes; re-read the dismissed marker whenever the session id moves.
      useEffect(() => {
        try {
          setDismissedId(window.localStorage.getItem(dismissKey) ?? '')
        } catch {
          setDismissedId('')
        }
      }, [dismissKey])

      // Stay out of the composer unless this session owns a forge we haven't
      // dismissed yet.
      if (record === null || record === undefined || (record.id === dismissedId && dismissedId !== '')) return null

      const dismiss = () => {
        const id = record.id ?? ''
        setDismissedId(id)
        try {
          window.localStorage.setItem(dismissKey, id)
        } catch {
          /* storage unavailable */
        }
      }

      const score = typeof record.score === 'number' ? Math.max(0, Math.min(100, record.score)) : 0
      const preview =
        record.status === 'final'
          ? t('status.final')
          : Array.isArray(record.gaps) && record.gaps.length > 0
            ? `${t('score.gaps', { count: record.gaps.length })} · ${record.gaps[0].label}`
            : t('score.ready')
      return h(
        'div',
        { className: 'pf-dock' },
        h(
          'button',
          { type: 'button', className: 'pf-dock-main', onClick: onOpen, title: t('view.subtitle') },
          h('span', { className: 'pf-dock-title' }, record.title || t('dock.title')),
          h('span', { className: 'pf-dock-preview' }, preview),
        ),
        h('span', { className: 'pf-dock-bar', 'aria-hidden': true }, h('span', { className: 'pf-dock-fill', style: { width: score + '%' } })),
        h('button', { type: 'button', className: 'pf-btn small', onClick: onOpen }, `${score}%`),
        h(
          'button',
          { type: 'button', className: 'pf-dock-close', onClick: dismiss, title: t('action.dismiss.title'), 'aria-label': t('action.dismiss') },
          '×',
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(installStyle, 'prompt-forge style')

        let t = makeFallbackT()
        try {
          const locale = ctx.get('locale')
          if (locale !== undefined && locale !== null) {
            const disposers = []
            const d1 = locale.register(NS, { zh, en })
            if (typeof d1 === 'function') disposers.push(d1)
            const d2 = locale.bind(NS)
            if (typeof d2 === 'function') t = d2
            ctx.effect(() => {
              for (const dispose of disposers) {
                try {
                  dispose()
                } catch {
                  /* ignore */
                }
              }
            }, 'prompt-forge locale')
          }
        } catch {
          /* fall back to the built-in Chinese dictionary */
        }

        // Read lazily: the connection service may attach after this plugin's
        // apply runs, and each render should see whatever is live then.
        const getConnection = () => {
          try {
            return ctx.get('connection')
          } catch {
            return undefined
          }
        }
        const layout = ctx.get('layout')

        const openPanel = () => {
          try {
            layout?.selectPanel?.(PANEL_ID)
          } catch {
            /* the shell may not expose panel selection */
          }
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('nav') },
            function PromptForgeIcon(props) {
              const size = typeof props?.size === 'number' ? props.size : 16
              return h(
                'svg',
                {
                  viewBox: '0 0 24 24',
                  width: size,
                  height: size,
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.7,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  'aria-hidden': true,
                  style: { opacity: props?.active ? 1 : 0.72 },
                },
                h('path', { d: 'M4 20l4.4-1.2L19 8.3a2.3 2.3 0 0 0-3.3-3.3L5.2 15.6 4 20z' }),
                h('path', { d: 'M14.3 6.3l3.4 3.4' }),
              )
            },
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, function PromptForgePanel(props) {
            return h(ForgePanel, { t, connection: getConnection(), useSessions: props?.useSessions })
          }),
        )

        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'conversation.input.dock', id: PANEL_ID, order: 30, label: () => t('dock.title') },
            function PromptForgeDock(props) {
              const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : props?.session?.sessionId ?? ''
              return h(ForgeDock, { t, connection: getConnection(), sessionId, onOpen: openPanel, useProjection: props?.useProjection })
            },
          ),
        )
      },
    }
  },
})
