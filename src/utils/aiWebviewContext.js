// v0.84.4: Extracted from AISidebar.jsx — send context to AI webview
// deps: aiWebviewRef, contextMode, lastMessage, chatHistory, setContextSendStatus

/**
 * Sends chat context (last message or history) into the AI webview's input field.
 * Falls back to clipboard copy if injection fails.
 * @param {Object} deps — refs and state values
 */
export async function sendContextToAiWebview(deps) {
  const {
    aiWebviewRef,
    contextMode,
    lastMessage,
    chatHistory,
    setContextSendStatus,
  } = deps

  if (contextMode === 'none') {
    setContextSendStatus('empty')
    setTimeout(() => setContextSendStatus(null), 2000)
    return
  }
  let contextText = ''
  if (contextMode === 'last') {
    if (lastMessage) contextText = `Сообщение клиента: "${lastMessage}"`
  } else if (contextMode === 'full') {
    if (chatHistory.length > 0) {
      contextText = 'История переписки с клиентом:\n' +
        chatHistory.slice(-10).map((h, i) => `${i + 1}. ${h.text}`).join('\n')
    } else if (lastMessage) {
      contextText = `Сообщение клиента: "${lastMessage}"`
    }
  }
  if (!contextText) {
    setContextSendStatus('empty')
    setTimeout(() => setContextSendStatus(null), 2000)
    return
  }
  const wv = aiWebviewRef.current
  let inserted = false
  // v1.1.5: диагностика — фиксируем какой селектор сработал (или ни один)
  let diagInfo = { url: '', matched: null, dom: { textarea: 0, contenteditable: 0, all: 0 } }
  if (wv) {
    try {
      try { diagInfo.url = wv.getURL?.() || '' } catch (_) {}
      const escaped = JSON.stringify(contextText)
      // v1.1.5: расширенный script возвращает не bool, а объект диагностики +
      // делает попытку вставки. Сохраняем поведение прежнее (если matched → inserted=true).
      const script = `(function(){
        const t=${escaped};
        const sels=['textarea','[contenteditable="true"]','#prompt-textarea','.chat-input textarea','[data-testid="message-input"]'];
        const diag={matched:null,inserted:false,dom:{
          textarea: document.querySelectorAll('textarea').length,
          contenteditable: document.querySelectorAll('[contenteditable="true"]').length,
          all: document.body ? document.body.querySelectorAll('*').length : 0
        }};
        for(const s of sels){
          const el=document.querySelector(s);
          if(el){
            diag.matched=s;
            el.focus();
            if(document.execCommand('insertText',false,t)){diag.inserted=true;return diag;}
            try{
              const s2=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;
              if(s2){s2.call(el,t);el.dispatchEvent(new Event('input',{bubbles:true}));diag.inserted=true;return diag;}
            }catch(e2){}
            diag.inserted=true;
            return diag;
          }
        }
        return diag;
      })()`
      const result = await wv.executeJavaScript(script)
      if (result && typeof result === 'object') {
        diagInfo.matched = result.matched
        diagInfo.dom = result.dom || diagInfo.dom
        inserted = !!result.inserted
      } else {
        // legacy boolean
        inserted = !!result
      }
    } catch (e) {
      try { console.error('[ai-webview] ERROR [inject-throw] url=' + diagInfo.url + ' err=' + (e?.message || e)) } catch (_) {}
    }
  }
  // v1.1.5: лог результата injection
  try {
    const status = inserted ? 'sent' : 'fallback-clipboard'
    console.log('[ai-webview] INFO [inject-result] status=' + status
      + ' url=' + diagInfo.url
      + ' matched=' + (diagInfo.matched || 'none')
      + ' dom.textarea=' + diagInfo.dom.textarea
      + ' dom.contenteditable=' + diagInfo.dom.contenteditable
      + ' dom.all=' + diagInfo.dom.all)
  } catch (_) {}
  if (!inserted) {
    try { await navigator.clipboard.writeText(contextText) } catch {}
    setContextSendStatus('copied')
  } else {
    setContextSendStatus('sent')
  }
  setTimeout(() => setContextSendStatus(null), 3000)
}
