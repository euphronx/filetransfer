import clsx from 'clsx'
import { memo, useState } from 'react'
import type { Image } from 'mdast'
import { useTranslate } from '../../i18n/index.js'
import { isSafeImageUrl } from '../../utils/url.js'
import { ImageAsLink } from './Link.js'
import { ImagePreview } from './ImagePreview.js'
import styles from './MarkdownImage.module.css'

/**
 * 正文里的图片：
 * 加载中显示骨架，加载失败显示兜底说明，加载成功后点击可看大图。
 * 地址不在白名单内时降级为普通链接，避免渲染任意协议。
 *
 * 注意：图片不能用 display:none 藏起来等加载。页面内的 img 一旦不可见，
 * 浏览器就不会为它发起请求，onLoad 永远不来，状态会永久卡在「加载中」。
 * 这里让图片与骨架叠在同一层，靠透明度切换。
 */
export const MarkdownImage = memo(function MarkdownImage({ node }: { node: Image }) {
  const t = useTranslate()
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [open, setOpen] = useState(false)
  const url = node.url.trim()
  const alt = node.alt ?? ''

  if (!isSafeImageUrl(url)) {
    return <ImageAsLink node={node} />
  }

  return (
    <>
      <span className={clsx(styles.figure, status === 'error' && styles.failed)}>
        <span className={styles.frame}>
          {status === 'loading' ? <span className={styles.skeleton} aria-hidden /> : null}
          {status !== 'error' ? (
            <img
              className={clsx(styles.image, status === 'loading' && styles.imageLoading)}
              src={url}
              alt={alt}
              title={node.title ?? undefined}
              decoding="async"
              onLoad={() => setStatus('loaded')}
              onError={() => setStatus('error')}
              onClick={() => setOpen(true)}
            />
          ) : (
            <span className={styles.fallback}>
              {alt ? <span className={styles.fallbackAlt}>{alt}</span> : null}
              <span className={styles.fallbackNote}>{t('imageFailed')}</span>
            </span>
          )}
        </span>
        {status === 'loaded' && alt ? <span className={styles.caption}>{alt}</span> : null}
      </span>
      {open ? <ImagePreview url={url} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  )
})
