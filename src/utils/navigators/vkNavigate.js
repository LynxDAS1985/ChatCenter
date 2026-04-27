// Навигация к чату в VK (vk.com).

export function buildVkScript(senderName) {
  const nameJson = JSON.stringify(senderName || '')
  return `(function() {
    try {
      var name = ${nameJson};
      if (!name) return false;
      var els = document.querySelectorAll('.im_dialog_peer, [class*="ConversationHeader__name"], [class*="PeerName"], .ConvoListItem__title');
      for (var i = 0; i < els.length; i++) {
        if (els[i].textContent.trim() === name) {
          var row = els[i].closest('a, li, button, [role="listitem"], .ConvoListItem');
          if (row) { row.click(); return true; }
        }
      }
      return false;
    } catch(e) { return false; }
  })();`
}
