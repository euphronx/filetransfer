import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 推理强度，对应 Chat Completions 的 reasoning_effort */
export type ReasoningEffort = 'low' | 'high' | 'max'

/**
 * 模型接受的输入类型。
 * `undefined` 表示未声明（按文本处理），数组里没有 'image' 就是明确不支持图片。
 * 与 DSH 的 `inputModalities` 同一套语义：未声明 = 未知，显式缺席 = 负能力。
 */
export type ModelModality = 'text' | 'image'

/**
 * 一个模型。`id` 是发给 API 的模型标识，`name` 只用于显示。
 *
 * 能力字段与 DSH 的 `PiAiModelProfile` 同构：模型上声明的覆盖 provider 默认值，
 * 未声明则继承 provider 级默认。
 */
export type ModelProfile = {
  /** 模型标识，如 deepseek-flash */
  id: string
  /** 显示名，如 DeepSeek-V4-Flash */
  name: string
  /** 请求+回复合计的上下文窗口（token）；未声明时继承 provider 默认 */
  contextWindow?: number
  /** 单次回复的最大输出 token 数；未声明时继承 provider 默认 */
  maxTokens?: number
  /** 输入模态；未声明时继承 provider 默认 */
  inputModalities?: ModelModality[]
  /**
   * 该模型支持的推理强度，按由弱到强排列；空表示不支持深度思考。
   * 用数组而不是布尔：有的模型只提供其中几档，整数索引会错位。
   */
  reasoningEfforts?: ReasoningEffort[]
}

/**
 * 一个模型供应商：端点 + 凭据 + 输入模态默认值，下挂一组模型。
 *
 * 与 DSH 的 provider → models 结构一致：凭据、地址和输入模态默认值属于 provider；
 * **容量（上下文窗口、输出上限）属于模型**，不在这里设。
 */
export type ModelProvider = {
  id: string
  /** 显示名，如「DeepSeek 官方」 */
  name: string
  /** API 根地址，不含 /chat/completions；留空用构建期默认地址 */
  baseUrl: string
  apiKey: string
  /** provider 级默认输入模态：模型没声明时用它 */
  defaultInputModalities?: ModelModality[]
  /** 该 provider 下可选的模型；至少一个 */
  models: ModelProfile[]
}

/** 全部推理强度，由弱到强 */
export const ALL_EFFORTS: ReasoningEffort[] = ['low', 'high', 'max']

/** 内置 provider：DeepSeek 官方，开箱即用 */
export const DEFAULT_PROVIDER: ModelProvider = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: '',
  apiKey: '',
  // DeepSeek 官方模型都能看图，这里给 provider 级默认，模型不必逐个声明
  defaultInputModalities: ['text', 'image'],
  models: [
    {
      id: 'deepseek-flash',
      name: 'DeepSeek-V4-Flash',
      // 与官方模型卡一致：1M 上下文，单次最多 384K 输出
      contextWindow: 1_048_576,
      maxTokens: 393_216,
      inputModalities: ['text', 'image'],
      reasoningEfforts: ALL_EFFORTS,
    },
  ],
}

/** 当前选中的模型：provider + 模型标识 */
export type ModelSelection = {
  providerId: string
  modelId: string
}

/** 本机设置，存 localStorage */
type Settings = {
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 已配置的模型供应商；至少有一个 */
  providers: ModelProvider[]
  /** 当前用于对话的供应商 id */
  activeProviderId: string
  /** 当前用于对话的模型标识 */
  activeModelId: string
  /** 推理强度 */
  effort: ReasoningEffort
}

/** 存储键前缀 */
const PREFIX = 'chat:'
/** 旧前缀，仅用于一次性搬迁 */
const LEGACY_PREFIX = 'chat-demo:'

const KEYS = {
  /** 更早的版本只存单个 Key，仅用于迁移 */
  legacyApiKey: 'chat:api-key',
  locale: 'chat:locale',
  location: 'chat:location',
  themePreference: 'chat:theme-preference',
  ttsVoice: 'chat:tts-voice',
  thinking: 'chat:thinking',
  search: 'chat:search',
  siderCollapsed: 'chat:sider-collapsed',
  /** 扁平端点列表，仅用于迁移到 provider 结构 */
  legacyEndpoints: 'chat:endpoints',
  /** 扁平结构时期记录的当前端点，仅用于迁移 */
  legacyActiveEndpoint: 'chat:active-endpoint',
  providers: 'chat:providers',
  activeProviderId: 'chat:active-provider',
  activeModelId: 'chat:active-model',
  effort: 'chat:effort',
} as const

/**
 * 把 `chat-demo:` 前缀的旧键搬到 `chat:`，然后删掉旧键。
 * 只搬目标键不存在的情况，避免覆盖用户在新版本里的改动。
 */
const migrateLegacyKeys = () => {
  try {
    const stale: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(LEGACY_PREFIX)) {
        stale.push(key)
      }
    }
    for (const key of stale) {
      const next = PREFIX + key.slice(LEGACY_PREFIX.length)
      const value = localStorage.getItem(key)
      if (value !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, value)
      }
      localStorage.removeItem(key)
    }
  } catch {
    // 存储不可用时保持内存态
  }
}

// 读取任何设置之前先搬迁旧前缀，之后所有读写都走新键
migrateLegacyKeys()

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/** 校验模态数组；非法值一律丢弃，读出来只有 'text' / 'image' */
const readModalities = (value: unknown): ModelModality[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const list = value.filter((item): item is ModelModality => item === 'text' || item === 'image')
  return list.length > 0 ? list : undefined
}

/** 读取正整数能力值；非法或非正数一律视为未声明 */
const readPositiveInt = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

/** 读取推理强度数组；只保留合法值并按由弱到强排序，空数组视为不支持 */
const readEfforts = (value: unknown): ReasoningEffort[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const list = ALL_EFFORTS.filter((effort) => value.includes(effort))
  return list.length > 0 ? list : undefined
}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** 把一个模型收敛成合法值；id 缺失的条目返回 null 由调用方丢弃 */
const normalizeModel = (value: unknown): ModelProfile | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const item = value as Record<string, unknown>
  const id = readString(item.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: readString(item.name) ?? id,
    contextWindow: readPositiveInt(item.contextWindow),
    maxTokens: readPositiveInt(item.maxTokens),
    inputModalities: readModalities(item.inputModalities),
    reasoningEfforts: readEfforts(item.reasoningEfforts),
  }
}

/** 把一个 provider 收敛成合法值；没有可用模型时返回 null */
const normalizeProvider = (value: unknown): ModelProvider | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const item = value as Record<string, unknown>
  const id = readString(item.id)
  if (!id) {
    return null
  }
  const models = Array.isArray(item.models)
    ? item.models.map(normalizeModel).filter((model): model is ModelProfile => model !== null)
    : []
  if (models.length === 0) {
    return null
  }
  return {
    id,
    name: readString(item.name) ?? id,
    baseUrl: readString(item.baseUrl) ?? '',
    apiKey: readString(item.apiKey) ?? '',
    defaultInputModalities: readModalities(item.defaultInputModalities),
    models,
  }
}

/** 把更早的扁平端点结构换算成 provider + 单个模型 */
const migrateLegacyEndpoints = (): ModelProvider[] | null => {
  const raw = read(KEYS.legacyEndpoints)
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return null
    }
    const providers: ModelProvider[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue
      }
      const item = entry as Record<string, unknown>
      const id = readString(item.id)
      const modelId = readString(item.model)
      if (!id || !modelId) {
        continue
      }
      providers.push({
        id,
        name: readString(item.name) ?? id,
        baseUrl: readString(item.baseUrl) ?? '',
        apiKey: readString(item.apiKey) ?? '',
        models: [
          {
            id: modelId,
            // 模型名用模型标识，不用 provider 名：否则同一家几个模型会重名
            name: modelId,
            // 旧结构把能力直接挂在端点上，迁移后原样落到这个模型上
            contextWindow: readPositiveInt(item.contextWindow),
            maxTokens: readPositiveInt(item.maxTokens),
            inputModalities: readModalities(item.inputModalities),
            reasoningEfforts: readEfforts(item.reasoningEfforts),
          },
        ],
      })
    }
    return providers.length > 0 ? providers : null
  } catch {
    return null
  }
}

/** 读取 provider 列表；依次回落到旧版端点结构、旧版单 Key、内置默认 */
const initialProviders = (): ModelProvider[] => {
  try {
    const raw = read(KEYS.providers)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const list = parsed
          .map(normalizeProvider)
          .filter((provider): provider is ModelProvider => provider !== null)
        if (list.length > 0) {
          // 内置 provider 的模型由本文件维护，老存储里缺容量时按官方值补上
          return list.map((provider) =>
            provider.id === DEFAULT_PROVIDER.id
              ? {
                  ...provider,
                  defaultInputModalities:
                    provider.defaultInputModalities ?? DEFAULT_PROVIDER.defaultInputModalities,
                  models: provider.models.map((model) => {
                    const presets = DEFAULT_PROVIDER.models.find((item) => item.id === model.id)
                    return presets
                      ? {
                          ...model,
                          contextWindow: model.contextWindow ?? presets.contextWindow,
                          maxTokens: model.maxTokens ?? presets.maxTokens,
                          inputModalities: model.inputModalities ?? presets.inputModalities,
                          reasoningEfforts: model.reasoningEfforts ?? presets.reasoningEfforts,
                        }
                      : model
                  }),
                }
              : provider
          )
        }
      }
    }
  } catch {
    // 存储损坏时继续往更早的结构回落
  }
  const migrated = migrateLegacyEndpoints()
  if (migrated) {
    return migrated
  }
  // 旧版本只存了一个 Key，把它当成 DeepSeek 官方 provider 的 Key
  return [{ ...DEFAULT_PROVIDER, apiKey: read(KEYS.legacyApiKey) ?? '' }]
}

/**
 * 迁移结果写回新键，之后不再走旧结构。
 * 只在 `providers` 缺失时写一次：否则每次启动都要重新推导，
 * 而且用户改过配置后旧键仍会被反复读。
 */
const persistMigratedProviders = (providers: ModelProvider[], selection: ModelSelection) => {
  if (read(KEYS.providers) !== null) {
    return
  }
  write(KEYS.providers, JSON.stringify(providers))
  write(KEYS.activeProviderId, selection.providerId)
  write(KEYS.activeModelId, selection.modelId)
}

/** 当前选择：优先用新键，其次用旧版的当前端点 id */
const initialSelection = (providers: ModelProvider[]): ModelSelection => {
  const providerId = read(KEYS.activeProviderId) ?? read(KEYS.legacyActiveEndpoint)
  const provider = providers.find((item) => item.id === providerId) ?? providers[0]
  const modelId = read(KEYS.activeModelId)
  const model = provider.models.find((item) => item.id === modelId) ?? provider.models[0]
  return { providerId: provider.id, modelId: model.id }
}

const initialEffort = (): ReasoningEffort => {
  const saved = read(KEYS.effort)
  return saved === 'low' || saved === 'max' ? saved : 'high'
}

const initialProviderList = initialProviders()
const initialActiveSelection = initialSelection(initialProviderList)
persistMigratedProviders(initialProviderList, initialActiveSelection)

export const useSettings = create<Settings>(() => ({
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  providers: initialProviderList,
  activeProviderId: initialActiveSelection.providerId,
  activeModelId: initialActiveSelection.modelId,
  effort: initialEffort(),
}))

/** 当前供应商；列表异常时回落到内置默认值 */
export const getActiveProvider = (): ModelProvider => {
  const { providers, activeProviderId } = useSettings.getState()
  return providers.find((provider) => provider.id === activeProviderId) ?? providers[0] ?? DEFAULT_PROVIDER
}

/** 当前模型；模型被删后回落到该 provider 的第一个模型 */
export const getActiveModelProfile = (): ModelProfile => {
  const provider = getActiveProvider()
  const { activeModelId } = useSettings.getState()
  return provider.models.find((model) => model.id === activeModelId) ?? provider.models[0]
}

/** 当前供应商的 API Key；请求、上传、语音都用它 */
export const getApiKey = (): string => getActiveProvider().apiKey

/** 当前供应商的 API 根地址；留空时用构建期默认值 */
export const getApiBaseUrl = (): string => getActiveProvider().baseUrl.trim() || __API_ORIGIN__

/** 当前模型标识；请求里的 model 字段 */
export const getActiveModel = (): string => getActiveModelProfile().id

/**
 * 是否为 DeepSeek 官方供应商。
 * 只有官方支持这套扩展：联网搜索 / 读链接工具、safety_check、
 * title、latest_reminder 角色、以及 beta 端点的续写。
 * 地址留空（内置默认）或指向 api.deepseek.com 的都算。
 */
export const isDeepSeekProvider = (provider: ModelProvider): boolean => {
  const base = provider.baseUrl.trim().toLowerCase()
  return base === '' || base.includes('api.deepseek.com')
}

/** 当前供应商是否支持 DeepSeek 扩展能力 */
export const activeSupportsExtensions = (): boolean => isDeepSeekProvider(getActiveProvider())

/**
 * 模型是否接受某个输入类型：模型声明优先，其次 provider 默认，最后按仅文本。
 * 都不声明时不能假定能看图，否则传过去只会换回一个 400。
 */
export const modelAccepts = (
  provider: ModelProvider,
  model: ModelProfile | undefined,
  modality: ModelModality
): boolean =>
  (model?.inputModalities ?? provider.defaultInputModalities ?? ['text']).includes(modality)
/** 当前模型是否接受图片输入 */
export const activeAcceptsImage = (): boolean =>
  modelAccepts(getActiveProvider(), getActiveModelProfile(), 'image')

/**
 * 模型支持的推理强度，按由弱到强排列；空表示不支持深度思考。
 * 强度和模态不同，不设 provider 级默认：同一家的模型档位经常不一样，
 * 未声明就按不支持处理，免得把不支持的档位发出去。
 */
export const modelEfforts = (model: ModelProfile | undefined): ReasoningEffort[] =>
  model?.reasoningEfforts ?? []

/** 模型是否支持深度思考 */
export const modelSupportsReasoning = (model: ModelProfile | undefined): boolean =>
  modelEfforts(model).length > 0

/** 当前模型是否支持深度思考 */
export const activeSupportsReasoning = (): boolean =>
  modelSupportsReasoning(getActiveModelProfile())

/**
 * 把任意强度收敛到该模型支持的档位：本身支持就原样用，
 * 否则回落到该模型支持的最强档，避免把不支持的档位发出去。
 */
export const resolveEffort = (
  model: ModelProfile | undefined,
  effort: ReasoningEffort
): ReasoningEffort | undefined => {
  const efforts = modelEfforts(model)
  if (efforts.length === 0) {
    return undefined
  }
  return efforts.includes(effort) ? effort : efforts[efforts.length - 1]
}

/** 当前模型的单次输出上限；未声明时返回 undefined，由服务端决定 */
export const getActiveMaxTokens = (): number | undefined => getActiveModelProfile().maxTokens

/** 当前模型的上下文窗口；未声明时返回 undefined，不裁剪历史 */
export const getActiveContextWindow = (): number | undefined =>
  getActiveModelProfile().contextWindow

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

const persistProviders = (providers: ModelProvider[]) => {
  write(KEYS.providers, JSON.stringify(providers))
  useSettings.setState({ providers })
}

/** 新增或更新一个 provider（按 id 匹配） */
export const saveProvider = (provider: ModelProvider) => {
  const { providers } = useSettings.getState()
  const exists = providers.some((item) => item.id === provider.id)
  persistProviders(
    exists
      ? providers.map((item) => (item.id === provider.id ? provider : item))
      : [...providers, provider]
  )
}

/**
 * 删除 provider。
 * 内置的 DeepSeek 不能删：它的端点、能力和默认值由本文件维护，
 * 删掉之后没有可以回落的官方配置。其余 provider 至少保留一个。
 */
export const removeProvider = (id: string) => {
  if (id === DEFAULT_PROVIDER.id) {
    return
  }
  const { providers, activeProviderId } = useSettings.getState()
  if (providers.length <= 1) {
    return
  }
  const next = providers.filter((provider) => provider.id !== id)
  persistProviders(next)
  if (!next.some((provider) => provider.id === activeProviderId)) {
    setActiveModel(next[0].id, next[0].models[0].id)
  }
}

/** 是否为内置 provider；界面上不提供删除入口 */
export const isBuiltinProvider = (provider: ModelProvider): boolean =>
  provider.id === DEFAULT_PROVIDER.id

/**
 * 切换当前模型。
 * 模型不属于该 provider 时回落到它的第一个模型，避免出现指向不存在模型的组合。
 */
export const setActiveModel = (providerId: string, modelId: string) => {
  const provider = useSettings.getState().providers.find((item) => item.id === providerId)
  const resolvedModelId =
    provider?.models.find((model) => model.id === modelId)?.id ?? provider?.models[0]?.id
  write(KEYS.activeProviderId, providerId)
  write(KEYS.activeModelId, resolvedModelId ?? null)
  useSettings.setState({
    activeProviderId: providerId,
    activeModelId: resolvedModelId ?? '',
  })
}

export const setEffort = (effort: ReasoningEffort) => {
  write(KEYS.effort, effort)
  useSettings.setState({ effort })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
