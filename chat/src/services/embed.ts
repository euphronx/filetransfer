/** 嵌入 filetransfer 时使用的运行时配置。地址和站点 JWT 不写进构建产物。 */

const CONFIG_URL = '/deepseek/config/'
const AUTH_URL = '/auth/'

let fcEndpoint = ''
let siteJwt = ''
let loading: Promise<void> | undefined

export const getSiteJwt = (): string => siteJwt

/** 函数计算反代根地址，不含具体接口路径。配置还没读到时为空。 */
export const getProxyBaseUrl = (): string => {
  const base = fcEndpoint.trim().replace(/\/$/, '')
  return base ? `${base}/chat` : ''
}

const readJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return response.json()
}

const load = async () => {
  const config = await readJson(CONFIG_URL)
  fcEndpoint =
    typeof config === 'object' &&
    config !== null &&
    'fcEndpoint' in config &&
    typeof config.fcEndpoint === 'string'
      ? config.fcEndpoint
      : ''
  const auth = await readJson(AUTH_URL)
  siteJwt =
    typeof auth === 'object' && auth !== null && 'jwtToken' in auth && typeof auth.jwtToken === 'string'
      ? auth.jwtToken
      : ''
}

/** 读取函数计算地址和站点 JWT。失败后下次调用会再试。 */
export const ensureEmbed = (): Promise<void> => {
  loading ??= load().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
