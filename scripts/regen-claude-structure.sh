#!/bin/bash
# scripts/regen-claude-structure.sh
#
# Автоматически регенерирует блок "Структура памяти" в CLAUDE.md,
# сканируя .memory-bank/ директорию. Меняет контент ТОЛЬКО между
# маркерами <!-- STRUCTURE-AUTO-START --> и <!-- STRUCTURE-AUTO-END -->.
#
# Если маркеров нет — выходит без изменений.
#
# Использование: bash scripts/regen-claude-structure.sh
#                npm run regen-claude-structure

set -u

CLAUDE_MD="CLAUDE.md"
START_MARKER="<!-- STRUCTURE-AUTO-START -->"
END_MARKER="<!-- STRUCTURE-AUTO-END -->"

if [ ! -f "$CLAUDE_MD" ]; then
  echo "❌ $CLAUDE_MD не найден"
  exit 1
fi

if ! grep -q "$START_MARKER" "$CLAUDE_MD" || ! grep -q "$END_MARKER" "$CLAUDE_MD"; then
  echo "⚠️  Маркеры <!-- STRUCTURE-AUTO-START --> / <!-- STRUCTURE-AUTO-END --> отсутствуют в $CLAUDE_MD."
  echo "   Добавь их в секцию «Структура памяти» для включения авто-регенерации."
  exit 0
fi

# Собираем новое содержимое секции
GENERATED=$(mktemp)
{
  echo "$START_MARKER"
  echo "<!-- Регенерируется скриптом scripts/regen-claude-structure.sh. НЕ редактировать вручную между маркерами. -->"
  echo ""
  echo "### Активные файлы в корне"
  echo ""
  echo "| Файл | Размер |"
  echo "|------|--------|"
  for f in .memory-bank/*.md; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    size_kb=$(( ($(wc -c < "$f") + 512) / 1024 ))
    echo "| \`$name\` | ${size_kb} КБ |"
  done
  echo ""

  if [ -d .memory-bank/mistakes ]; then
    echo "### Подпапка \`mistakes/\` — детали ловушек"
    echo ""
    echo "| Файл | Размер |"
    echo "|------|--------|"
    for f in .memory-bank/mistakes/*.md; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      size_kb=$(( ($(wc -c < "$f") + 512) / 1024 ))
      echo "| \`mistakes/$name\` | ${size_kb} КБ |"
    done
    echo ""
  fi

  if [ -d .memory-bank/archive ]; then
    echo "### Подпапка \`archive/\` — НЕ читать по умолчанию"
    echo ""
    echo "| Файл | Размер |"
    echo "|------|--------|"
    for f in .memory-bank/archive/*.md; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      size_kb=$(( ($(wc -c < "$f") + 512) / 1024 ))
      echo "| \`archive/$name\` | ${size_kb} КБ |"
    done
    echo ""
  fi

  echo "_Регенерировано: $(date +%Y-%m-%d)_"
  echo "$END_MARKER"
} > "$GENERATED"

# Заменяем содержимое между маркерами
OUTPUT=$(mktemp)
awk -v start="$START_MARKER" -v end="$END_MARKER" -v gen="$GENERATED" '
  BEGIN { in_block = 0 }
  $0 ~ start {
    while ((getline line < gen) > 0) print line
    close(gen)
    in_block = 1
    next
  }
  $0 ~ end { in_block = 0; next }
  !in_block { print }
' "$CLAUDE_MD" > "$OUTPUT"

# Сравниваем — были ли изменения
if diff -q "$CLAUDE_MD" "$OUTPUT" > /dev/null 2>&1; then
  echo "✅ $CLAUDE_MD актуален — изменений не требуется"
  rm "$GENERATED" "$OUTPUT"
  exit 0
fi

mv "$OUTPUT" "$CLAUDE_MD"
rm "$GENERATED"
echo "✅ $CLAUDE_MD: блок «Структура памяти» регенерирован"
echo ""
echo "Изменения:"
git diff --stat "$CLAUDE_MD" 2>/dev/null || true
