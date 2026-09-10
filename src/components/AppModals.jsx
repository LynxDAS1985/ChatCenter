// AppModals.jsx — v1.2.442
//
// ВСЕ модальные окна приложения (кроме нативного режима) собраны здесь: раньше они лежали
// прямо в `src/App.jsx`, который упёрся в свой потолок 1075 строк — из-за этого в него
// нельзя было добавить даже одну строку проводки (в v1.2.441 пришлось связывать пункт меню
// со сборщиком аватарок через событие окна, потому что места под обычную передачу не было).
//
// ЧТО ПЕРЕЕХАЛО (чистый перенос, поведение НЕ менялось):
//   • объявления «ленивой» загрузки (`lazy(() => import(...))`) для 15 модалок — так их код
//     не грузится при старте, а только при первом открытии (было так же, просто в App.jsx);
//   • сама разметка модалок и условия их показа.
// В App.jsx остались `NativeApp` и `AISidebar` — они часть основного экрана, не модалки.
//
// КАК ПЕРЕДАЮТСЯ ДАННЫЕ: одним объектом `ctx` — тот же приём, что уже использует
// NotifLogModal (`ctx={{ … }}`). Так App.jsx тратит на всё это ~25 строк вместо ~155.
//
// СТРАЖ: `src/__tests__/appStructure.test.cjs` проверяет «модалки грузятся лениво и
// используются» по СКЛЕЙКЕ App.jsx + этого файла (`allAppCode`) — смысл проверки сохранён,
// изменилось только место, где лежат строки.
import { lazy, Suspense } from 'react'
import ErrorBoundary from './ErrorBoundary.jsx'

const AddMessengerModal = lazy(() => import('./AddMessengerModal.jsx'))
const SettingsPanel = lazy(() => import('./SettingsPanel.jsx'))
const TemplatesPanel = lazy(() => import('./TemplatesPanel.jsx'))
const AutoReplyPanel = lazy(() => import('./AutoReplyPanel.jsx'))
const NotifLogModal = lazy(() => import('./NotifLogModal.jsx'))
const ConfirmCloseModal = lazy(() => import('./ConfirmCloseModal.jsx'))
const LogModal = lazy(() => import('./LogModal.jsx'))
const ConnectionsPanel = lazy(() => import('./ConnectionsPanel.jsx'))
const DiagnosticsSessionHost = lazy(() => import('./DiagnosticsSessionHost.jsx'))
// v0.95.25: модалка «Что нового» — показывается при первом запуске после обновления.
const WhatsNewModal = lazy(() => import('./WhatsNewModal.jsx'))
// v1.0.1: 3 панели — Задачи / Напоминания / AI Activity (Phase 4).
const PanelModal = lazy(() => import('./PanelModal.jsx'))
const TasksPanel = lazy(() => import('./TasksPanel.jsx'))
const RemindersPanel = lazy(() => import('./RemindersPanel.jsx'))
const AIActivityDashboard = lazy(() => import('./AIActivityDashboard.jsx'))
// v1.1.0 (Phase 4.3): AI auto-reply rules.
const AIAutoReplyRules = lazy(() => import('./AIAutoReplyRules.jsx'))

export default function AppModals({ ctx }) {
  const {
    showConnectionsPanel, setShowConnectionsPanel, connectionHealth, messengers, activeId,
    activeNativeAccountId, webviewLoading, refreshAllConnections, refreshProblematicConnections,
    openSystemLog, showAddModal, setShowAddModal, addMessenger, editingMessenger,
    setEditingMessenger, saveMessenger, showSettings, setShowSettings, settings, setMessengers,
    handleSettingsChange, openSystemDiagnostics, showTemplates, setShowTemplates, showAutoReply,
    setShowAutoReply, confirmClose, setConfirmClose, removeMessenger, notifLogModal,
    setNotifLogModal, notifLogTab, setNotifLogTab, traceFilter, setTraceFilter, setCellTooltip,
    setSettings, webviewRefs, handleTabContextAction_diag, traceNotif, handleNewMessage,
    pipelineTraceRef, diagnosticsHostMounted, showSystemDiagnostics, setShowSystemDiagnostics,
    unreadCounts, unreadSplit, appReady, showAI, tasksCount, remindersCount, showLogModal,
    setShowLogModal, logContent, setLogContent, whatsNew, handleWhatsNewClose,
    showTasks, setShowTasks, showReminders, setShowReminders, showActivity, setShowActivity,
    showAutoReplyRules, setShowAutoReplyRules, handleGoToSource,
  } = ctx

  return (
    <>
      {/* ── Модальные окна ── */}
      <Suspense fallback={null}>
        {showConnectionsPanel && <ConnectionsPanel
          connectionHealth={connectionHealth}
          messengers={messengers}
          activeId={activeId}
          activeNativeAccountId={activeNativeAccountId}
          webviewLoading={webviewLoading}
          onClose={() => setShowConnectionsPanel(false)}
          onRefreshAll={refreshAllConnections}
          onRefreshProblematic={refreshProblematicConnections}
          onOpenLog={openSystemLog}
        />}

        {showAddModal && (
          <AddMessengerModal onAdd={addMessenger} onClose={() => setShowAddModal(false)} />
        )}

        {editingMessenger && (
          <AddMessengerModal editing={editingMessenger} onSave={saveMessenger} onAdd={() => {}} onClose={() => setEditingMessenger(null)} />
        )}

        {showSettings && (
          <ErrorBoundary name="Settings"><SettingsPanel
            messengers={messengers} settings={settings}
            onMessengersChange={setMessengers} onSettingsChange={handleSettingsChange}
            onClose={() => setShowSettings(false)}
            onOpenSystemDiagnostics={openSystemDiagnostics}
          /></ErrorBoundary>
        )}

        {showTemplates && (
          <ErrorBoundary name="Templates"><TemplatesPanel
            settings={settings} onSettingsChange={handleSettingsChange} onClose={() => setShowTemplates(false)}
          /></ErrorBoundary>
        )}

        {showAutoReply && (
          <ErrorBoundary name="AutoReply"><AutoReplyPanel
            settings={settings} onSettingsChange={handleSettingsChange} onClose={() => setShowAutoReply(false)}
          /></ErrorBoundary>
        )}
      </Suspense>

      <Suspense fallback={null}>
        {confirmClose && <ConfirmCloseModal
          confirmClose={confirmClose}
          onCancel={() => setConfirmClose(null)}
          onConfirm={() => removeMessenger(confirmClose.id)}
        />}
      </Suspense>

      {/* ── Модальное окно: Лог уведомлений ── */}
      <Suspense fallback={null}>
        {notifLogModal && <ErrorBoundary name="NotifLog"><NotifLogModal ctx={{
          notifLogModal, setNotifLogModal, notifLogTab, setNotifLogTab,
          traceFilter, setTraceFilter, setCellTooltip,
          settings, setSettings, webviewRefs,
          handleTabContextAction_diag,
          traceNotif, handleNewMessage, pipelineTraceRef
        }} /></ErrorBoundary>}
      </Suspense>
      <Suspense fallback={null}>
        {diagnosticsHostMounted && <ErrorBoundary name="SystemDiagnostics"><DiagnosticsSessionHost
          open={showSystemDiagnostics}
          onOpen={openSystemDiagnostics}
          runtimeContext={{
            messengers,
            activeId,
            activeNativeAccountId,
            connectionHealth,
            webviewLoading,
            unreadCounts,
            unreadSplit,
            pipelineTrace: pipelineTraceRef.current,
            appReady,
            showAI,
            tasksCount,
            remindersCount,
          }}
          onRunDeepCheck={refreshProblematicConnections}
          onClose={() => setShowSystemDiagnostics(false)}
        /></ErrorBoundary>}
      </Suspense>

      {/* ── v0.84.2: Модальное окно системного лога ── */}
      <Suspense fallback={null}>
        {showLogModal && <LogModal
          content={logContent}
          onClose={() => setShowLogModal(false)}
          onRefresh={() => window.api?.invoke('app:read-log').then(c => setLogContent(c || 'Лог пуст'))}
        />}
      </Suspense>

      {/* v0.95.25: «Что нового» — модалка с changelog при первом запуске после
          обновления версии. Lazy-loaded; не блокирует appReady. */}
      <Suspense fallback={null}>
        {whatsNew && <WhatsNewModal
          prevVersion={whatsNew.prevVersion}
          currentVersion={whatsNew.currentVersion}
          onClose={handleWhatsNewClose}
        />}
      </Suspense>

      {/* v1.0.1: Phase 4 модалки — Задачи / Напоминания / AI Activity.
          Открываются по клику на иконки 📝 ⏰ 📊 в шапке. PanelModal — overlay + ✕.
          onGoToSource (для Tasks/Reminders) переключает на ЦентрЧатов + scroll to message. */}
      <Suspense fallback={null}>
        {showTasks && (
          <PanelModal title="📝 Задачи" onClose={() => setShowTasks(false)} width={760}>
            <TasksPanel onGoToSource={handleGoToSource} />
          </PanelModal>
        )}
        {showReminders && (
          <PanelModal title="⏰ Напоминания" onClose={() => setShowReminders(false)} width={680}>
            <RemindersPanel onGoToSource={handleGoToSource} />
          </PanelModal>
        )}
        {showActivity && (
          <PanelModal title="📊 AI Activity" onClose={() => setShowActivity(false)} width={900}>
            <AIActivityDashboard />
          </PanelModal>
        )}
        {showAutoReplyRules && (
          <PanelModal title="🤖 Правила автоответа" onClose={() => setShowAutoReplyRules(false)} width={760}>
            <AIAutoReplyRules />
          </PanelModal>
        )}
      </Suspense>
    </>
  )
}
