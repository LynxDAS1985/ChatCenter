// v1.2.182: значок мессенджера. Если есть логотип-картинка (Telegram — data-URI из
// messengerLogos.js) — рисуем её; иначе fallback на эмодзи (messengerBranding.js).
// v1.2.183: если картинка не загрузилась (битый data-URI) — onError переключает на эмодзи,
// чтобы никогда не показывать иконку-«поломашку».
// Размер задаётся пропом size (для img — width/height, для эмодзи — fontSize).
import { useState } from 'react'
import { getMessengerLogo } from '../utils/messengerLogos.js'
import { getMessengerEmoji } from '../utils/messengerBranding.js'

export default function MessengerIcon({ messenger, size = 14, style }) {
  const [failed, setFailed] = useState(false)
  const logo = getMessengerLogo(messenger)
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailed(true)}
        style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', flexShrink: 0, ...style }}
      />
    )
  }
  return <span style={{ fontSize: size, lineHeight: 1, ...style }}>{getMessengerEmoji(messenger)}</span>
}
