import React, { useState, useRef } from 'react'
import axios from 'axios'
import { Upload, X } from 'lucide-react'

// 根据名字生成稳定的暖色调背景
const warmColors = [
  '#b07a4a', '#a87d52', '#9c6f3e', '#b88a5c', '#a07246',
  '#b46f3c', '#9d8254', '#c08858', '#8d6c44', '#a57d4f',
  '#b88f63', '#a26840', '#9b704a', '#bf9264', '#8c7050'
]
const colorForName = (name) => {
  if (!name) return warmColors[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return warmColors[hash % warmColors.length]
}

const initialsOf = (name) => {
  const str = String(name || '').trim()
  if (!str) return '?'
  const chineseMatch = str.match(/[\u4e00-\u9fa5]/g)
  if (chineseMatch && chineseMatch.length >= 2) return chineseMatch.slice(0, 2).join('')
  if (chineseMatch && chineseMatch.length === 1) return chineseMatch[0]
  // 英文：取首字母
  const words = str.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return str.slice(0, 2).toUpperCase()
}

/**
 * 通用头像组件
 * props:
 *  - src: 图片 URL（空则显示首字母）
 *  - name: 角色名（用于 fallback 文本和颜色）
 *  - size: 像素尺寸（默认 40）
 *  - onClick: 点击回调
 *  - className: 额外样式
 *  - editable: 是否显示上传/移除按钮
 *  - uploadUrl: 上传 endpoint（POST，body: { dataUrl }）
 *  - removeUrl: 删除 endpoint（DELETE）
 *  - onChange: (newUrl) => void，上传/移除成功回调
 */
export default function Avatar({
  src,
  name,
  size = 40,
  onClick,
  className = '',
  editable = false,
  uploadUrl,
  removeUrl,
  onChange,
  title
}) {
  const [imgError, setImgError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const showImage = src && !imgError
  const bgColor = colorForName(name)
  const fontSize = Math.max(10, Math.floor(size * 0.42))

  const handleFile = async (file) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      alert('仅支持 jpg/png/webp/gif 格式')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      alert('图片不能超过 4MB')
      return
    }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        setUploading(true)
        const dataUrl = ev.target.result
        const res = await axios.post(uploadUrl, { dataUrl })
        onChange?.(res.data?.avatar || '')
        setImgError(false)
      } catch (err) {
        alert('上传失败: ' + (err.response?.data?.error || err.message))
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleRemove = async (e) => {
    e.stopPropagation()
    if (!removeUrl) {
      onChange?.('')
      return
    }
    if (!confirm('确定要删除头像吗？')) return
    try {
      await axios.delete(removeUrl)
      onChange?.('')
      setImgError(false)
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.error || err.message))
    }
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: showImage ? 'transparent' : bgColor,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.3)'
      }}
      onClick={onClick}
      title={title || name}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || ''}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        <span
          className="font-bold text-white select-none"
          style={{ fontSize, letterSpacing: '-0.02em' }}
        >
          {initialsOf(name)}
        </span>
      )}

      {editable && uploadUrl && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              handleFile(f)
              e.target.value = ''
            }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            {uploading ? (
              <span className="text-white text-xs">...</span>
            ) : (
              <Upload className="text-white" style={{ width: size * 0.4, height: size * 0.4 }} />
            )}
          </div>
          {showImage && removeUrl && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-0 right-0 bg-red-500/80 hover:bg-red-500 text-white rounded-bl-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ fontSize: 10 }}
              title="删除头像"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </>
      )}
    </div>
  )
}
