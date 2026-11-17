/**
 * 服务器 Key 的每日对话次数，按浏览器本地日期计算。不防绕过，只避免正常使用时无限调用。
 * 一次对话是一次补全：发送、重新生成、续写、编辑后重发各算 1 次。
 * 语音识别和朗读不走这里。
 */

export const SERVER_DAILY_LIMIT = 30

const STORAGE_KEY = 'chat:server-quota'

type DayUsage = {
  day: string
  used: number
  /** 这一天的用尽提示已经弹过 */
  alerted: boolean
}

const listeners = new Set<() => void>()
let dialogOpen = false

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

/** 浏览器本地日历日，过了本地零点重新计数。 */
const localDay = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const emptyUsage = (): DayUsage => ({ day: localDay(), used: 0, alerted: false })

const readUsage = (): DayUsage => {
  const today = emptyUsage()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return today
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('day' in parsed) ||
      parsed.day !== today.day ||
      !('used' in parsed) ||
      typeof parsed.used !== 'number'
    ) {
      return today
    }
    return {
      day: today.day,
      used: parsed.used,
      alerted: 'alerted' in parsed && parsed.alerted === true,
    }
  } catch {
    return today
  }
}

const writeUsage = (usage: DayUsage) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch {
    // 存储不可用时只在内存里挡这一次
  }
  emit()
}

export const subscribeServerQuota = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let snapshot = {
  limit: SERVER_DAILY_LIMIT,
  used: -1,
  remaining: SERVER_DAILY_LIMIT,
}

/** 同一用量返回同一个对象，避免 useSyncExternalStore 每次渲染都当成新状态。 */
export const serverQuotaSnapshot = () => {
  const usage = readUsage()
  if (snapshot.used !== usage.used) {
    snapshot = {
      limit: SERVER_DAILY_LIMIT,
      used: usage.used,
      remaining: Math.max(0, SERVER_DAILY_LIMIT - usage.used),
    }
  }
  return snapshot
}

export const isQuotaDialogOpen = (): boolean => dialogOpen

export const dismissQuotaDialog = () => {
  dialogOpen = false
  emit()
}

/**
 * 记一次补全。还有余量时扣掉并返回 true。
 * 用尽时返回 false，并且这一天只打开一次提示窗。
 */
export const tryConsumeServerCompletion = (): boolean => {
  const usage = readUsage()
  if (usage.used >= SERVER_DAILY_LIMIT) {
    if (!usage.alerted) {
      writeUsage({ ...usage, alerted: true })
      dialogOpen = true
      emit()
    }
    return false
  }
  writeUsage({ ...usage, used: usage.used + 1 })
  return true
}
