import { translate, type TranslationMessage } from '../../i18n/index.js'
import { getApiBaseUrl } from '../settings.js'
import { readChatChunk } from './parseChunk.js'
import { readServerSentEvents } from './sse.js'
import type { ApiErrorBody, ChatChunk, ChatRequest, FileObject, FilePurpose } from './types.js'

/** 构建期注入的默认 API 地址；实际请求地址由设置里的端点决定 */
export const API_ORIGIN = __API_ORIGIN__

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 finish_reason 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

/** 对话与文件接口统一使用 Bearer 鉴权 */
const authHeaders = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
})

/**
 * 用 GET /models 校验 API Key（不产生费用）。
 *
 * `baseUrl` 用于校验尚未保存的地址：设置页里改完地址还没保存就要验 Key，
 * 否则会拿旧地址去验，改完地址的用户会看到莫名其妙的失败。
 * 传空串按未声明处理，回落到当前生效的地址。
 */
export const verifyApiKey = async (
  apiKey: string,
  signal?: AbortSignal,
  baseUrl?: string
): Promise<void> => {
  const origin = baseUrl?.trim() || getApiBaseUrl()
  await request(`${origin}/models`, {
    method: 'GET',
    headers: authHeaders(apiKey),
    signal,
  })
}

/**
 * POST /files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 必填，且必须排在 file 之前；顺序颠倒服务端会拒绝。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  form.append('purpose', purpose)
  form.append('file', file)
  const response = await request(`${getApiBaseUrl()}/files`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  await request(`${getApiBaseUrl()}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: authHeaders(apiKey),
  })
}

/**
 * POST /chat/completions，续写时用 /beta/chat/completions，逐个产出流式 chunk。
 * 地址取当前配置的端点，因此可以指向任何 OpenAI 兼容服务。
 * 以 `data: [DONE]` 结束；保活注释、无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamChat(
  apiKey: string,
  body: ChatRequest,
  signal: AbortSignal,
  /** 末尾 assistant 带 prefix 时服务端只接受 beta 端点 */
  beta = false
): AsyncGenerator<ChatChunk> {
  const base = getApiBaseUrl()
  const response = await request(`${beta ? `${base}/beta` : base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...authHeaders(apiKey),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  let finished = false
  for await (const { data } of readServerSentEvents(response.body, signal)) {
    // OpenAI 兼容流以 [DONE] 结尾；没有它说明本次生成被中断
    if (data.trim() === '[DONE]') {
      finished = true
      return
    }
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    // 生成中途失败：错误帧带 usage，且没有 choices
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    const chunk = readChatChunk(payload)
    if (!chunk) {
      continue
    }
    yield chunk
    if (chunk.choices.some((choice) => choice.finish_reason !== null)) {
      finished = true
    }
  }
  if (finished) {
    return
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
