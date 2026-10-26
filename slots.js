/**
 * The ten decisions a prompt must answer before it can be trusted.
 *
 * Each slot carries:
 *   key      — the stable id written into slots
 *   label / labelEn — panel + tool display
 *   weight   — its share of the 100-point completeness score
 *   priority — 1 = must-answer first, 4 = optional refinement
 *   question — the question the model asks the user about it
 *   options  — 2-4 clickable answer options, plus a custom-answer fallback
 *   guidance — what a good value for this slot looks like
 *
 * Rationale: WHY-THESE-SLOTS.md explains the reasoning and the weights.
 */
export const SLOTS = [
  {
    key: 'outcome',
    label: '目标与成功标准',
    labelEn: 'Outcome',
    weight: 18,
    priority: 1,
    question: '这个任务最终要产出什么？怎样才算做对了？',
    questionEn: 'What should this task ultimately produce, and what counts as success?',
    options: [
      '一份可以直接拿去用的成品（文档/代码/方案）',
      '一份用于决策的分析与建议',
      '一套可执行的步骤清单',
      '先给我 2-3 个方向，我再选',
    ],
    guidance: '写成一句可判定的目标，附一条"做对了的表现"。避免"好一点""专业一点"这类无法验收的形容词。',
  },
  {
    key: 'deliverable',
    label: '交付物形态',
    labelEn: 'Deliverable',
    weight: 16,
    priority: 1,
    question: '结果以什么形态交付？篇幅/结构/语言有要求吗？',
    questionEn: 'In what form should the result be delivered (structure, length, language)?',
    options: [
      'Markdown 文档，结构化小节，2000 字以内',
      '直接对话回答，不单独出文件',
      '表格 / 清单，便于逐条核对',
      '可运行的代码 + 使用说明',
      '演示文稿大纲（分页要点）',
    ],
    guidance: '明确"章节结构 + 篇幅上限 + 语言/术语风格"，这是效率的最大来源。',
  },
  {
    key: 'constraints',
    label: '硬约束与边界',
    labelEn: 'Hard constraints',
    weight: 14,
    priority: 1,
    question: '有哪些必须做到 / 绝对不能做的硬约束？',
    questionEn: 'Which hard constraints must be honoured (must / must-not)?',
    options: [
      '只基于我提供的资料，不许自行发挥',
      '不许编造数据、引用或案例；不确定就标注',
      '必须在开头给一句话结论',
      '有字数 / 时长 / 预算上限',
      '必须符合某个规范或模板',
    ],
    guidance: '分两栏写：必须做（must）、绝不（must not）。硬约束越多，提示词越可靠。',
  },
  {
    key: 'context',
    label: '背景与输入材料',
    labelEn: 'Context & inputs',
    weight: 12,
    priority: 1,
    question: '我这边已经有什么材料？哪些背景是我默认你知道的？',
    questionEn: 'What material do you already have, and which background may I assume?',
    options: [
      '我有完整背景资料，稍后贴给你',
      '只有零散笔记，需要你先帮我梳理',
      '只有一句话想法，需要你补齐常识背景',
      '参考资料在某个链接 / 文件里',
    ],
    guidance: '列出已知事实、已排除的方案、以及"需要现场确认的未知项"。',
  },
  {
    key: 'quality',
    label: '质量标准与验收',
    labelEn: 'Quality bar',
    weight: 12,
    priority: 2,
    question: '你会用什么客观标准判断结果好不好？',
    questionEn: 'By which objective standards will you judge the result?',
    options: [
      '能直接拿去用，不用再返工',
      '结论必须可验证 / 可复现',
      '要覆盖反例与边界情况',
      '风格要对齐某个现成范本',
    ],
    guidance: '把"好"翻译成可核对的条件（可验证、可复现、无遗漏、可交付）。',
  },
  {
    key: 'audience',
    label: '受众与使用场景',
    labelEn: 'Audience & setting',
    weight: 10,
    priority: 2,
    question: '这份结果给谁看、在什么场景下用？',
    questionEn: 'Who reads this, and in what setting is it used?',
    options: [
      '给我自己看，内部使用',
      '给领导 / 客户汇报',
      '对外公开发布',
      '给团队执行落地',
    ],
    guidance: '受众决定专业深度、术语密度和语气；场景决定格式。',
  },
  {
    key: 'role',
    label: '角色与专业视角',
    labelEn: 'Role',
    weight: 8,
    priority: 3,
    question: '希望我以什么身份、什么专业水平来做这件事？',
    questionEn: 'Which role and level of expertise should I adopt?',
    options: [
      '资深行业专家（直接给判断）',
      '严谨的分析师 / 审稿人（挑毛病优先）',
      '创意策划（多给方案）',
      '通用助手即可，不用扮演',
    ],
    guidance: '角色只在能改变输出时才有价值；不要写空泛的"你是世界级专家"。',
  },
  {
    key: 'method',
    label: '执行方法与节奏',
    labelEn: 'Method',
    weight: 6,
    priority: 3,
    question: '你希望我按什么路径推进？',
    questionEn: 'Which path should I follow?',
    options: [
      '先给结论，再给依据',
      '先列方案对比，再推荐一个',
      '分步执行，每步等我确认',
      '一次给完整成品，不要中间过程',
    ],
    guidance: '决定"一次交付"还是"分步确认"，以及推理是否外显。',
  },
  {
    key: 'examples',
    label: '参考样例与反例',
    labelEn: 'References',
    weight: 2,
    priority: 4,
    question: '有没有正例（照这个来）或反例（千万别这样）？',
    questionEn: 'Any positive references or anti-examples?',
    options: [
      '有正例，我贴给你',
      '有反例，我讨厌那种写法',
      '没有，按你的判断来',
    ],
    guidance: '一个正例胜过十句形容词；一个反例能省掉一轮返工。',
  },
  {
    key: 'risks',
    label: '最易翻车的点',
    labelEn: 'Failure modes',
    weight: 2,
    priority: 4,
    question: '这类任务最容易在哪里翻车？',
    questionEn: 'Where does this kind of task usually go wrong?',
    options: [
      '编造事实 / 数据',
      '写得空泛，全是套话',
      '偏离我的真实意图',
      '格式花哨但不实用',
    ],
    guidance: '写进提示词的"务必避免"一节，并在自检里逐条确认。',
  },
]

export const SLOT_BY_KEY = new Map(SLOTS.map((slot) => [slot.key, slot]))

/** Share of the 100-point completeness score each slot accounts for. */
export const TOTAL_WEIGHT = SLOTS.reduce((sum, slot) => sum + slot.weight, 0)

/** Section headings of the assembled prompt, in reading order. */
export const SECTIONS_ZH = [
  ['outcome', '任务与成功标准'],
  ['role', '角色'],
  ['context', '背景与输入'],
  ['audience', '受众与使用场景'],
  ['deliverable', '交付物'],
  ['constraints', '硬约束'],
  ['quality', '质量标准与验收'],
  ['method', '执行方法'],
  ['examples', '参考样例与反例'],
  ['risks', '务必避免'],
]
export const SECTIONS_EN = [
  ['outcome', 'Task & success criteria'],
  ['role', 'Role'],
  ['context', 'Context & inputs'],
  ['audience', 'Audience & setting'],
  ['deliverable', 'Deliverable'],
  ['constraints', 'Hard constraints'],
  ['quality', 'Quality bar'],
  ['method', 'Method'],
  ['examples', 'References'],
  ['risks', 'Avoid'],
]

export const CHECKLIST_ZH = [
  '交付物形态符合「交付物」一节',
  '满足「硬约束」中的每一条',
  '达到「质量标准与验收」',
  '没有编造未提供的事实、数据或引用',
  '末尾给出结论或下一步',
]
export const CHECKLIST_EN = [
  'The deliverable matches the "Deliverable" section',
  'Every "Hard constraints" item is honoured',
  'The "Quality bar" is met',
  'No invented facts, data, or citations',
  'The answer ends with a conclusion or next step',
]
