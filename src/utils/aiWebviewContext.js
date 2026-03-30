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
  if (wv) {
    try {
      const escaped = JSON.stringify(contextText)
      const script = `(function(){
        const t=${escaped};
        const sels=['textarea','[contenteditable="true"]','#prompt-textarea','.chat-input textarea','[data-testid="message-input"]'];
        for(const s of sels){
          const el=document.querySelector(s);
          if(el){
            el.focus();
            if(document.execCommand('insertText',false,t))return true;
            try{
              const s2=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;
              if(s2){s2.call(el,t);el.dispatchEvent(new Event('input',{bubbles:true}));return true;}
            }catch(e2){}
            return true;
          }
        }
        return false;
      })()`
      inserted = await wv.executeJavaScript(script)
    } catch {}
  }
  if (!inserted) {
    try { await navigator.clipboard.writeText(contextText) } catch {}
    setContextSendStatus('copied')
  } else {
    setContextSendStatus('sent')
  }
  setTimeout(() => setContextSendStatus(null), 3000)
}
