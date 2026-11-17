import { memo, useMemo } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconRightUpOutline14 } from '../base/icons.js'
import styles from './CanvasArtifact.module.css'

/**
 * ```canvas 代码块的渲染：把内容当自包含 HTML 在沙箱 iframe 里跑起来。
 *
 * 安全边界靠 iframe 的 sandbox 属性，不靠内容审查：
 * - 只给 allow-scripts：脚本可以运行，但 iframe 是不透明源（unique origin），
 *   拿不到父页面的 DOM、cookie、localStorage，也发不出同源请求。
 * - 绝不同时给 allow-same-origin —— 那两个权限组合起来等于没有沙箱，
 *   脚本可以直接操作父页面。
 * - 不给 allow-top-navigation，产物无法把用户带去别的页面。
 *
 * 流式生成期间先不渲染 iframe：srcdoc 每次变化都会重建文档，
 * 边生成边重建会一直闪，也会反复执行半截脚本。
 */
export const CanvasArtifact = memo(function CanvasArtifact({
  code,
  loading,
}: {
  code: string
  loading: boolean
}) {
  const t = useTranslate()
  const html = useMemo(() => code.trim(), [code])
  const empty = html.length === 0

  // 生成中：只提示，不渲染
  if (loading) {
    return (
      <div className={styles.status} role="status">
        {t('canvasGenerating')}
      </div>
    )
  }

  if (empty) {
    return (
      <div className={styles.status} role="status">
        {t('canvasEmpty')}
      </div>
    )
  }

  const openExternally = () => {
    // 用 blob URL 在新标签打开；和 iframe 一样是独立文档，不继承本站的源
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    // 给浏览器留出读取时间再释放
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className={styles.wrapper}>
      <iframe
        className={styles.frame}
        title={t('canvasPreview')}
        // 关键：不要加 allow-same-origin
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={html}
        referrerPolicy="no-referrer"
        loading="lazy"
      />
      <div className={styles.bar}>
        <button type="button" className={styles.action} onClick={openExternally}>
          <IconRightUpOutline14 />
          <span>{t('canvasOpenExternal')}</span>
        </button>
      </div>
    </div>
  )
})
