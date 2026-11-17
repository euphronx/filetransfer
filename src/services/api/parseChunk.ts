import type {
  ChatChoice,
  ChatChunk,
  ChatDelta,
  ChatFinishReason,
  ChatServerToolEvent,
  ChatSource,
  ChatToolAction,
  ChatToolCall,
  ChatToolKind,
  ChatToolName,
  ChatToolStep,
  ChatUrlCitation,
  ChatUsage,
} from './types.js'

/**
 * 流式 chunk 的解析：只做「能否安全消费」的校验，合法但未识别的字段原样保留，
 * 无法识别的结构直接丢弃，不影响后续有效内容与正常结束。
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown) => value == null || isString(value)
/** 引用下标：非负整数；声明成类型谓词，调用处才能直接比较与赋值 */
const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const TOOL_KINDS: ChatToolKind[] = [
  'search',
  'deep_search',
  'read_link',
  'image_search',
  'deep_image_search',
]

const TOOL_NAMES: ChatToolName[] = ['deepseek_web_search', 'deepseek_read_url']

const FINISH_REASONS: ChatFinishReason[] = [
  'stop',
  'length',
  'content_filter',
  'tool_calls',
  'insufficient_system_resource',
  'aborted',
]

const readAction = (value: unknown): ChatToolAction | null => {
  if (!isRecord(value)) {
    return null
  }
  switch (value.type) {
    case 'search':
      // 图搜没有查询词，queries 为空数组
      return Array.isArray(value.queries) && value.queries.every(isString)
        ? { type: 'search', queries: value.queries }
        : null
    case 'open_page':
      return isString(value.url) ? { type: 'open_page', url: value.url } : null
    case 'read_link':
      return isString(value.url) ? { type: 'read_link', url: value.url } : null
    case 'find_in_page':
      return isString(value.url) && isString(value.pattern)
        ? { type: 'find_in_page', url: value.url, pattern: value.pattern }
        : null
    default:
      return null
  }
}

/** 搜索结果的展示字段：url 与 title 必须有，其余缺省即缺省 */
const readSource = (value: unknown): ChatSource | null =>
  isRecord(value) && isString(value.url) && isString(value.title)
    ? {
        type: 'url',
        url: value.url,
        title: value.title,
        ...(isNullableString(value.snippet) ? { snippet: value.snippet as string | null } : {}),
        ...(isNullableString(value.site_name)
          ? { site_name: value.site_name as string | null }
          : {}),
        ...(isNullableString(value.site_icon)
          ? { site_icon: value.site_icon as string | null }
          : {}),
        ...(isNullableString(value.published_at)
          ? { published_at: value.published_at as string | null }
          : {}),
        ...(isNullableString(value.image_url)
          ? { image_url: value.image_url as string | null }
          : {}),
      }
    : null

const readCall = (value: unknown): ChatToolCall | null => {
  if (
    !isRecord(value) ||
    !isIndex(value.index) ||
    !isString(value.id) ||
    !TOOL_NAMES.includes(value.type as ChatToolName) ||
    !TOOL_KINDS.includes(value.kind as ChatToolKind)
  ) {
    return null
  }
  const action = readAction(value.action)
  if (!action) {
    return null
  }
  // call_started 不带 status，其余事件与末块带 completed / failed
  const status =
    value.status === 'completed' || value.status === 'failed' ? value.status : 'in_progress'
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((item) => {
        const source = readSource(item)
        return source ? [source] : []
      })
    : undefined
  const page = isRecord(value.page) && isString(value.page.url)
    ? {
        url: value.page.url,
        title: isNullableString(value.page.title) ? (value.page.title as string | null) : null,
        published_at: isNullableString(value.page.published_at)
          ? (value.page.published_at as string | null)
          : null,
      }
    : undefined
  const error =
    isRecord(value.error) && isString(value.error.code) ? { code: value.error.code } : undefined
  return {
    index: value.index as number,
    id: value.id,
    type: value.type as ChatToolName,
    kind: value.kind as ChatToolKind,
    action,
    status,
    ...(sources ? { sources } : {}),
    ...(page ? { page } : {}),
    ...(isString(value.signature) ? { signature: value.signature } : {}),
    ...(error ? { error } : {}),
  }
}

const readStep = (value: unknown): ChatToolStep | null => {
  if (!isRecord(value) || !isIndex(value.index) || !Array.isArray(value.calls)) {
    return null
  }
  return {
    index: value.index as number,
    ...(isString(value.reasoning_content)
      ? { reasoning_content: value.reasoning_content }
      : {}),
    calls: value.calls.flatMap((item) => {
      const call = readCall(item)
      return call ? [call] : []
    }),
  }
}

const readAnnotation = (value: unknown): ChatUrlCitation | null => {
  if (!isRecord(value) || value.type !== 'url_citation' || !isRecord(value.url_citation)) {
    return null
  }
  const { url, title, start_index: start, end_index: end } = value.url_citation
  return isString(url) && isIndex(start) && isIndex(end) && end > start
    ? {
        type: 'url_citation',
        url_citation: {
          url,
          title: isString(title) ? title : url,
          start_index: start,
          end_index: end,
        },
      }
    : null
}

const readServerToolEvent = (value: unknown): ChatServerToolEvent | null => {
  if (!isRecord(value) || !isIndex(value.step)) {
    return null
  }
  const step = value.step as number
  if (value.type === 'step_reasoning_done') {
    return { type: 'step_reasoning_done', step }
  }
  if (value.type !== 'call_started' && value.type !== 'call_completed') {
    return null
  }
  const call = readCall(value.call)
  return call ? { type: value.type, step, call } : null
}

const readDelta = (value: unknown): ChatDelta | null => {
  if (!isRecord(value)) {
    return null
  }
  const delta: ChatDelta = {}
  if (isNullableString(value.content)) {
    delta.content = value.content as string | null
  }
  if (isNullableString(value.reasoning_content)) {
    delta.reasoning_content = value.reasoning_content as string | null
  }
  if (isString(value.title)) {
    delta.title = value.title
  }
  if (isString(value.refusal)) {
    delta.refusal = value.refusal
  }
  if (Array.isArray(value.annotations)) {
    delta.annotations = value.annotations.flatMap((item) => {
      const annotation = readAnnotation(item)
      return annotation ? [annotation] : []
    })
  }
  if (Array.isArray(value.server_tool_calls)) {
    delta.server_tool_calls = value.server_tool_calls.flatMap((item) => {
      const step = readStep(item)
      return step ? [step] : []
    })
  }
  return delta
}

const isUsage = (value: unknown): value is ChatUsage =>
  isRecord(value) &&
  ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens'].every(
    (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
  )

const readChoice = (value: unknown): ChatChoice | null => {
  if (!isRecord(value) || !isIndex(value.index)) {
    return null
  }
  const delta = readDelta(value.delta)
  if (!delta) {
    return null
  }
  const finish = value.finish_reason
  const serverToolEvent = readServerToolEvent(value.server_tool_event)
  return {
    index: value.index as number,
    delta,
    finish_reason:
      finish === null || finish === undefined
        ? null
        : FINISH_REASONS.includes(finish as ChatFinishReason)
          ? (finish as ChatFinishReason)
          : null,
    ...(serverToolEvent ? { server_tool_event: serverToolEvent } : {}),
  }
}

/** 无法识别的 chunk 返回 null；choices 为空的 chunk（如仅带 usage 的末块）保留 */
export const readChatChunk = (value: unknown): ChatChunk | null => {
  if (!isRecord(value) || value.object !== 'chat.completion.chunk') {
    return null
  }
  if (!Array.isArray(value.choices)) {
    return null
  }
  return {
    id: isString(value.id) ? value.id : '',
    object: 'chat.completion.chunk',
    created: typeof value.created === 'number' ? value.created : 0,
    model: isString(value.model) ? value.model : '',
    choices: value.choices.flatMap((item) => {
      const choice = readChoice(item)
      return choice ? [choice] : []
    }),
    usage: isUsage(value.usage) ? value.usage : undefined,
  }
}
