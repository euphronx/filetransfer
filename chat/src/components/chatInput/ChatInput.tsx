import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCheckedOutline14,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconGlobeLanguageOutline14,
  IconPaperclipOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import {
  DEFAULT_PROVIDER,
  modelAccepts,
  modelEfforts,
  modelSupportsReasoning,
  getApiKey,
  resolveEffort,
  setActiveModel,
  setEffort,
  setSearch,
  setThinking,
  useSettings,
  type ReasoningEffort,
} from '../../services/settings.js'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey, useSettingsDialog } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, ACCEPT_TEXT_ONLY, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 推理强度的显示名直接用 API 的枚举值（首字母大写），不另起中文名：
 *  这些值是「给多少力气」，自造的「快速 / 标准 / 深入」既不准确，
 *  其中的 Deep 还会和旁边的 DeepThink 开关撞车。 */
const effortLabelOf = (value: ReasoningEffort) => value[0].toUpperCase() + value.slice(1)

/**
 * 模型选择：两层菜单。
 *
 * 第一层只有两行入口（模型 / 推理强度），各自显示当前值；点进去才是列表。
 * 平铺成一个长列表时，模型项和强度项混在一起分不清哪个是哪个。
 */
const ModelPicker = () => {
  const t = useTranslate()
  const providers = useSettings((state) => state.providers)
  const activeProviderId = useSettings((state) => state.activeProviderId)
  const activeModelId = useSettings((state) => state.activeModelId)
  const effort = useSettings((state) => state.effort)
  const thinking = useSettings((state) => state.thinking)
  const provider =
    providers.find((item) => item.id === activeProviderId) ?? providers[0] ?? DEFAULT_PROVIDER
  const model = provider.models.find((item) => item.id === activeModelId) ?? provider.models[0]
  /** 当前模型支持的强度档位；空数组表示不支持深度思考，菜单里不出现这一行 */
  const efforts = modelEfforts(model)
  const showEffort = efforts.length > 0
  /** 真实生效的档位：保存的强度不在当前模型支持范围内时回落到最强档 */
  const effectiveEffort = resolveEffort(model, effort)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<'root' | 'model' | 'effort'>('root')
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    open,
    { align: 'end', offset: 6 }
  )
  const close = () => setOpen(false)
  useDismiss(open, [anchorRef, floatingRef], close)

  const openMenu = () => {
    setPane('root')
    setOpen(true)
  }
  const chooseModel = (providerId: string, modelId: string) => {
    setActiveModel(providerId, modelId)
    close()
  }
  const chooseEffort = (value: ReasoningEffort) => {
    setEffort(value)
    close()
  }

  return (
    <>
      <span ref={anchorRef} className={styles.modelAnchor}>
        <Tooltip content={thinking ? t('effortHint') : t('effortLabel')}>
          <button
            type="button"
            className={styles.modelTrigger}
            aria-label={t('modelMenuAria')}
            aria-haspopup="menu"
            aria-expanded={open}
            title={`${provider.name} · ${model.name}`}
            onClick={() => (open ? close() : openMenu())}
          >
            <span className={styles.modelName}>{model.name}</span>
            {showEffort && effectiveEffort ? (
              <span className={styles.modelEffort}>{effortLabelOf(effectiveEffort)}</span>
            ) : null}
            <IconChevronDownOutline14 />
          </button>
        </Tooltip>
      </span>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.modelMenu}
              style={position ?? undefined}
              role="menu"
              aria-label={t('modelMenuAria')}
            >
              {pane === 'root' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.modelCell}
                    onClick={() => setPane('model')}
                  >
                    <span className={styles.modelCellLabel}>{t('menuModel')}</span>
                    <span className={styles.modelCellValue}>{model.name}</span>
                    <IconChevronRightOutline14 />
                  </button>
                  {showEffort ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.modelCell}
                      onClick={() => setPane('effort')}
                    >
                      <span className={styles.modelCellLabel}>{t('menuEffort')}</span>
                      <span className={styles.modelCellValue}>
                        {effectiveEffort ? effortLabelOf(effectiveEffort) : ''}
                      </span>
                      <IconChevronRightOutline14 />
                    </button>
                  ) : null}
                </>
              ) : pane === 'model' ? (
                // 按 provider 分组：同一家的模型放在一起，组标签是 provider 名
                providers.map((group) => (
                  <div key={group.id} className={styles.modelGroup}>
                    <div className={styles.modelGroupLabel}>{group.name}</div>
                    {group.models.map((item) => {
                      const selected = group.id === provider.id && item.id === model.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          className={styles.modelOption}
                          onClick={() => chooseModel(group.id, item.id)}
                        >
                          <span className={styles.modelOptionName}>{item.name}</span>
                          {selected ? <IconCheckedOutline14 /> : null}
                        </button>
                      )
                    })}
                  </div>
                ))
              ) : (
                efforts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={value === effectiveEffort}
                    className={styles.modelOption}
                    onClick={() => chooseEffort(value)}
                  >
                    <span className={styles.modelOptionName}>{effortLabelOf(value)}</span>
                    {value === effectiveEffort ? <IconCheckedOutline14 /> : null}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  /** 设置弹窗打开时不抢焦点，把光标留给弹窗里的输入框 */
  const settingsOpen = useSettingsDialog((state) => state.open)
  /** 当前模型是否接受图片；切换模型后文件选择器的过滤条件跟着变 */
  const acceptsImage = useSettings((state) => {
    const provider =
      state.providers.find((item) => item.id === state.activeProviderId) ?? state.providers[0]
    if (!provider) {
      return true
    }
    const model = provider.models.find((item) => item.id === state.activeModelId) ?? provider.models[0]
    return modelAccepts(provider, model, 'image')
  })
  /** 当前模型是否支持深度思考；不支持时隐藏开关 */
  const supportsReasoning = useSettings((state) => {
    const provider =
      state.providers.find((item) => item.id === state.activeProviderId) ?? state.providers[0]
    if (!provider) {
      return true
    }
    const model = provider.models.find((item) => item.id === state.activeModelId) ?? provider.models[0]
    return modelSupportsReasoning(model)
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, getApiKey())
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, getApiKey())
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      <div className={styles.textareaWrapper}>
        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘；
          // 设置弹窗打开时也不抢焦点：首次进入是先去填 API Key，
          // 输入框会在会话就绪后重挂载，这里抢一次光标就把弹窗里的焦点顶掉了。
          autoFocus={!isMobile && !settingsOpen}
          disabled={importingHistory}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          {/* 模型不支持深度思考时不显示这个开关，避免开了也没效果 */}
          {supportsReasoning ? (
            <Tooltip content={t('deactivatedThinkTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, thinking && styles.selected)}
                aria-label={t('thinkingSwitch')}
                aria-pressed={thinking}
                onClick={() => setThinking(!thinking)}
              >
                <IconThinkOutline14 />
                <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content={t('deactivatedSearchTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          <ModelPicker />
          <VoiceButton
            status={voice.status}
            disabled={!voice.available}
            seconds={voice.seconds}
            onClick={() => {
              if (
                voice.status !== 'idle' ||
                (!useChatStore.getState().importingHistory && ensureApiKey())
              ) {
                void voice.toggle()
              }
            }}
          />
          <IconButton
            size="m"
            tone="primary"
            icon={<IconPaperclipOutline16 />}
            tooltip={t('uploadFile')}
            disabled={importingHistory}
            onClick={() => ensureApiKey() && fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            // 不接受图片的端点，连文件选择器都不列出图片
            accept={acceptsImage ? ACCEPT : ACCEPT_TEXT_ONLY}
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
  )
}
