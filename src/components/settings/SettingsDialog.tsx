import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconModelOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import { createId } from '../../utils/id.js'
import { verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
} from '../../services/chat/backup.js'
import { useChatStore } from '../../services/chat/store.js'
import { useIsMobile } from '../../app/viewport.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  ALL_EFFORTS,
  isBuiltinProvider,
  isChineseBrowser,
  modelAccepts,
  removeProvider,
  saveProvider,
  setActiveModel,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ModelProfile,
  type ModelProvider,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）、「模型」（对话模型与 API Key）
 * 与「数据管理」（导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'models', label: 'settingDialogAsideModelOptionLabel', icon: <IconModelOutline16 /> },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失导入状态
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {section === 'general' ? (
            <>
              <ThemeSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
            </>
          ) : section === 'models' ? (
            <ModelSettings />
          ) : (
            <>
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
            </>
          )}
        </div>
      </Modal>
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 覆盖导入的二次确认，叠在设置弹窗上 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

/** 模型设置：供应商列表；点进去编辑该供应商及其模型 */
const ModelSettings = () => {
  const t = useTranslate()
  const providers = useSettings((state) => state.providers)
  const activeProviderId = useSettings((state) => state.activeProviderId)
  const activeModelId = useSettings((state) => state.activeModelId)
  // 当前供应商还没有 Key 时直接展开它的表单：首次使用的唯一任务是填 Key，
  // 停在一张没有输入框的列表上等于让人自己找路。
  const [editing, setEditing] = useState<ModelProvider | null>(() => {
    const active = providers.find((item) => item.id === activeProviderId) ?? providers[0]
    return active && !active.apiKey ? active : null
  })

  if (editing) {
    return <ProviderForm provider={editing} onDone={() => setEditing(null)} />
  }

  return (
    <div className={styles.modelSection}>
      <div className={styles.modelHeading}>
        <div className={styles.label}>{t('settingDialogAsideModelOptionLabel')}</div>
        <div className={styles.description}>{t('modelSectionHint')}</div>
      </div>
      <div className={styles.modelList}>
        {providers.map((provider) => {
          const model =
            provider.models.find((item) => item.id === activeModelId) ?? provider.models[0]
          const active = provider.id === activeProviderId
          return (
            <div key={provider.id} className={styles.modelItem}>
              <button
                type="button"
                className={styles.modelPick}
                title={t('modelUse')}
                onClick={() => setActiveModel(provider.id, model.id)}
              >
                <span className={styles.modelName}>{provider.name}</span>
                {!isBuiltinProvider(provider) ? (
                  <span className={styles.modelTag}>{t('modelCustom')}</span>
                ) : null}
                <span
                  className={clsx(styles.modelDot, active && styles.modelDotActive)}
                  aria-label={active ? t('modelInUse') : undefined}
                />
                {/* 只有一个模型时 provider 名就够，多模型才显示当前用的是哪个 */}
                {provider.models.length > 1 ? (
                  <span className={styles.modelMeta}>{active ? model.name : ''}</span>
                ) : null}
                {modelAccepts(provider, model, 'image') ? (
                  <span className={styles.modelCapability}>{t('modelInputImage')}</span>
                ) : null}
                {provider.models.length > 1 ? (
                  <span className={styles.modelCapability}>
                    {provider.models.length} {t('modelCountSuffix')}
                  </span>
                ) : null}
              </button>
              <div className={styles.modelActions}>
                <button
                  type="button"
                  className={styles.modelAction}
                  onClick={() => setEditing(provider)}
                >
                  {t('modelEdit')}
                </button>
                {/* 内置 DeepSeek 不提供删除：它的配置由代码维护，删掉就没法回落 */}
                {!isBuiltinProvider(provider) && providers.length > 1 ? (
                  <button
                    type="button"
                    className={clsx(styles.modelAction, styles.modelActionDanger)}
                    onClick={() => removeProvider(provider.id)}
                  >
                    {t('modelDelete')}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className={styles.modelAdd}
        onClick={() =>
          setEditing({
            id: createId(),
            name: t('providerDefaultName'),
            baseUrl: '',
            apiKey: '',
            models: [{ id: '', name: t('modelDefaultName') }],
          })
        }
      >
        {t('providerAdd')}
      </button>
      <div className={styles.modelNote}>{t('modelExtensionsHint')}</div>
    </div>
  )
}

/** 推理强度的显示名，与输入框的模型菜单保持一致：直接用 API 枚举值 */
const effortLabelOf = (value: string) => value[0].toUpperCase() + value.slice(1)

/**
 * 把容量输入框的文字解析成正整数：空串清除声明，非数字或非正数一律视为清除。
 * 不做单位换算——这里填的是原始 token 数，写 128K 只会被当成非法值。
 */
const parseCapacity = (text: string): number | undefined => {
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/** 供应商编辑：端点与凭据，外加它下面的模型列表 */
const ProviderForm = ({
  provider,
  onDone,
}: {
  provider: ModelProvider
  onDone: () => void
}) => {
  const t = useTranslate()
  const [draft, setDraft] = useState(provider)
  const [editingModel, setEditingModel] = useState<number | null>(null)
  /** 保存过程中包含一次 Key 校验，按钮上显示进度 */
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const update = (patch: Partial<ModelProvider>) => {
    setDraft((value) => ({ ...value, ...patch }))
    setSaveError(null)
  }
  const apiKey = draft.apiKey.trim()
  const baseUrl = draft.baseUrl.trim()

  const isMobile = useIsMobile()
  const keyInputRef = useRef<HTMLInputElement>(null)
  // 还没有 Key 时把光标放进 Key 输入框：首次进来唯一要做的事就是填它。
  // 移动端不自动聚焦，否则一打开就弹键盘盖住半个屏幕。
  const missingKey = provider.apiKey === ''
  useEffect(() => {
    if (missingKey && !isMobile) {
      keyInputRef.current?.focus()
    }
  }, [missingKey, isMobile])

  /**
   * 保存：先校验 Key，通过才落盘。
   * 与原实现一致——填了 Key 就在保存时验一次，不额外加一个「验证」步骤；
   * 校验用的是表单里正在编辑的地址，不是已保存的那个。
   */
  const submit = async () => {
    if (saving) {
      return
    }
    const models = draft.models
      .map((model) => ({ ...model, id: model.id.trim(), name: model.name.trim() }))
      .filter((model) => model.id !== '')
      .map((model) => ({ ...model, name: model.name || model.id }))
    // 一个模型都没有就不保存：空 provider 没法用
    if (models.length === 0) {
      return
    }
    setSaveError(null)
    if (apiKey) {
      setSaving(true)
      try {
        await verifyApiKey(apiKey, undefined, baseUrl)
      } catch (error) {
        setSaving(false)
        setSaveError(
          classifyApiError(error) === 'unauthorized'
            ? t('apiKeyInvalid')
            : t('apiKeyVerificationFailed', {
                message: error instanceof Error ? error.message : String(error),
              })
        )
        return
      }
    }
    saveProvider({
      ...draft,
      name: draft.name.trim() || t('providerDefaultName'),
      baseUrl,
      apiKey,
      models,
    })
    setSaving(false)
    onDone()
  }

  if (editingModel !== null) {
    return (
      <ModelForm
        model={draft.models[editingModel]}
        // 模型没声明的能力用 provider 默认值预填，表单打开就能看到真实生效的配置
        provider={draft}
        onCancel={() => setEditingModel(null)}
        onSave={(model) => {
          setDraft((value) => ({
            ...value,
            models: value.models.map((item, index) => (index === editingModel ? model : item)),
          }))
          setEditingModel(null)
        }}
      />
    )
  }

  return (
    <div className={styles.modelSection}>
      <div className={styles.modelHeading}>
        <div className={styles.label}>{t('providerSectionLabel')}</div>
        <div className={styles.description}>{t('modelBaseUrlHint')}</div>
      </div>
      <div className={styles.form}>
        <label className={styles.formField}>
          <span className={styles.formLabel}>{t('modelNameLabel')}</span>
          <input
            className={styles.formInput}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('modelNamePlaceholder')}
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.formLabel}>{t('modelBaseUrlLabel')}</span>
          <input
            className={styles.formInput}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('modelBaseUrlPlaceholder')}
            value={draft.baseUrl}
            onChange={(event) => update({ baseUrl: event.target.value })}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.formLabel}>{t('modelApiKeyLabel')}</span>
          <input
            ref={keyInputRef}
            className={styles.formInput}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('apiKeyPlaceholder')}
            value={draft.apiKey}
            onChange={(event) => update({ apiKey: event.target.value })}
            onKeyDown={(event) => {
              // 和原实现一致：回车直接提交，提交时才校验
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void submit()
              }
            }}
          />
        </label>
        {saveError ? <span className={styles.verifyError}>{saveError}</span> : null}
        {/* 模型列表：容量与能力都在模型里配，provider 只给模态默认值 */}
        <div className={styles.formField}>
          <span className={styles.formLabel}>{t('providerModelsLabel')}</span>
          <div className={styles.modelList}>
            {draft.models.map((model, index) => (
              <div key={index} className={styles.modelItem}>
                <button
                  type="button"
                  className={styles.modelPick}
                  onClick={() => setEditingModel(index)}
                >
                  <span className={styles.modelName}>{model.name || t('modelDefaultName')}</span>
                  <span className={styles.modelMeta}>{model.id || '—'}</span>
                  {model.inputModalities?.includes('image') ? (
                    <span className={styles.modelCapability}>{t('modelInputImage')}</span>
                  ) : null}
                </button>
                <div className={styles.modelActions}>
                  <button
                    type="button"
                    className={styles.modelAction}
                    onClick={() => setEditingModel(index)}
                  >
                    {t('modelEdit')}
                  </button>
                  {draft.models.length > 1 ? (
                    <button
                      type="button"
                      className={clsx(styles.modelAction, styles.modelActionDanger)}
                      onClick={() =>
                        setDraft((value) => ({
                          ...value,
                          models: value.models.filter((_, position) => position !== index),
                        }))
                      }
                    >
                      {t('modelDelete')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.modelAdd}
            onClick={() =>
              setDraft((value) => ({
                ...value,
                models: [...value.models, { id: '', name: t('modelDefaultName') }],
              }))
            }
          >
            {t('modelAdd')}
          </button>
        </div>
      </div>
      <div className={styles.formActions}>
        <Button variant="outlined" size="m" onClick={onDone}>
          {t('modelCancel')}
        </Button>
        <Button size="m" disabled={saving} onClick={() => void submit()}>
          {saving ? t('apiKeyVerifying') : t('modelSave')}
        </Button>
      </div>
    </div>
  )
}

/**
 * 单个模型编辑：容量、输入模态与推理强度都在这里配。
 *
 * 只有输入模态会从 provider 的默认值预填——那是 provider 唯一持有的能力默认；
 * 容量属于模型自身，没有可继承的来源。
 */
const ModelForm = ({
  model,
  provider,
  onCancel,
  onSave,
}: {
  model: ModelProfile
  provider: ModelProvider
  onCancel: () => void
  onSave: (model: ModelProfile) => void
}) => {
  const t = useTranslate()
  const [draft, setDraft] = useState<ModelProfile>(() => ({
    ...model,
    inputModalities: model.inputModalities ?? provider.defaultInputModalities,
  }))
  const update = (patch: Partial<ModelProfile>) => setDraft((value) => ({ ...value, ...patch }))
  return (
    <div className={styles.modelSection}>
      <div className={styles.modelHeading}>
        <div className={styles.label}>{t('modelSectionLabel')}</div>
        <div className={styles.description}>{t('modelOverrideHint')}</div>
      </div>
      <div className={styles.form}>
        <div className={styles.capacityRow}>
          <label className={styles.formField}>
            <span className={styles.formLabel}>{t('modelIdLabel')}</span>
            <input
              className={styles.formInput}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('modelIdPlaceholder')}
              value={draft.id}
              onChange={(event) => update({ id: event.target.value })}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formLabel}>{t('modelNameLabel')}</span>
            <input
              className={styles.formInput}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('modelNamePlaceholder')}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
        </div>
        {/* 输入类型：不勾就继承 provider 默认 */}
        <div className={styles.formField}>
          <span className={styles.formLabel}>{t('modelInputTypes')}</span>
          <div className={styles.modalityChoices}>
            {(['text', 'image'] as const).map((modality) => {
              const selected = draft.inputModalities ?? []
              const checked = selected.includes(modality)
              return (
                <label key={modality} className={styles.modalityChoice}>
                  <input
                    type="checkbox"
                    className={styles.modalityBox}
                    checked={checked}
                    onChange={(event) => {
                      const next = (['text', 'image'] as const).filter((value) =>
                        value === modality ? event.target.checked : selected.includes(value)
                      )
                      update({ inputModalities: next.length > 0 ? next : undefined })
                    }}
                  />
                  <span>{t(modality === 'text' ? 'modelInputText' : 'modelInputImage')}</span>
                </label>
              )
            })}
          </div>
          <span className={styles.formHint}>{t('modelInputTypesHint')}</span>
        </div>
        <div className={styles.capacityRow}>
          <label className={styles.formField}>
            <span className={styles.formLabel}>{t('modelContextWindow')}</span>
            <input
              className={styles.formInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('modelCapacityInherit')}
              value={draft.contextWindow === undefined ? '' : String(draft.contextWindow)}
              onChange={(event) => update({ contextWindow: parseCapacity(event.target.value) })}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formLabel}>{t('modelMaxTokens')}</span>
            <input
              className={styles.formInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('modelCapacityInherit')}
              value={draft.maxTokens === undefined ? '' : String(draft.maxTokens)}
              onChange={(event) => update({ maxTokens: parseCapacity(event.target.value) })}
            />
          </label>
        </div>
        {/* 推理强度：一个都不勾表示不支持深度思考 */}
        <div className={styles.formField}>
          <span className={styles.formLabel}>{t('modelReasoning')}</span>
          <div className={styles.modalityChoices}>
            {ALL_EFFORTS.map((level) => {
              const selected = draft.reasoningEfforts ?? []
              const checked = selected.includes(level)
              return (
                <label key={level} className={styles.modalityChoice}>
                  <input
                    type="checkbox"
                    className={styles.modalityBox}
                    checked={checked}
                    onChange={(event) => {
                      const next = ALL_EFFORTS.filter((value) =>
                        value === level ? event.target.checked : selected.includes(value)
                      )
                      update({ reasoningEfforts: next.length > 0 ? next : undefined })
                    }}
                  />
                  <span>{effortLabelOf(level)}</span>
                </label>
              )
            })}
          </div>
          <span className={styles.formHint}>{t('modelReasoningHint')}</span>
        </div>
      </div>
      <div className={styles.formActions}>
        <Button variant="outlined" size="m" onClick={onCancel}>
          {t('modelCancel')}
        </Button>
        <Button size="m" onClick={() => onSave(draft)}>
          {t('modelDone')}
        </Button>
      </div>
    </div>
  )
}

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 选文件后先提示覆盖；确认后才检查文件并执行导入，任何错误都提示导入失败。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    setStatus(null)
    try {
      const count = await importHistory(file)
      setStatus({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, status, select: setFile, cancel: () => setFile(null), confirm }
}

/** 导入 = 覆盖：用选中文件替换本地全部会话与附件。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={historyImport.status}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select(file)
              }
            }}
          />
        </>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}
