import { translate } from '../../i18n/index.js'
import { monthKey } from '../../utils/format.js'
import type { SessionSummary } from './types.js'

const DAY = 86_400_000

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/** 分组：置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 按月 */
export const groupSessions = (sessions: SessionSummary[], now: number, t = translate) => {
  const groups: { key: string; label: string; sessions: SessionSummary[] }[] = []

  // 置顶的会话不按时间归组，统一排在最前，组内按更新时间降序
  const pinned = sessions.filter((session) => session.pinned)
  if (pinned.length > 0) {
    groups.push({
      key: 'pinned',
      label: t('pinnedSectionLabel'),
      sessions: [...pinned].sort((a, b) => b.updatedAt - a.updatedAt),
    })
  }

  for (const session of sessions) {
    if (session.pinned) {
      continue
    }
    const diff = Math.floor((now - startOfDay(session.updatedAt)) / DAY)
    const key =
      diff <= 0
        ? 'sessionHistoryTimelineLabelToday'
        : diff <= 1
          ? 'sessionHistoryTimelineLabelYesterday'
          : diff < 7
            ? 'sessionHistoryTimelineLabel7days'
            : diff < 30
              ? 'sessionHistoryTimelineLabel30days'
              : null
    const groupKey = key ?? monthKey(session.updatedAt) ?? ''
    const last = groups.at(-1)
    if (last?.key === groupKey) {
      last.sessions.push(session)
    } else {
      groups.push({ key: groupKey, label: key ? t(key) : groupKey, sessions: [session] })
    }
  }
  return groups
}

/**
 * 按关键词筛选会话：标题命中，或会话正文命中（由 bodyIndex 提供）。
 * 关键词按空白拆成多个词，全部命中才算匹配；空白关键词返回全部。
 */
export const filterSessions = (
  sessions: SessionSummary[],
  keyword: string,
  bodyIndex?: ReadonlyMap<string, string>
) => {
  const terms = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) {
    return sessions
  }
  return sessions.filter((session) => {
    const title = session.title.toLowerCase()
    const body = bodyIndex?.get(session.id) ?? ''
    return terms.every((term) => title.includes(term) || body.includes(term))
  })
}
