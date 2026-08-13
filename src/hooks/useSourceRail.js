// v1.2.252 — проводка бокового рейла источников (Этап 2C+), вынесенная из App.jsx.
// Держит список Telegram-аккаунтов, поднятый из NativeApp, и ссылку на его действия
// (soloAccount). App.jsx разгружается (был у потолка), а логика выбора аккаунта
// становится проверяемой юнит-тестом.
//
// Поток: NativeApp -> onAccountsChange(список) -> nativeAccounts -> <SourceRail accounts=…>.
//        Клик по аккаунту -> onSelectAccount(id): переключиться в общий чат + показать
//        чаты этого аккаунта (soloAccount) через действия, пришедшие из NativeApp.
import { useState, useRef, useCallback } from 'react'

/**
 * @param {Object} opts
 * @param {(sourceId:string)=>void} opts.onSelectSource — переключение источника (handleTabClick).
 * @param {string} opts.nativeCcId — id нативной вкладки (NATIVE_CC_ID).
 */
export default function useSourceRail({ onSelectSource, nativeCcId } = {}) {
  const [nativeAccounts, setNativeAccounts] = useState([])
  const accountActionsRef = useRef(null)

  // NativeApp отдаёт стабильный набор действий (soloAccount/setActiveAccount) — храним в ref.
  const onAccountActionsReady = useCallback((actions) => {
    accountActionsRef.current = actions
  }, [])

  // Клик по значку аккаунта: открыть общий чат + показать чаты именно этого аккаунта.
  const onSelectAccount = useCallback((id) => {
    onSelectSource?.(nativeCcId)
    accountActionsRef.current?.soloAccount?.(id)
  }, [onSelectSource, nativeCcId])

  return {
    nativeAccounts,
    onAccountsChange: setNativeAccounts, // передаётся в NativeApp
    onAccountActionsReady,               // передаётся в NativeApp
    onSelectAccount,                     // передаётся в SourceRail
  }
}
