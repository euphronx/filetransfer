import type {
  ChatAnnotation,
  ChatChunk,
  ChatMessageParam,
  ChatPart,
  ChatToolCallParam,
  ChatToolStep,
  ChatUsage,
  MessageUsage,
  OutputBlockStart,
  StopReason,
  TextCitation,
  WebFetchToolResultBlock,
} from '../api/types.js'
import { toBlocks } from '../api/toolCalls.js'
import { buildSystemPrompt } from './prompt.js'
import type {
  AssistantMessage,
  FileAttachment,
  Message,
  ReplyBlock,
  ReplyStatus,
  UserMessage,
} from './types.js'

/**
 * 文件按 Files API 的 file_id（附件的 serverId）引用，图片与文档都用 file 内容块。
 * 发送前 streamReply 会先补齐 serverId；仍为 null 的是本地没有原件的附件，不进入请求。
 */
const toFileParts = (files: FileAttachment[]): ChatPart[] =>
  files.flatMap(({ serverId }) => (serverId ? [{ type: 'file', file_id: serverId }] : []))

const toReplyBlock = (block: OutputBlockStart, now: number): ReplyBlock | null => {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text, citations: block.citations ?? [] }
    case 'thinking':
      return {
        type: 'thinking',
        thinking: block.thinking,
        signature: block.signature,
        startedAt: now,
      }
    case 'server_tool_use':
    case 'web_search_tool_result':
    case 'web_fetch_tool_result':
      return block
    default:
      return null
  }
}

const updateBlock = (
  reply: AssistantMessage,
  index: number,
  update: (block: ReplyBlock) => ReplyBlock
): AssistantMessage => {
  const block = reply.blocks[index]
  if (!block) {
    return reply
  }
  const blocks = [...reply.blocks]
  blocks[index] = update(block)
  return { ...reply, blocks }
}

/**
 * 流式处理的游标：思考与正文按到达顺序累积，
 * 工具调用与引用在最后一个 chunk 才完整下发，届时按 id 与码点偏移回填。
 */
export type StreamState = {
  /** 当前正在累积的正文块，-1 表示没有 */
  textIndex: number
  /** 当前正在累积的思考块，-1 表示没有 */
  thinkingIndex: number
  /** 工具调用 id → 该调用在 blocks 里的起始下标 */
  toolBlocks: Map<string, number>
  /** 工具调用 id → 该调用当前占用的块数（调用块 + 结果块，进行中为 1） */
  toolSpans: Map<string, number>
  /** 末块 finish_reason 对应的结束原因 */
  stopReason?: StopReason
  /** 末块携带的会话标题 */
  title?: string
}

export const createStreamState = (): StreamState => ({
  textIndex: -1,
  thinkingIndex: -1,
  toolBlocks: new Map(),
  toolSpans: new Map(),
})

/** 服务端用量换算成本地用量；服务端不返回缓存创建量 */
const toUsage = (usage: ChatUsage): MessageUsage => ({
  input_tokens: usage.prompt_cache_miss_tokens,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: usage.prompt_cache_hit_tokens,
  output_tokens: usage.completion_tokens,
  ...(usage.server_tool_use
    ? {
        server_tool_use: {
          web_search_requests: usage.server_tool_use.tool_search ?? 0,
          tool_search: usage.server_tool_use.tool_search ?? 0,
        },
      }
    : {}),
})

const FINISH_REASONS: Record<string, StopReason> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'refusal',
  // 生成被中断或资源不足：按正常结束处理，状态由调用方归为已停止
  aborted: 'end_turn',
  insufficient_system_resource: 'end_turn',
}

/**
 * 把引用按码点偏移插回正文，切成若干文本块。
 * 服务端给出左闭右开的区间，同一区间可以有多条来源；
 * 越界或非正长度（end <= start）的引用被丢弃。
 */
const splitByCitations = (
  text: string,
  annotations: ChatAnnotation[]
): { text: string; citations: TextCitation[] }[] => {
  // 服务端偏移按 Unicode 码点计，不能用字符串下标
  const points = Array.from(text)
  const length = points.length
  const marks = annotations
    .map((annotation) => {
      const end = Math.min(Math.max(annotation.url_citation.end_index, 0), length)
      return {
        end,
        citation: {
          type: 'web_search_result_location' as const,
          url: annotation.url_citation.url,
          title: annotation.url_citation.title || null,
          // 引用处之前的全部正文，去掉首尾空白
          cited_text: points.slice(0, end).join('').trim(),
          encrypted_index: '',
        } satisfies TextCitation,
      }
    })
    .filter((mark) => mark.end > 0)
    .sort((a, b) => a.end - b.end)

  if (marks.length === 0) {
    return [{ text, citations: [] }]
  }

  const segments: { text: string; citations: TextCitation[] }[] = []
  let cursor = 0
  for (const mark of marks) {
    // 同一位置的多个引用合并进同一段
    const last = segments.at(-1)
    if (last && mark.end === cursor) {
      last.citations.push(mark.citation)
      continue
    }
    segments.push({ text: points.slice(cursor, mark.end).join(''), citations: [mark.citation] })
    cursor = mark.end
  }
  if (cursor < length) {
    segments.push({ text: points.slice(cursor).join(''), citations: [] })
  }
  return segments
}

/**
 * 末块处理：工具调用与引用一次性到达，按 id 与码点偏移回填。
 * 流式进度事件已建过的块随之替换，签名与结果以此为准。
 */
const applyFinalPayload = (
  reply: AssistantMessage,
  annotations: ChatAnnotation[] | undefined,
  steps: ChatToolStep[] | undefined,
  now: number
): AssistantMessage => {
  if (!annotations && !steps) {
    return reply
  }
  const calls = steps?.flatMap((step) => step.calls) ?? []
  // 末块是权威数据：每个调用用它自己的完整块集合替换流式期间的占位
  const inserts = new Map<string, ReplyBlock[]>()
  for (const call of calls) {
    inserts.set(
      call.id,
      toBlocks(call).flatMap((block) => {
        const converted = toReplyBlock(block, now)
        return converted ? [converted] : []
      })
    )
  }
  const applied = new Set<string>()
  const blocks: ReplyBlock[] = []

  let texts: { text: string; citations: TextCitation[] }[] = []
  const flushText = () => {
    for (const segment of texts) {
      blocks.push({ type: 'text', text: segment.text, citations: segment.citations })
    }
    texts = []
  }

  for (const block of reply.blocks) {
    if (block.type === 'text') {
      texts.push({ text: block.text, citations: block.citations ?? [] })
      continue
    }
    flushText()
    if (block.type === 'server_tool_use') {
      const insert = inserts.get(block.id)
      if (insert) {
        blocks.push(...insert)
        applied.add(block.id)
      } else {
        blocks.push(block)
      }
      continue
    }
    // 结果块已随调用一起插入，跳过流式期间的占位
    if (
      (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') &&
      calls.some((call) => call.id === block.tool_use_id)
    ) {
      continue
    }
    blocks.push(block)
  }
  flushText()

  // 进度事件里没出现过的调用（例如整轮只下发末块）追加在末尾
  for (const call of calls) {
    if (!applied.has(call.id)) {
      blocks.push(...(inserts.get(call.id) ?? []))
    }
  }

  // 引用作用于整轮正文：先把所有正文合并、按码点重新切块
  if (annotations && annotations.length > 0) {
    const whole = blocks
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
    if (whole) {
      const segments = splitByCitations(whole, annotations)
      const rebuilt: ReplyBlock[] = []
      let replaced = false
      for (const block of blocks) {
        if (block.type !== 'text') {
          rebuilt.push(block)
          continue
        }
        if (!replaced) {
          rebuilt.push(...segments.map((segment) => ({ type: 'text' as const, ...segment })))
          replaced = true
        }
      }
      return { ...reply, blocks: rebuilt }
    }
  }

  return { ...reply, blocks }
}

/**
 * 把一个流式 chunk 合并进回复。
 * 思考与正文先按到达顺序累积；工具调用、引用与结束原因在最后一个 chunk 一次性到达。
 */
export const applyEvent = (
  reply: AssistantMessage,
  chunk: ChatChunk,
  now: number,
  state: StreamState
): AssistantMessage => {
  const choice = chunk.choices[0]
  let updated: AssistantMessage = reply.status === 'streaming' ? reply : { ...reply, status: 'streaming' }
  if (chunk.usage) {
    updated = { ...updated, usage: toUsage(chunk.usage) }
  }
  if (!choice) {
    return updated
  }

  const { delta } = choice

  if (delta.reasoning_content) {
    if (state.thinkingIndex < 0) {
      state.thinkingIndex = updated.blocks.length
      updated = {
        ...updated,
        blocks: [
          ...updated.blocks,
          { type: 'thinking', thinking: '', signature: '', startedAt: now },
        ],
      }
    }
    state.textIndex = -1
    const thinking = delta.reasoning_content
    updated = updateBlock(updated, state.thinkingIndex, (block) =>
      block.type === 'thinking' ? { ...block, thinking: block.thinking + thinking } : block
    )
  }

  if (delta.content) {
    if (state.textIndex < 0) {
      state.textIndex = updated.blocks.length
      updated = {
        ...updated,
        blocks: [...updated.blocks, { type: 'text', text: '', citations: [] }],
      }
    }
    const text = delta.content
    updated = updateBlock(updated, state.textIndex, (block) =>
      block.type === 'text' ? { ...block, text: block.text + text } : block
    )
  }

  // 工具调用进度：先占位，末块再用完整数据替换
  const event = choice.server_tool_event
  if (event?.type === 'step_reasoning_done') {
    updated = updateBlock(updated, state.thinkingIndex, (block) =>
      block.type === 'thinking' && block.endedAt === undefined
        ? { ...block, endedAt: now }
        : block
    )
  }
  if (event && event.type !== 'step_reasoning_done') {
    const blocks = toBlocks(event.call).flatMap((block) => {
      const converted = toReplyBlock(block, now)
      return converted ? [converted] : []
    })
    const known = state.toolBlocks.get(event.call.id)
    if (known === undefined) {
      state.toolBlocks.set(event.call.id, updated.blocks.length)
      state.toolSpans.set(event.call.id, blocks.length)
      state.textIndex = -1
      state.thinkingIndex = -1
      updated = { ...updated, blocks: [...updated.blocks, ...blocks] }
    } else {
      // 进度事件不带 signature，用最新块替换该调用原有的整段
      const span = state.toolSpans.get(event.call.id) ?? blocks.length
      state.toolSpans.set(event.call.id, blocks.length)
      updated = {
        ...updated,
        blocks: [...updated.blocks.slice(0, known), ...blocks, ...updated.blocks.slice(known + span)],
      }
    }
  }

  if (choice.finish_reason !== null) {
    state.stopReason = FINISH_REASONS[choice.finish_reason] ?? 'end_turn'
    if (delta.title) {
      state.title = delta.title
    }
    updated = {
      ...updated,
      stopReason: state.stopReason,
      ...(state.stopReason === 'refusal'
        ? { stopDetails: { type: 'refusal' as const, category: null, explanation: null } }
        : {}),
    }
  }

  return applyFinalPayload(updated, delta.annotations, delta.server_tool_calls, now)
}

/**
 * 回复结束：未结束的思考块以当前时间收尾。
 * 安全拒绝（stop_reason: refusal）时已下发的思考与正文不能撤回，按协议要求由客户端丢弃，只保留工具块。
 */
export const settleReply = (
  reply: AssistantMessage,
  status: Extract<ReplyStatus, 'done' | 'stopped' | 'error'>,
  now: number,
  error?: AssistantMessage['error']
): AssistantMessage => ({
  ...reply,
  status,
  error,
  blocks: reply.blocks.flatMap((block): ReplyBlock[] => {
    if (reply.stopReason === 'refusal' && (block.type === 'thinking' || block.type === 'text')) {
      return []
    }
    return block.type === 'thinking' && block.startedAt !== undefined && block.endedAt === undefined
      ? [{ ...block, endedAt: now }]
      : [block]
  }),
})

/** 回复里所有文本块拼起来，用于复制与判断是否有回答 */
export const getReplyText = (reply: AssistantMessage) =>
  reply.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('')

/**
 * 只有正常达到输出上限或被停止的回复可续写，报错回复不能续写。
 * 末条限制由调用方判断，拒绝和客户端工具调用不能续写。
 * 本轮含服务端工具调用或结果（含 READ_LINK 和孤立结果块）的回复不能续写。
 * 服务端模板提示不能作为续写前缀。
 */
export const canContinueReply = (reply: AssistantMessage): boolean => {
  if (
    !reply.prefix ||
    reply.stopReason === 'refusal' ||
    reply.stopReason === 'tool_use' ||
    reply.blocks.some(
      (block) =>
        block.type === 'server_tool_use' ||
        block.type === 'web_search_tool_result' ||
        block.type === 'web_fetch_tool_result' ||
        (block.type === 'text' && block.isTemplate)
    )
  ) {
    return false
  }
  return (
    reply.status === 'stopped' ||
    (reply.status === 'done' && reply.stopReason === 'max_tokens')
  )
}

/**
 * 已结束或停止且有回答文本的回复才放进上下文；被安全拒绝的轮次不回传。
 * 服务端模板提示不进入上下文。
 */
const isUsableReply = (message: Message): message is AssistantMessage =>
  message.role === 'assistant' &&
  (message.status === 'done' || message.status === 'stopped') &&
  message.stopReason !== 'refusal' &&
  !message.blocks.some((block) => block.type === 'text' && block.isTemplate) &&
  getReplyText(message) !== ''

/** 有文件时用内容块数组：先文件后文本，文件按 Files API 的 file_id 引用 */
const toUserParam = ({ content, files }: UserMessage): ChatMessageParam => {
  const parts = toFileParts(files)
  return parts.length === 0
    ? { role: 'user', content }
    : {
        role: 'user',
        content: [...parts, ...(content ? [{ type: 'text' as const, text: content }] : [])],
      }
}

/**
 * assistant 的正文与工具调用按历史与续写场景转换：
 * - 历史思考不回传（服务端会丢弃）；续写时只保留本轮非空白思考，作为 reasoning_content 前缀；
 * - 文本块去掉 citations（服务端忽略），被工具隔开的正文用空行连接；
 * - 工具调用只保留 kind 为 read_link 的，其他历史工具块不回传；
 * - 阅读链接连同 signature 原样回传：服务端解密后将页面拼回该轮提问末尾。
 */
const toAssistantParam = (
  { blocks }: AssistantMessage,
  prefix = false,
  thinking = false
): Extract<ChatMessageParam, { role: 'assistant' }> => {
  // 成功阅读的网页靠签名恢复正文；缺少有效签名时，调用与结果都不回传。
  const unsignedReadLinks = new Set(
    blocks.flatMap((block) =>
      block.type === 'web_fetch_tool_result' &&
      block.kind === 'read_link' &&
      block.content.type === 'web_fetch_result' &&
      !block.signature?.trim()
        ? [block.tool_use_id]
        : []
    )
  )
  const fetches = new Map<string, WebFetchToolResultBlock>()
  for (const block of blocks) {
    if (block.type === 'web_fetch_tool_result') {
      fetches.set(block.tool_use_id, block)
    }
  }

  let content = ''
  let joined = false
  let reasoning = ''
  const calls: ChatToolCallParam[] = []

  for (const block of blocks) {
    if (block.type === 'text') {
      content = joined ? `${content}\n\n${block.text}` : block.text
      joined = true
      continue
    }
    if (block.type === 'thinking') {
      // 续写保留本轮思考，历史轮次的思考省略。
      if (prefix && thinking && block.thinking.trim()) {
        reasoning += block.thinking
      }
      continue
    }
    if (
      block.type !== 'server_tool_use' ||
      block.kind !== 'read_link' ||
      unsignedReadLinks.has(block.id)
    ) {
      continue
    }
    const fetch = fetches.get(block.id)
    if (!fetch || fetch.content.type !== 'web_fetch_result' || !fetch.signature?.trim()) {
      continue
    }
    calls.push({
      index: calls.length,
      id: block.id,
      type: 'deepseek_read_url',
      kind: 'read_link',
      action: { type: 'read_link', url: fetch.content.url },
      status: 'completed',
      page: {
        url: fetch.content.url,
        title: fetch.content.content.title,
        published_at: fetch.content.published_at,
      },
      signature: fetch.signature,
    })
  }

  return {
    role: 'assistant',
    content: content.trim() ? content : '',
    ...(prefix ? { prefix: true } : {}),
    ...(prefix && thinking && reasoning.trim() ? { reasoning_content: reasoning } : {}),
    ...(calls.length > 0
      ? { server_tool_calls: [{ index: 0, calls }] }
      : {}),
  }
}

/** 历史中会进入请求上下文的轮次：提问后紧跟可用回答的才保留 */
export const getContextRounds = (history: Message[]): [UserMessage, AssistantMessage][] => {
  const rounds: [UserMessage, AssistantMessage][] = []
  for (let i = 0; i + 1 < history.length; i++) {
    const [user, reply] = [history[i], history[i + 1]]
    if (user.role === 'user' && isUsableReply(reply)) {
      rounds.push([user, reply])
      i++
    }
  }
  return rounds
}

/**
 * 粗估一段文本的 token 数：中文按 1 字 1 token，其余按 4 字符 1 token。
 * 只用于判断上下文是否超窗，不参与计费，错了也只是多丢或少丢几轮。
 */
const estimateTokens = (text: string): number => {
  let tokens = 0
  for (const char of text) {
    // codePointAt 在空串上返回 undefined，迭代出来的字符不会为空，缺省按 0 处理
    tokens += (char.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.25
  }
  return Math.ceil(tokens)
}

/** 一条请求消息的粗略 token 数：正文 + 附件按固定开销计 */
const estimateMessageTokens = (message: ChatMessageParam): number => {
  const content = message.content
  if (typeof content === 'string') {
    return estimateTokens(content)
  }
  // 内容块：文本块按字算，文件与图片块给一个固定的经验开销
  return content.reduce(
    (sum, part) => sum + (part.type === 'text' ? estimateTokens(part.text) : 1200),
    0
  )
}

/**
 * 如果超出上下文窗口，从最早的轮次开始丢，直到放得下。
 * 至少保留最近一轮——全丢光等于没带历史，反而更难答对。
 * `contextWindow` 未声明时原样返回，不猜。
 */
const trimRounds = (
  rounds: [UserMessage, AssistantMessage][],
  contextWindow: number | undefined,
  fixedTokens: number
): [UserMessage, AssistantMessage][] => {
  if (contextWindow === undefined) {
    return rounds
  }
  const cost = (round: [UserMessage, AssistantMessage]) =>
    estimateMessageTokens(toUserParam(round[0])) + estimateMessageTokens(toAssistantParam(round[1]))
  let total = fixedTokens + rounds.reduce((sum, round) => sum + cost(round), 0)
  let start = 0
  while (total > contextWindow && start < rounds.length - 1) {
    total -= cost(rounds[start])
    start++
  }
  return rounds.slice(start)
}

/**
 * 把会话转成请求的 messages：系统提示词在最前，其后只保留「提问 + 有回答的回复」成对的轮次，
 * 最后接上本轮提问。失败或没有回答的轮次不进上下文。续写时末尾再带上本轮 assistant。
 *
 * `deepseek` 为 false（自定义的第三方端点）时不插入 latest_reminder：
 * 那是 DeepSeek 的扩展角色，标准 OpenAI 兼容端点会直接拒绝。
 *
 * `contextWindow` 声明了窗口大小后，历史按粗略 token 估算从最早的轮次开始裁剪。
 */
export const toRequestMessages = (
  history: Message[],
  question: UserMessage,
  prefix?: AssistantMessage,
  thinking = prefix?.thinking ?? false,
  latestReminder?: string,
  deepseek = true,
  contextWindow?: number
): ChatMessageParam[] => {
  const system: ChatMessageParam = { role: 'system', content: buildSystemPrompt() }
  // 系统提示词、本轮提问与 latest_reminder 是必须保留的固定开销
  const fixedTokens =
    estimateMessageTokens(system) +
    estimateMessageTokens(toUserParam(question)) +
    (latestReminder ? estimateTokens(latestReminder) : 0)
  const rounds = trimRounds(getContextRounds(history), contextWindow, fixedTokens)
  const messages: ChatMessageParam[] = [system]
  let previousReminder: string | undefined
  const appendReminder = (reminder: string | undefined) => {
    // 仅在当前分支首次出现或内容变化时插入快照；缺少快照的消息保持原有内容。
    if (deepseek && reminder && reminder !== previousReminder) {
      messages.push({ role: 'latest_reminder', content: reminder })
      previousReminder = reminder
    }
  }
  for (const [user, reply] of rounds) {
    // 历史提问没有文字、附件也都没有 serverId 时，提问为空，连同回答一起省略。
    if (!user.content && toFileParts(user.files).length === 0) {
      continue
    }
    appendReminder(reply.latestReminder)
    messages.push(toUserParam(user), toAssistantParam(reply))
  }
  appendReminder(latestReminder)
  messages.push(toUserParam(question))
  if (prefix?.prefix) {
    const assistant = toAssistantParam(prefix, true, thinking)
    // 没有非空白正文或有效思考时直接重发原问题，避免服务端拒绝空 Prefill。
    if (assistant.content.trim() || assistant.reasoning_content?.trim()) {
      messages.push(assistant)
    }
  }
  return messages
}

/** 思考用时（秒），至少 1 秒 */
export const getThinkingSeconds = (startedAt: number, endedAt: number) =>
  Math.max(1, Math.round((endedAt - startedAt) / 1000))
