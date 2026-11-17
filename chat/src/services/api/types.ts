/**
 * 线上协议：OpenAI 兼容的 Chat Completions 接口，外加 DeepSeek 的搜索、审核与标题扩展。
 * 文档：https://api-docs.deepseek.com/api/create-chat-completion
 *
 * 文件分两部分：
 * 1. 线上协议（请求、流式块、工具调用、文件对象）——只在这里声明一次；
 * 2. 本地内容块（TextBlock / ThinkingBlock / ServerToolBlock 等）——界面时间线、
 *    来源面板与归档读写都建立在它上面，与线上协议解耦，由 toolCalls.ts 转换。
 */

export type ChatModel = 'deepseek-flash' | 'deepseek-v4-pro'

/** 推理强度；不同端点的支持范围不同，不支持的会被忽略 */
export type ReasoningEffort = 'low' | 'high' | 'max'

// ======================================================================
// 线上协议
// ======================================================================

// ---------- 请求 ----------

/** 文本片段 */
export type ChatPartText = { type: 'text'; text: string }

/** 图片片段：http(s) 链接或 data URL；经 Files API 上传的图片改用 file 片段 */
export type ChatPartImage = {
  type: 'image_url'
  image_url: { url: string; detail?: 'low' | 'high' | 'original' | 'auto' }
}

/** 文件片段：引用经 Files API 上传的文件，图片与文档都用它 */
export type ChatPartFile = { type: 'file'; file_id: string; filename?: string }

export type ChatPart = ChatPartText | ChatPartImage | ChatPartFile

/** 一次工具调用；流式进度事件里的 call_completed 不带 signature */
export type ChatToolCall = {
  index: number
  id: string
  /** 声明该能力的工具 */
  type: ChatToolName
  kind: ChatToolKind
  action: ChatToolAction
  /** call_started 事件不带状态，按 in_progress 处理 */
  status: 'in_progress' | 'completed' | 'failed'
  /** 搜索召回的结果 */
  sources?: ChatSource[]
  /** 打开或阅读过的页面 */
  page?: ChatPage
  /** 仅成功阅读的链接返回，回传时原样带上 */
  signature?: string
  error?: ChatToolCallError
}

/** 回传历史时只保留必要字段 */
export type ChatToolCallParam = {
  index: number
  id: string
  type: ChatToolName
  kind: ChatToolKind
  action: ChatToolAction
  status: 'completed' | 'failed'
  page?: ChatPage
  signature?: string
}

/** 一步（一段思考）及其发出的调用 */
export type ChatToolStep = {
  index: number
  reasoning_content?: string
  calls: ChatToolCall[]
}

export type ChatServerToolCallsParam = {
  index: number
  reasoning_content?: string
  calls: ChatToolCallParam[]
}

export type ChatMessageParam =
  /** 系统提示词 */
  | { role: 'system'; content: string }
  /** DeepSeek 扩展角色，必须紧邻它所属的 user 消息之前 */
  | { role: 'latest_reminder'; content: string }
  | { role: 'user'; content: string | ChatPart[] }
  | {
      role: 'assistant'
      content: string
      /** 续写时置 true，必须走 /beta 端点 */
      prefix?: boolean
      /** 续写的思考前缀，与 prefix 一起使用 */
      reasoning_content?: string
      server_tool_calls?: ChatServerToolCallsParam[]
    }

/** 联网搜索（含边想边搜与以图搜图） */
export type ChatWebSearchTool = { type: 'deepseek_web_search' }

/** 阅读本轮用户消息中的链接，与搜索工具独立声明 */
export type ChatReadUrlTool = { type: 'deepseek_read_url' }

export type ChatTool = ChatWebSearchTool | ChatReadUrlTool

export type ChatRequest = {
  /** 模型标识；接第三方兼容端点时可以是任意字符串 */
  model: string
  messages: ChatMessageParam[]
  thinking?: { type: 'enabled' | 'disabled' }
  /** 推理强度；端点不支持时会被服务端忽略 */
  reasoning_effort?: ReasoningEffort
  tools?: ChatTool[]
  tool_choice?: 'none' | 'auto'
  safety_check?: { level: 'low' | 'high' }
  title?: { enabled: boolean }
  max_tokens?: number
  stream?: boolean
}

// ---------- 响应：工具调用 ----------

/** 识别调用所属联网能力，区分文字搜索、图搜及边想边搜 */
export type ChatToolKind =
  | 'search'
  | 'deep_search'
  | 'read_link'
  | 'image_search'
  | 'deep_image_search'

/** 声明该能力的工具名 */
export type ChatToolName = 'deepseek_web_search' | 'deepseek_read_url'

/** 四种动作，参数结构由 type 决定 */
export type ChatToolAction =
  | { type: 'search'; queries: string[] }
  | { type: 'open_page'; url: string }
  | { type: 'find_in_page'; url: string; pattern: string }
  | { type: 'read_link'; url: string }

/** 搜索结果的展示字段；图搜结果另有 image_url */
export type ChatSource = {
  type: 'url'
  url: string
  title: string
  snippet?: string | null
  site_name?: string | null
  site_icon?: string | null
  published_at?: string | null
  /** 图搜召回的原站图片地址，可能缺省且不保证可访问 */
  image_url?: string | null
}

/** 打开或阅读过的页面 */
export type ChatPage = {
  url: string
  title: string | null
  published_at: string | null
}

export type ChatToolCallError = { code: string }

/** 流式进度事件，位于 choice 上、与 delta 平级，每个 chunk 最多一个 */
export type ChatServerToolEvent =
  | { type: 'step_reasoning_done'; step: number }
  | { type: 'call_started'; step: number; call: ChatToolCall }
  | { type: 'call_completed'; step: number; call: ChatToolCall }

// ---------- 响应：引用 ----------

/** 正文引用的位置；start_index / end_index 按 Unicode 码点计 */
export type ChatUrlCitation = {
  type: 'url_citation'
  url_citation: {
    url: string
    /** 查不到标题时为 URL 本身 */
    title: string
    start_index: number
    end_index: number
  }
}

export type ChatAnnotation = ChatUrlCitation

// ---------- 响应：流式块 ----------

export type ChatFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'insufficient_system_resource'
  | 'aborted'

export type ChatDelta = {
  role?: 'assistant'
  content?: string | null
  reasoning_content?: string | null
  /** 整轮结束时一次性下发，流式期间不出现 */
  annotations?: ChatAnnotation[]
  /** 整轮结束时一次性下发 */
  server_tool_calls?: ChatToolStep[]
  /** 开启 title 时在最后一个 chunk 出现 */
  title?: string
  /** 图片未通过审核时点名被拦截的图片 */
  refusal?: string
}

export type ChatChoice = {
  index: number
  delta: ChatDelta
  server_tool_event?: ChatServerToolEvent
  finish_reason: ChatFinishReason | null
}

export type ChatChunk = {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: ChatChoice[]
  usage?: ChatUsage | null
}

/** 用量：服务端在最后一个 chunk 给出整轮合计 */
export type ChatUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number; safety_tokens?: number }
  /** 计费的搜索、抓取与图搜次数 */
  server_tool_use?: { tool_search?: number; tool_fetch?: number; tool_image_search?: number }
}

// ---------- 本地内容块 ----------
// 回复按接收顺序保存为这些块：界面时间线、来源面板与归档都从这里推导。
// 它们不是线上协议，回传请求时由 reply.ts 重新组装成 ChatMessageParam。

/** 正文引用：服务端把模型的引用标记还原为来源，挂在对应文本块上 */
export type TextCitation = {
  type: 'web_search_result_location'
  url: string
  /** 查不到标题时为 null */
  title: string | null
  /** 当前文本块截至该引用处的全部正文（去除首尾空白） */
  cited_text: string
  /** 恒为空串 */
  encrypted_index: string
}

/** 文本块：挂过引用的块之后，后续正文另起新块；同一块内引用按 url 去重 */
export type TextBlock = { type: 'text'; text: string; citations?: TextCitation[] }

/** 思考块：签名在块结束前随 chunk 下发，值为本次响应的消息 id */
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature: string }

/** 服务端识别调用所属联网能力用的 kind，区分文字搜索、图搜及边想边搜。 */
export type ServerToolKind =
  | 'search'
  | 'deep_search'
  | 'read_link'
  | 'image_search'
  | 'deep_image_search'

/** server_tool_use 的四种动作，input 结构由 action 决定 */
export type ServerToolInput =
  | { action: 'search'; query?: string; queries: string[] }
  | { action: 'open_page'; url: string }
  /** 找不到关联页面时 url 为空串 */
  | { action: 'find_in_page'; url: string; pattern: string }
  | { action: 'read_link'; url: string }

/** 服务端工具调用块：原子下发，末块一次给出完整 input */
export type ServerToolUseBlock = {
  type: 'server_tool_use'
  /** srvtoolu_{s|ds|rl|is|dis}_{序号}_{32 位 hex} */
  id: string
  /** 文字搜索与图搜均为 deepseek_web_search；read_link 为 deepseek_read_url */
  name: 'deepseek_web_search' | 'deepseek_read_url'
  input: ServerToolInput
  caller: { type: 'direct' }
  kind: ServerToolKind
}

export type WebSearchResult = {
  type: 'web_search_result'
  title: string
  url: string
  /** 图搜召回的原站图片地址，可能缺省；仅保存，当前不展示图片。 */
  image_url?: string
  /** 可直接展示的网页摘要 */
  snippet: string
  /** 站点图标 URL；无法取得注册域名时为 null */
  site_icon: string | null
  /** 无站点名称时为 null */
  site_name: string | null
  /** 搜索摘要经 AES-256-GCM 加密后的 Base64，客户端无法解密展示 */
  encrypted_content: string
  /** RFC 3339 UTC 时间，没有发布时间时为 null */
  page_age: string | null
}

export type WebSearchToolResultError = {
  type: 'web_search_tool_result_error'
  error_code: 'unavailable'
}

export type WebSearchToolResultBlock = {
  type: 'web_search_tool_result'
  tool_use_id: string
  /** 成功且无可见结果时为 []；失败时为只含一个错误项的数组 */
  content: (WebSearchResult | WebSearchToolResultError)[]
  kind: 'search' | 'deep_search' | 'image_search' | 'deep_image_search'
}

export type WebFetchResult = {
  type: 'web_fetch_result'
  url: string
  content: {
    type: 'document'
    /** read_link / deep_search 均为空串；阅读链接的页面加密在结果块的 signature 中 */
    source: { type: 'text'; media_type: 'text/plain'; data: string }
    title: string | null
  }
  /** read_link 为网页解析出的原始日期字符串；deep_search 为 RFC 3339 */
  published_at: string | null
}

export type WebFetchToolResultError = {
  type: 'web_fetch_tool_result_error'
  /** url_not_accessible 抓取失败；url_not_allowed 被拦截；unavailable 服务异常或未完成就结束 */
  error_code: 'url_not_accessible' | 'url_not_allowed' | 'unavailable'
}

export type WebFetchToolResultBlock = {
  type: 'web_fetch_tool_result'
  tool_use_id: string
  content: WebFetchResult | WebFetchToolResultError
  kind: 'read_link' | 'deep_search'
  /** 仅 read_link 成功时返回的加密页面，多轮请求原样回传；失败及 deep_search 不返回 */
  signature?: string
}

export type ServerToolBlock =
  | ServerToolUseBlock
  | WebSearchToolResultBlock
  | WebFetchToolResultBlock

// ---------- 本地：结束原因、用量、文件 ----------

export type StopReason = 'end_turn' | 'max_tokens' | 'tool_use' | 'refusal'

export type StopDetails = { type: 'refusal'; category: null; explanation: null }

/** 由 ChatUsage 映射而来；字段名保持不变以兼容归档与用量展示 */
export type MessageUsage = {
  /** 未命中缓存的输入 Token */
  input_tokens: number
  /** 服务端不返回缓存创建量，恒为 0 */
  cache_creation_input_tokens: number
  /** 命中上下文缓存的输入 Token */
  cache_read_input_tokens: number
  /** 整轮累计的输出 Token */
  output_tokens: number
  /** 计费的搜索与抓取次数 */
  server_tool_use?: { web_search_requests: number; tool_search: number }
}

/** 本地回复里的内容块，界面与归档共用 */
export type OutputBlockStart = TextBlock | ThinkingBlock | ServerToolBlock

/**
 * POST /files 的 purpose：PDF 与 Word、PPT 需要服务端做版面解析；
 * 图片与纯文本、代码、表格、电子书用 user_data。OpenAI 兼容端该字段必填。
 */
export type FilePurpose = 'rich_layout_recognition' | 'user_data'

/** POST /files 的响应（OpenAI 兼容形态） */
export type FileObject = {
  id: string
  object: 'file'
  /** 文件字节数 */
  bytes: number
  /** Unix 秒 */
  created_at: number
  filename: string
  purpose: FilePurpose
}

/** 非 2xx 响应体；流中出现只含 error 的帧时同样按此解析 */
export type ApiErrorBody = {
  error: {
    message: string
    type?: string
    param?: string | null
    code?: string | null
  }
}
