// v0.83.2: AI конфиг-панель — вынесена из AISidebar.jsx для уменьшения файла
// Содержит: настройки провайдера, API-ключ, модель, системный промпт
// v0.83.3: Все данные приходят через props от AISidebar

export default function AIConfigPanel({ showConfig, setShowConfig, providerMode, aiCfg, aiApiKey, aiClientSecret, aiModel, aiSystemPrompt, setProviderProp, showKey, setShowKey, showSecret, setShowSecret, testing, testStatus, justSaved, waitingForKey, keyFoundMsg, providerInfo }) {
  return (
  <>
  {/* ── Конфиг-панель (с анимацией slide-down) ── */}
  <div
    style={{
      maxHeight: showConfig ? '520px' : '0px',
      overflow: 'hidden',
      transition: 'max-height 0.25s ease-in-out',
      flexShrink: 0,
    }}
  >
    <div
      className="px-3 py-3 space-y-2 overflow-y-auto"
      style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)', maxHeight: '520px' }}
    >
      {/* Переключатель режима провайдера */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
          Режим {providerInfo.label}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setProviderProp('mode', 'api')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
            style={{
              backgroundColor: providerMode === 'api' ? '#2AABEE22' : 'var(--cc-hover)',
              border: `1.5px solid ${providerMode === 'api' ? '#2AABEE66' : 'transparent'}`,
              color: providerMode === 'api' ? '#2AABEE' : 'var(--cc-text-dimmer)',
            }}
          >
            <span>🔧</span><span>API-ключ</span>
            {providerMode === 'api' && <span className="text-[10px]">✓</span>}
          </button>
          <button
            onClick={() => setProviderProp('mode', 'webview')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
            style={{
              backgroundColor: providerMode === 'webview' ? '#2AABEE22' : 'var(--cc-hover)',
              border: `1.5px solid ${providerMode === 'webview' ? '#2AABEE66' : 'transparent'}`,
              color: providerMode === 'webview' ? '#2AABEE' : 'var(--cc-text-dimmer)',
            }}
          >
            <span>🌐</span><span>Веб-интерфейс</span>
            {providerMode === 'webview' && <span className="text-[10px]">✓</span>}
          </button>
        </div>
      </div>

      {/* ── API режим: нумерованные шаги ── */}
      {providerMode === 'api' && (
        <>
          {/* Шаг 1: Регистрация + вход через браузер */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
            <StepRow
              num="1"
              title={`Зарегистрируйтесь на ${providerInfo.label}`}
              extra={
                <button
                  onClick={openProviderUrl}
                  className="flex items-center gap-1 text-[9px] cursor-pointer px-1.5 py-0.5 rounded"
                  style={{ color: '#2AABEE', backgroundColor: '#2AABEE11' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2AABEE22'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2AABEE11'}
                >↗ Открыть</button>
              }
            />
            <div className="px-2.5 py-2 space-y-1.5">
              <button
                onClick={openLoginWindow}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: waitingForKey ? '#f59e0b22' : '#2AABEE22',
                  border: `1px solid ${waitingForKey ? '#f59e0b66' : '#2AABEE66'}`,
                  color: waitingForKey ? '#f59e0b' : '#2AABEE',
                }}
                onMouseEnter={e => { if (!waitingForKey) e.currentTarget.style.backgroundColor = '#2AABEE33' }}
                onMouseLeave={e => { if (!waitingForKey) e.currentTarget.style.backgroundColor = '#2AABEE22' }}
              >
                {waitingForKey ? (
                  <><span className="animate-pulse">⏳</span><span>Ожидаем ключ... (нажмите для отмены)</span></>
                ) : (
                  <><span>🔑</span><span>Войти через браузер → ключ вставится сам</span></>
                )}
              </button>
              {keyFoundMsg && (
                <div className="text-[10px] px-2 py-1.5 rounded-lg text-center font-medium"
                  style={{ backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                  {keyFoundMsg}
                </div>
              )}
            </div>
          </div>

          {/* Шаг 2: Модель */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
            <StepRow num="2" title="Выберите модель" />
            <div className="px-2.5 py-2 flex flex-col gap-1">
              {(MODEL_HINTS[provider] || []).map(m => (
                <button key={m} onClick={() => set('aiModel', m)}
                  className="flex items-center justify-between text-left px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                  style={{
                    backgroundColor: aiCfg.model === m ? '#2AABEE22' : 'transparent',
                    color: aiCfg.model === m ? '#2AABEE' : 'var(--cc-text-dim)',
                    border: `1px solid ${aiCfg.model === m ? '#2AABEE44' : 'transparent'}`,
                  }}>
                  <span>{m}</span>
                  {aiCfg.model === m && <span className="text-[10px]">✓</span>}
                </button>
              ))}
              <input
                type="text"
                value={!MODEL_HINTS[provider]?.includes(aiCfg.model) ? aiCfg.model : ''}
                onChange={e => set('aiModel', e.target.value)}
                placeholder="Другая модель..."
                className="w-full text-xs px-2 py-1 rounded-lg outline-none"
                style={{ backgroundColor: 'transparent', border: '1px solid var(--cc-border)', color: 'var(--cc-text-dim)' }}
              />
            </div>
          </div>

          {/* Шаг 3 (и 4 для ГигаЧат): Ключ */}
          {isGigaChat ? (
            <>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
                <StepRow num="3" title="Client ID" numDone={!!aiCfg.apiKey} />
                <div className="px-2.5 py-2">
                  <input type="text" value={aiCfg.apiKey} onChange={e => set('aiApiKey', e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                    style={{ backgroundColor: 'var(--cc-hover)', border: `1px solid ${justSaved && aiCfg.apiKey ? '#22c55e66' : 'var(--cc-border)'}`, color: 'var(--cc-text)', transition: 'border-color 0.3s' }} />
                </div>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
                <StepRow num="4" title="Client Secret" numDone={!!aiCfg.clientSecret} />
                <div className="px-2.5 py-2">
                  <div className="relative">
                    <input type={showSecret ? 'text' : 'password'} value={aiCfg.clientSecret} onChange={e => set('aiClientSecret', e.target.value)}
                      placeholder="Секретный ключ"
                      className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                      style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }} />
                    <button onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                      style={{ color: 'var(--cc-text-dimmer)' }}>{showSecret ? '🙈' : '👁️'}</button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className="text-[10px]" style={{ color: '#22c55e', opacity: justSaved ? 1 : 0 }}>✓ сохранено</span>
                    <button onClick={testConnection} disabled={!aiCfg.apiKey || !aiCfg.clientSecret || testing}
                      className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition-all disabled:opacity-40"
                      style={{
                        backgroundColor: testStatus === 'ok' ? '#22c55e22' : testStatus === 'fail' ? 'rgba(239,68,68,0.1)' : '#2AABEE22',
                        color: testStatus === 'ok' ? '#22c55e' : testStatus === 'fail' ? '#f87171' : '#2AABEE',
                        border: `1px solid ${testStatus === 'ok' ? '#22c55e44' : testStatus === 'fail' ? 'rgba(239,68,68,0.3)' : '#2AABEE44'}`,
                      }}>
                      {testing ? '⏳ Проверка...' : testStatus === 'ok' ? '✓ Работает!' : testStatus === 'fail' ? '✗ Ошибка' : '5. Проверить соединение'}
                    </button>
                  </div>
                  {testStatus === 'fail' && error && (
                    <div className="mt-1.5 text-[10px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      ⚠️ {error}
                      {isBillingError(error) && BILLING_URLS[provider] && (
                        <button
                          onClick={() => window.api.invoke('shell:open-url', BILLING_URLS[provider]).catch(() => {})}
                          className="mt-1.5 w-full text-center py-1 rounded cursor-pointer text-[10px] font-medium"
                          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.25)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'}
                        >
                          💳 Пополнить счёт на сайте провайдера →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
              <StepRow num="3" title="Вставьте API-ключ" numDone={!!aiCfg.apiKey} />
              <div className="px-2.5 py-2">
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={aiCfg.apiKey} onChange={e => set('aiApiKey', e.target.value)}
                    placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                    className="w-full text-xs px-2 py-1.5 pr-7 rounded-lg outline-none font-mono"
                    style={{
                      backgroundColor: 'var(--cc-hover)',
                      border: `1px solid ${justSaved ? '#22c55e66' : 'var(--cc-border)'}`,
                      color: 'var(--cc-text)',
                      transition: 'border-color 0.3s',
                    }} />
                  <button onClick={() => setShowKey(!showKey)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] cursor-pointer"
                    style={{ color: 'var(--cc-text-dimmer)' }}>{showKey ? '🙈' : '👁️'}</button>
                </div>
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <span className="text-[10px] transition-opacity" style={{ color: '#22c55e', opacity: justSaved ? 1 : 0 }}>✓ сохранено</span>
                  <button onClick={testConnection} disabled={!aiCfg.apiKey || testing}
                    className="text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: testStatus === 'ok' ? '#22c55e22' : testStatus === 'fail' ? 'rgba(239,68,68,0.1)' : '#2AABEE22',
                      color: testStatus === 'ok' ? '#22c55e' : testStatus === 'fail' ? '#f87171' : '#2AABEE',
                      border: `1px solid ${testStatus === 'ok' ? '#22c55e44' : testStatus === 'fail' ? 'rgba(239,68,68,0.3)' : '#2AABEE44'}`,
                    }}>
                    {testing ? '⏳ Проверка...' : testStatus === 'ok' ? '✓ Ключ работает!' : testStatus === 'fail' ? '✗ Ошибка' : '4. Проверить соединение'}
                  </button>
                </div>
                {testStatus === 'fail' && error && (
                  <div className="mt-1.5 text-[10px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    ⚠️ {error}
                    {isBillingError(error) && BILLING_URLS[provider] && (
                      <button
                        onClick={() => window.api.invoke('shell:open-url', BILLING_URLS[provider]).catch(() => {})}
                        className="mt-1.5 w-full text-center py-1 rounded cursor-pointer text-[10px] font-medium"
                        style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'}
                      >
                        💳 Пополнить счёт на сайте провайдера →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Шаг 4/5: Системный промпт */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--cc-border)' }}>
            <StepRow
              num={isGigaChat ? '5' : '4'}
              title="Системный промпт"
              extra={<span className="text-[9px]" style={{ color: 'var(--cc-text-dimmer)' }}>(опционально)</span>}
            />
            <div className="px-2.5 py-2">
              <textarea
                value={aiCfg.systemPrompt}
                onChange={e => set('aiSystemPrompt', e.target.value)}
                rows={3}
                className="w-full text-[11px] px-2 py-1.5 rounded-lg outline-none resize-none leading-relaxed"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
            </div>
          </div>
        </>
      )}

      {/* ── WebView режим: URL + разрешения ── */}
      {providerMode === 'webview' && (
        <>
          <div
            className="text-[11px] px-2.5 py-2 rounded-lg leading-relaxed"
            style={{ backgroundColor: '#2AABEE0D', border: '1px solid #2AABEE22', color: 'var(--cc-text-dim)' }}
          >
            <div className="font-semibold mb-0.5" style={{ color: '#2AABEE' }}>🌐 Веб-интерфейс</div>
            <div style={{ color: 'var(--cc-text-dimmer)' }}>
              Откроется сайт {providerInfo.label}. Войдите в свой аккаунт и пользуйтесь со своей подпиской — API-ключ не нужен.
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>URL сервиса</div>
            <input
              type="text"
              value={webviewUrl}
              onChange={e => setProviderProp('webviewUrl', e.target.value)}
              placeholder="https://..."
              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
              style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
            />
            {webviewUrl !== (DEFAULT_WEBVIEW_URLS[provider] || '') && (
              <button
                onClick={() => setProviderProp('webviewUrl', DEFAULT_WEBVIEW_URLS[provider] || '')}
                className="text-[9px] mt-1 cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#2AABEE'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--cc-text-dimmer)'}
              >↺ Сбросить на стандартный</button>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
              Разрешения на чтение чата
            </div>
            <div className="flex gap-1">
              {[
                { id: 'none', icon: '🔇', label: 'Ничего',    desc: 'Не передавать историю чата в AI' },
                { id: 'last', icon: '💬', label: 'Последнее', desc: 'Только последнее сообщение клиента' },
                { id: 'full', icon: '📖', label: 'История',   desc: 'Последние 10 сообщений из чата' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setProviderProp('contextMode', m.id)}
                  title={m.desc}
                  className="flex-1 flex flex-col items-center py-1.5 rounded-lg text-[9px] cursor-pointer transition-all leading-tight"
                  style={{
                    backgroundColor: contextMode === m.id ? '#2AABEE22' : 'var(--cc-hover)',
                    border: `1px solid ${contextMode === m.id ? '#2AABEE55' : 'transparent'}`,
                    color: contextMode === m.id ? '#2AABEE' : 'var(--cc-text-dimmer)',
                  }}
                >
                  <span className="text-sm mb-0.5">{m.icon}</span>
                  <span className="font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Кнопка "Готово — закрыть настройки" ── */}
      <button
        onClick={() => setShowConfig(false)}
        className="w-full py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
        style={{ backgroundColor: '#2AABEE22', border: '1px solid #2AABEE44', color: '#2AABEE' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2AABEE33'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2AABEE22'}
      >
        ✓ Готово — закрыть настройки
      </button>

    </div>
  </div>
  </>
  )
}
