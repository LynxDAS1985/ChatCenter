// v0.87.99: список стран для CountryPicker в LoginModal.
// Статичные данные — НЕ запрашиваем из API. Telegram/WhatsApp делают так же.
// Покрытие: страны СНГ + популярные у русскоязычных юзеров (мигранты, IT).
// Если придёт редкая страна — добавь сюда одну строку.
//
// Поля:
// - code: ISO 3166-1 alpha-2 (нужно для определения по локали)
// - name: человеческое название на русском
// - dial: телефонный код БЕЗ "+" (только цифры)
// - flag: эмодзи флаг (Unicode regional indicator pairs)
// - nationalDigits: длина национальной части номера (БЕЗ кода страны)
//   Итоговый номер = "+" + dial + nationalDigits цифр

export const COUNTRIES = [
  // СНГ
  { code: 'RU', name: 'Россия',          dial: '7',   flag: '🇷🇺', nationalDigits: 10 },
  { code: 'BY', name: 'Беларусь',        dial: '375', flag: '🇧🇾', nationalDigits: 9  },
  { code: 'KZ', name: 'Казахстан',       dial: '7',   flag: '🇰🇿', nationalDigits: 10 },
  { code: 'UA', name: 'Украина',         dial: '380', flag: '🇺🇦', nationalDigits: 9  },
  { code: 'UZ', name: 'Узбекистан',      dial: '998', flag: '🇺🇿', nationalDigits: 9  },
  { code: 'AM', name: 'Армения',         dial: '374', flag: '🇦🇲', nationalDigits: 8  },
  { code: 'GE', name: 'Грузия',          dial: '995', flag: '🇬🇪', nationalDigits: 9  },
  { code: 'AZ', name: 'Азербайджан',     dial: '994', flag: '🇦🇿', nationalDigits: 9  },
  { code: 'KG', name: 'Кыргызстан',      dial: '996', flag: '🇰🇬', nationalDigits: 9  },
  { code: 'TJ', name: 'Таджикистан',     dial: '992', flag: '🇹🇯', nationalDigits: 9  },
  { code: 'TM', name: 'Туркменистан',    dial: '993', flag: '🇹🇲', nationalDigits: 8  },
  { code: 'MD', name: 'Молдова',         dial: '373', flag: '🇲🇩', nationalDigits: 8  },
  // Популярные у русскоязычных
  { code: 'TR', name: 'Турция',          dial: '90',  flag: '🇹🇷', nationalDigits: 10 },
  { code: 'DE', name: 'Германия',        dial: '49',  flag: '🇩🇪', nationalDigits: 11 },
  { code: 'IL', name: 'Израиль',         dial: '972', flag: '🇮🇱', nationalDigits: 9  },
  { code: 'US', name: 'США / Канада',    dial: '1',   flag: '🇺🇸', nationalDigits: 10 },
  { code: 'CY', name: 'Кипр',            dial: '357', flag: '🇨🇾', nationalDigits: 8  },
  { code: 'AE', name: 'ОАЭ',             dial: '971', flag: '🇦🇪', nationalDigits: 9  },
  { code: 'TH', name: 'Таиланд',         dial: '66',  flag: '🇹🇭', nationalDigits: 9  },
  { code: 'VN', name: 'Вьетнам',         dial: '84',  flag: '🇻🇳', nationalDigits: 9  },
  { code: 'CN', name: 'Китай',           dial: '86',  flag: '🇨🇳', nationalDigits: 11 },
  { code: 'ME', name: 'Черногория',      dial: '382', flag: '🇲🇪', nationalDigits: 8  },
  { code: 'RS', name: 'Сербия',          dial: '381', flag: '🇷🇸', nationalDigits: 9  },
]

// Дефолт по локали системы. navigator.language возвращает 'ru-RU', 'en-US', 'be-BY' и т.п.
export function getDefaultCountry(locale) {
  const loc = (locale || '').toLowerCase()
  // Сначала ищем точное совпадение по country code (часть после '-')
  const m = loc.match(/-([a-z]{2})/)
  if (m) {
    const cc = m[1].toUpperCase()
    const found = COUNTRIES.find(c => c.code === cc)
    if (found) return found
  }
  // Маппинг по языку для случаев без региона ('ru', 'be', 'uk')
  const langMap = {
    ru: 'RU', be: 'BY', uk: 'UA', kk: 'KZ', uz: 'UZ',
    hy: 'AM', ka: 'GE', az: 'AZ', ky: 'KG', tg: 'TJ', tk: 'TM',
    ro: 'MD', tr: 'TR', de: 'DE', he: 'IL', en: 'US',
    th: 'TH', vi: 'VN', zh: 'CN', sr: 'RS',
  }
  const lang = loc.split('-')[0]
  const cc = langMap[lang]
  if (cc) {
    const found = COUNTRIES.find(c => c.code === cc)
    if (found) return found
  }
  // Fallback — Россия (целевая аудитория проекта)
  return COUNTRIES[0]
}
