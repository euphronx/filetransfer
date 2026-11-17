import type {
  ChatSource,
  ChatToolAction,
  ChatToolCall,
  ServerToolBlock,
  ServerToolInput,
  ServerToolUseBlock,
  WebFetchToolResultBlock,
  WebSearchResult,
  WebSearchToolResultBlock,
} from './types.js'

/**
 * 线上工具调用 → 本地内容块。
 * 界面时间线、来源面板、归档与请求回传都消费本地块，线上结构只在这里出现一次。
 */

/** 线上 action 与本地 input 同名，只差一个 type 字段 */
const toInput = (action: ChatToolAction): ServerToolInput => {
  switch (action.type) {
    case 'search':
      return {
        action: 'search',
        // query 只是单数形式的便利字段，queries 才是权威
        ...(action.queries[0] === undefined ? {} : { query: action.queries[0] }),
        queries: action.queries,
      }
    case 'open_page':
      return { action: 'open_page', url: action.url }
    case 'read_link':
      return { action: 'read_link', url: action.url }
    case 'find_in_page':
      return { action: 'find_in_page', url: action.url, pattern: action.pattern }
  }
}

const toSearchResults = (sources: ChatSource[]): WebSearchResult[] =>
  sources.map((source) => ({
    type: 'web_search_result',
    url: source.url,
    title: source.title,
    ...(source.image_url ? { image_url: source.image_url } : {}),
    snippet: source.snippet ?? '',
    site_icon: source.site_icon ?? null,
    site_name: source.site_name ?? null,
    // 搜索摘要由服务端加密，客户端拿不到明文
    encrypted_content: '',
    page_age: source.published_at ?? null,
  }))

const SEARCH_KINDS: WebSearchToolResultBlock['kind'][] = [
  'search',
  'deep_search',
  'image_search',
  'deep_image_search',
]

/** 调用块与其结果块；进行中的调用只有调用块，失败的调用产出错误结果块 */
export const toBlocks = (call: ChatToolCall): ServerToolBlock[] => {
  const useBlock: ServerToolUseBlock = {
    type: 'server_tool_use',
    id: call.id,
    name: call.type,
    input: toInput(call.action),
    caller: { type: 'direct' },
    kind: call.kind,
  }
  // 刚开始的调用还没有结果，界面按「进行中」显示
  if (call.status === 'in_progress') {
    return [useBlock]
  }
  const failed = call.status === 'failed' || call.error !== undefined

  if (SEARCH_KINDS.includes(call.kind as WebSearchToolResultBlock['kind'])) {
    return [
      useBlock,
      {
        type: 'web_search_tool_result',
        tool_use_id: call.id,
        kind: call.kind as WebSearchToolResultBlock['kind'],
        content: failed
          ? [{ type: 'web_search_tool_result_error', error_code: 'unavailable' }]
          : toSearchResults(call.sources ?? []),
      },
    ]
  }

  // 阅读链接与边想边搜打开的页面都用 fetch 结果块
  const fetch: WebFetchToolResultBlock = {
    type: 'web_fetch_tool_result',
    tool_use_id: call.id,
    kind: call.kind === 'read_link' ? 'read_link' : 'deep_search',
    content:
      failed || !call.page
        ? { type: 'web_fetch_tool_result_error', error_code: 'unavailable' }
        : {
            type: 'web_fetch_result',
            url: call.page.url,
            content: {
              type: 'document',
              // 页面正文由服务端加密在 signature 中，客户端只有空串
              source: { type: 'text', media_type: 'text/plain', data: '' },
              title: call.page.title,
            },
            published_at: call.page.published_at,
          },
    ...(call.signature ? { signature: call.signature } : {}),
  }
  return [useBlock, fetch]
}

/** 本地块 → 线上调用参数，只回传 read_link：其余块服务端不需要，且会撑大上下文 */
export const toReadLinkParam = (call: {
  id: string
  index: number
  page: { url: string; title: string | null; published_at: string | null }
  signature: string
}) => ({
  index: call.index,
  id: call.id,
  type: 'deepseek_read_url' as const,
  kind: 'read_link' as const,
  action: { type: 'read_link' as const, url: call.page.url },
  status: 'completed' as const,
  page: call.page,
  signature: call.signature,
})
