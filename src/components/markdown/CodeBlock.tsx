import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useMemo, useReducer, useState } from 'react'
import Prism from 'prismjs'
import {
  getHighlightLang,
  isHighlightLoaded,
  loadHighlight,
} from '../../services/markdown/highlight.js'
import { IconCheckOutline16, IconCopyOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import { CanvasArtifact } from './CanvasArtifact.js'
import styles from './CodeBlock.module.css'

/** 预览 / 代码 双视图切换的配置 */
type ToggleConfig = {
  /** 当前是否显示预览态 */
  preview: boolean
  /** 无障碍标签 */
  label: string
  previewLabel: string
  codeLabel: string
  onToggle: () => void
}

/** 代码块标题栏：左侧语言名或双视图切换，右侧复制 */
const CodeInfoRow = ({
  code,
  infostring,
  toggle,
}: {
  code: string
  infostring: string
  toggle?: ToggleConfig
}) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.container}>
      {toggle ? (
        <div className="md-code-block-switch" aria-label={toggle.label}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={toggle.preview}
            onClick={() => !toggle.preview && toggle.onToggle()}
          >
            {toggle.previewLabel}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={!toggle.preview}
            onClick={() => toggle.preview && toggle.onToggle()}
          >
            {toggle.codeLabel}
          </button>
        </div>
      ) : (
        <span className={styles.name}>{infostring}</span>
      )}
      <button
        type="button"
        className={styles.button}
        onClick={async () => {
          if (!(await copyText(code))) {
            showToast({ key: 'copyFailed' })
            return
          }
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
        <span>{t(copied ? 'copied' : 'copy')}</span>
      </button>
    </div>
  )
}

/**
 * 代码块：语言包按需加载，不支持或尚未加载的语言按纯文本显示。
 * 两个语言有专门的可视化视图：mermaid 画图、canvas 渲染 HTML。
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  infostring,
  loading = false,
}: {
  code: string
  infostring: string
  loading?: boolean
}) {
  const t = useTranslate()
  const lang = infostring.toLowerCase()
  const isMermaid = lang === 'mermaid'
  /** ```canvas 代码块：把内容当 HTML 在沙箱 iframe 里渲染 */
  const isCanvas = lang === 'canvas'
  const hasPreview = isMermaid || isCanvas
  const [showPreview, setShowPreview] = useState(true)
  // 语言包注册在全局 Prism 上，每次渲染直接判断；加载完成后触发一次重渲染
  const rerender = useReducer((n: number) => n + 1, 0)[1]
  // canvas 的内容是 HTML，代码视图按 markup 高亮
  const highlightLang = getHighlightLang(isCanvas ? 'html' : infostring)
  const loaded = highlightLang !== null && isHighlightLoaded(highlightLang)
  useEffect(() => {
    if (highlightLang === null || loaded) {
      return
    }
    let unmounted = false
    loadHighlight(highlightLang).then(() => {
      if (!unmounted) {
        rerender()
      }
    })
    return () => {
      unmounted = true
    }
  }, [highlightLang, loaded, rerender])
  const renderedHtml = useMemo(() => {
    const name = highlightLang !== null && loaded ? highlightLang : 'plaintext'
    return Prism.highlight(code, Prism.languages[name], name)
  }, [code, highlightLang, loaded])
  const toggle: ToggleConfig | undefined = !hasPreview
    ? undefined
    : {
        preview: showPreview,
        label: t(isCanvas ? 'canvasSwitchLabel' : 'mermaidSwitchLabel'),
        previewLabel: t(isCanvas ? 'canvasPreview' : 'mermaidDiagram'),
        codeLabel: t(isCanvas ? 'canvasCode' : 'mermaidCode'),
        onToggle: () => setShowPreview((show) => !show),
      }
  return (
    <div className="md-code-block">
      <div className="md-code-block-banner">
        <CodeInfoRow code={code} infostring={infostring} toggle={toggle} />
      </div>
      {hasPreview && showPreview ? (
        isMermaid ? (
          <MermaidDiagram code={code} loading={loading} />
        ) : (
          <CanvasArtifact code={code} loading={loading} />
        )
      ) : (
        <pre dangerouslySetInnerHTML={{ __html: renderedHtml }}></pre>
      )}
    </div>
  )
})
