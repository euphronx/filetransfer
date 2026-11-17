import { create } from 'zustand'
import { getApiKey } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / 模型 / 数据管理 */
export type SettingsSection = 'general' | 'models' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有 API Key 时打开设置并选中模型配置，返回是否已有 Key */
export const ensureApiKey = () => {
  if (getApiKey()) {
    return true
  }
  openSettings('models')
  return false
}
