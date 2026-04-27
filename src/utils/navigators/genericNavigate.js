// Generic fallback — поиск текста через TreeWalker на любой странице.
// Используется когда url не подпадает ни под один известный мессенджер.

export function buildGenericScript(senderName) {
  if (!senderName) return null
  const nameJson = JSON.stringify(senderName)
  return `(function() {
    try {
      var name = ${nameJson};
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim() === name) {
          var el = walker.currentNode.parentElement.closest('a, li, [role="listitem"], [tabindex]');
          if (el) { el.click(); return true; }
        }
      }
      return false;
    } catch(e) { return false; }
  })();`
}
