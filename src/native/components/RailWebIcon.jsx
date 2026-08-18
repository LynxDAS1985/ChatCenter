// v1.2.256 — значок веб-мессенджера в нативной боковой полосе (под аккаунтами).
// Модель 🅰️: единая полоса — сверху Telegram-аккаунты, ниже веб-мессенджеры (ВК/WhatsApp/МАКС).
// Клик → открыть вкладку этого мессенджера (handleTabClick из App). Размеры масштабируются
// вместе с полосой (railScale), как у AccountAvatar. Форма — КРУГЛАЯ (v1.2.279, как API-аватар),
// по просьбе пользователя (раньше был скруглённый квадрат).
// v1.2.273: под значком — подпись имени аккаунта (accountName), как у API-аватаров. Нужно, т.к.
// после скрытия верхних вкладок (v1.2.272) имя аккаунта веб-мессенджера больше нигде не видно.
// При узкой полосе (hideLabel) подпись прячется; нет имени → подписи нет (значок как раньше).
import ConnectionStatusDot from '../../components/ConnectionStatusDot.jsx'
import MessengerIcon from './MessengerIcon.jsx' // v1.2.265: настоящий логотип Telegram (не эмодзи ✈️)

export default function RailWebIcon({
  messenger: m, isActive, unread = 0, health, isNew, onSelect, onOpenConnections, scale = 1,
  // v1.2.257: функции вкладок на веб-значках — правый клик (меню), перетаскивание, полоска загрузки.
  onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver, isLoading,
  // v1.2.273: имя аккаунта (из accountInfo) + скрытие подписи при узкой полосе.
  accountName, hideLabel,
  // v1.2.275: аватар залогиненного веб-аккаунта (base64 data-URI). Есть → фото + значок мессенджера
  // в углу (как у API-аватара); нет → значок логотипом (как раньше).
  avatar,
}) {
  const px = (n) => Math.max(1, Math.round(n * scale))
  const color = m.color || '#2AABEE'
  // Подсказка: имя мессенджера + имя аккаунта (если есть) — как было у вкладки.
  const tip = accountName ? `${m.name} · ${accountName}` : m.name
  return (
    <div style={{ width: px(56), margin: `0 auto ${px(12)}px`, textAlign: 'center' }}>
      <div
        role="button"
        tabIndex={0}
        draggable
        data-web-id={m.id}
        aria-current={isActive ? 'true' : undefined}
        title={tip}
        onClick={() => onSelect?.(m.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(m.id) } }}
        onContextMenu={e => { e.preventDefault(); onContextMenu?.(m.id, e.clientX, e.clientY) }}
        onDragStart={e => { if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; onDragStart?.(m.id) }}
        onDragOver={e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; onDragOver?.(m.id) }}
        onDrop={e => { e.preventDefault(); onDrop?.(m.id) }}
        onDragEnd={() => onDragEnd?.()}
        style={{
          position: 'relative', width: px(48), height: px(48), margin: '0 auto',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', // v1.2.279: круглые, как API
          fontSize: px(22), lineHeight: 1, cursor: 'pointer',
          // v1.2.275: есть фото аккаунта → показываем его; иначе фон под логотип.
          background: avatar ? `url("${avatar}") center/cover no-repeat` : (isActive ? `${color}22` : 'var(--amoled-surface)'),
          outline: isDragOver ? `2px dashed ${color}` : isActive ? `2px solid ${color}` : '1px solid var(--amoled-border)',
        }}
      >
        {/* Пульс при новом сообщении */}
        {isNew && !isActive && (
          <span aria-hidden="true" className="animate-ping" style={{
            position: 'absolute', inset: px(6), borderRadius: '50%', background: color, opacity: 0.35,
          }} />
        )}
        {/* v1.2.275: есть фото → значок мессенджера УГЛОМ поверх фото (как у API-аватара);
            нет фото → значок ПО ЦЕНТРУ (Telegram — настоящий логотип, остальные — эмодзи). */}
        {avatar ? (
          <span style={{
            position: 'absolute', top: -px(2), right: -px(2), width: px(18), height: px(18),
            borderRadius: '50%', background: 'var(--amoled-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {(m.id === 'telegram' || /telegram/i.test(m.name || ''))
              ? <MessengerIcon messenger="telegram" size={px(12)} />
              : <span aria-hidden="true" style={{ fontSize: px(11), lineHeight: 1 }}>{m.emoji || '•'}</span>}
          </span>
        ) : (
          (m.id === 'telegram' || /telegram/i.test(m.name || ''))
            ? <MessengerIcon messenger="telegram" size={px(24)} />
            : <span aria-hidden="true">{m.emoji || (m.name ? m.name[0] : '•')}</span>
        )}

        {/* Бейдж непрочитанных — v1.2.276: СЛЕВА-сверху, как у API-аватара (и чтобы не налезал
            на угловой значок мессенджера справа-сверху при наличии фото). */}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -px(3), left: -px(3), minWidth: px(17), height: px(17),
            padding: `0 ${px(4)}px`, borderRadius: px(9), background: 'var(--amoled-danger)',
            color: '#fff', fontSize: px(10), fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--amoled-bg)',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}

        {/* Точка связи (клик → «Подключения») */}
        <span style={{ position: 'absolute', bottom: 0, right: 0 }}>
          <ConnectionStatusDot
            health={health} fallbackColor={`${color}66`} fallbackLabel={tip}
            size={px(11)} onClick={onOpenConnections}
            style={{ border: '2px solid var(--amoled-bg)' }}
          />
        </span>

        {/* Полоска загрузки под значком (v1.2.257) */}
        {isLoading && (
          <span aria-hidden="true" style={{
            position: 'absolute', bottom: -px(2), left: px(6), right: px(6), height: 2, borderRadius: 2, overflow: 'hidden',
          }}>
            <span style={{
              display: 'block', height: '100%',
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              animation: 'tabLoading 1.2s ease-in-out infinite',
            }} />
          </span>
        )}
      </div>

      {/* v1.2.273: подпись имени аккаунта под значком (как у API-аватаров). Прячется на узкой полосе. */}
      {!hideLabel && accountName && (
        <div style={{
          marginTop: px(4), fontSize: px(11), color: 'var(--amoled-text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px',
        }}>{accountName}</div>
      )}
    </div>
  )
}
