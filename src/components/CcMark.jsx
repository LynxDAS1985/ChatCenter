// CcMark.jsx — v1.2.449
//
// Знак приложения (реплика с хвостиком + три лазурные полосы) как обычная картинка.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ: та же геометрия уже нарисована в ДВУХ местах — на стартовой
// заставке (`index.html`, обычный html без React) и на заставке загрузки чатов. Третью
// копию в шапке окна плодить нельзя (правило проекта «не плоди дубль»), поэтому здесь
// один общий вид, которым пользуются React-места. `index.html` остаётся со своей копией
// осознанно: он показывается ДО того, как загрузился код приложения, и импортировать
// оттуда ничего нельзя.
//
// Геометрия — ровно та же клетка 64×64, что у файла иконки (`shared/appIconMark.js`):
// полосы на y=18/32/46 от x=3 до x=17, пузырь 22,10 размером 38×34 со скруглением 11,
// хвостик из точек 31,44 → 31,57 → 43,44. Менять «на глаз» нельзя — знак разъедется
// с иконкой в панели задач.
export default function CcMark({ size = 18, title }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <g stroke="#38BDF8" strokeWidth="5" strokeLinecap="round">
        <path d="M3 18 H17" />
        <path d="M3 32 H17" />
        <path d="M3 46 H17" />
      </g>
      <rect x="22" y="10" width="38" height="34" rx="11" fill="none" stroke="#ffffff" strokeWidth="4.5" />
      <path d="M31 44 V57 L43 44 Z" fill="#ffffff" />
    </svg>
  )
}
