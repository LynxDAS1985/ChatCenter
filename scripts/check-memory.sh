#!/bin/bash
# scripts/check-memory.sh
#
# Проверка здоровья Memory Bank: размеры файлов, согласованность версий,
# устаревшие ссылки. Запускать перед крупной сессией ИИ или раз в неделю.
#
# Использование: bash scripts/check-memory.sh
# (на Windows: через Git Bash или WSL)

set -u

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

EXIT_CODE=0

echo "🔍 Проверка здоровья Memory Bank"
echo "================================="

# ─── 1. Размеры файлов ───
echo ""
echo "📏 Размеры файлов (лимиты: корень 100 КБ, mistakes/ 200 КБ, индекс 10 КБ)"
echo ""

check_size() {
  local file="$1"
  local limit_kb="$2"
  local label="$3"
  if [ ! -f "$file" ]; then
    return
  fi
  local size=$(wc -c < "$file")
  local size_kb=$(( (size + 512) / 1024 ))
  local limit_bytes=$(( limit_kb * 1024 ))
  local warn_bytes=$(( limit_bytes * 80 / 100 ))

  if [ "$size" -gt "$limit_bytes" ]; then
    echo -e "${RED}  ❌ $label ($size_kb КБ > $limit_kb КБ) — РАЗБИТЬ!${NC}"
    EXIT_CODE=1
  elif [ "$size" -gt "$warn_bytes" ]; then
    echo -e "${YELLOW}  ⚠️  $label ($size_kb КБ, лимит $limit_kb КБ) — приближается${NC}"
  else
    echo -e "${GREEN}  ✅ $label ($size_kb КБ / $limit_kb КБ)${NC}"
  fi
}

# Корневые файлы (лимит 100 КБ)
for f in .memory-bank/*.md; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  if [ "$name" = "common-mistakes.md" ]; then
    check_size "$f" 10 "$f (индекс)"
  else
    check_size "$f" 100 "$f"
  fi
done

# Файлы в mistakes/ (лимит 200 КБ)
if [ -d .memory-bank/mistakes ]; then
  for f in .memory-bank/mistakes/*.md; do
    [ -f "$f" ] || continue
    check_size "$f" 200 "$f"
  done
fi

# ─── 2. Согласованность версий ───
echo ""
echo "🔢 Версии в 4 местах"
echo ""

PKG_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
LOCK_VERSION=$(grep '"version"' package-lock.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
CLAUDE_VERSION=$(grep -oE 'Текущая версия.*v[0-9]+\.[0-9]+\.[0-9]+' CLAUDE.md | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sed 's/v//')
FEATURES_VERSION=$(grep -oE 'Текущая версия.*v[0-9]+\.[0-9]+\.[0-9]+' .memory-bank/features.md | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sed 's/v//')

echo "  package.json:        $PKG_VERSION"
echo "  package-lock.json:   $LOCK_VERSION"
echo "  CLAUDE.md:           $CLAUDE_VERSION"
echo "  features.md:         $FEATURES_VERSION"

if [ "$PKG_VERSION" = "$LOCK_VERSION" ] && [ "$PKG_VERSION" = "$CLAUDE_VERSION" ] && [ "$PKG_VERSION" = "$FEATURES_VERSION" ]; then
  echo -e "${GREEN}  ✅ Все 4 места согласованы${NC}"
else
  echo -e "${RED}  ❌ Рассинхрон версий — поднять все до одной${NC}"
  EXIT_CODE=1
fi

# ─── 3. Устаревшие ссылки ───
echo ""
echo "🔗 Ссылки в CLAUDE.md на несуществующие файлы .memory-bank"
echo ""

BROKEN=0
# Извлекаем все .memory-bank/ ссылки из CLAUDE.md
for ref in $(grep -oE '\.memory-bank/[a-zA-Z0-9./_-]+\.md' CLAUDE.md | sort -u); do
  if [ ! -f "$ref" ]; then
    echo -e "${RED}  ❌ $ref (упомянут в CLAUDE.md, но файла нет)${NC}"
    BROKEN=1
    EXIT_CODE=1
  fi
done
if [ "$BROKEN" = "0" ]; then
  echo -e "${GREEN}  ✅ Все ссылки в CLAUDE.md ведут на существующие файлы${NC}"
fi

# ─── 4. Архив: не должен читаться по умолчанию ───
echo ""
echo "📦 Архив"
echo ""
if [ -d .memory-bank/archive ]; then
  ARCHIVE_COUNT=$(find .memory-bank/archive -name '*.md' -type f | wc -l)
  ARCHIVE_SIZE_KB=$(( ($(find .memory-bank/archive -name '*.md' -type f -exec cat {} + | wc -c) + 512) / 1024 ))
  echo "  $ARCHIVE_COUNT файлов, $ARCHIVE_SIZE_KB КБ. Эти файлы НЕ читаются агентом по умолчанию."
else
  echo -e "${YELLOW}  ⚠️  Папка archive/ не существует${NC}"
fi

# ─── Итог ───
echo ""
echo "================================="
if [ "$EXIT_CODE" = "0" ]; then
  echo -e "${GREEN}✅ Memory Bank здоров${NC}"
else
  echo -e "${RED}❌ Есть проблемы — см. выше${NC}"
fi

exit $EXIT_CODE
