import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from '../base/icons.js'
import styles from './ImagePreview.module.css'

/** 图片四周留白，避免贴边 */
const VIEWPORT_PADDING = 0

/**
 * 按「contain」算出图片在视口里的显示尺寸：等比缩放到刚好放进视口。
 * 官方同样是用 JS 把算好的宽高写到元素上（例如 width: 1428px; height: 418.626px），
 * 而不是让 <img> 自己撑满视口 —— 元素盒子必须等于图片的显示区域，
 * 否则它会把整块遮罩盖住，点空白处就关不掉。
 *
 * 缩放上限是 1：大图按视口缩小（这是绝大多数情况），小图保持原始尺寸，
 * 不做放大 —— 放大小图只会糊掉画质，反而看不清。
 */
const fitToViewport = (naturalWidth: number, naturalHeight: number) => {
  const maxWidth = window.innerWidth - VIEWPORT_PADDING * 2
  const maxHeight = window.innerHeight - VIEWPORT_PADDING * 2
  if (!naturalWidth || !naturalHeight) {
    return null
  }
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1)
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  }
}

/**
 * 全屏图片预览，规格取自网页版（FancyBox）：
 * 近黑遮罩铺满视口，图片按比例缩放到视口内并居中，右上角一枚圆形关闭按钮。
 *
 * 挂在 body 上（portal），避免被消息里的 <p>/<li> 等排版容器影响。
 */
export const ImagePreview = ({
  url,
  alt,
  onClose,
}: {
  url: string
  alt: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Esc 关闭；打开期间锁住页面滚动
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  // 视口变化时重算，避免旋转屏幕后图片跑到画面外
  const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    setSize(fitToViewport(img.naturalWidth, img.naturalHeight))
  }, [])

  useEffect(() => {
    const onResize = () => {
      const img = document.querySelector<HTMLImageElement>(`.${styles.image}`)
      if (img?.naturalWidth) {
        setSize(fitToViewport(img.naturalWidth, img.naturalHeight))
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return createPortal(
    <div className={styles.box} role="dialog" aria-modal="true" aria-label={t('imagePreview')}>
      <div className={styles.mask} onClick={onClose} />
      <div className={styles.toolbar}>
        <button type="button" className={styles.close} aria-label={t('close')} onClick={onClose}>
          <IconCloseOutline16 />
        </button>
      </div>
      <div className={styles.slide}>
        <img
          className={styles.image}
          src={url}
          alt={alt}
          onLoad={handleLoad}
          // 尺寸算出来之前先隐藏，避免以原始尺寸闪一下
          style={size ? { width: size.width, height: size.height } : { visibility: 'hidden' }}
        />
      </div>
    </div>,
    document.body
  )
}

