import { useEffect } from 'react'
import SystemDiagnosticsModal from './SystemDiagnosticsModal.jsx'
import DiagnosticsFloatingPanel from './DiagnosticsFloatingPanel.jsx'
import useDiagnosticsSession from '../hooks/useDiagnosticsSession.js'

export default function DiagnosticsSessionHost({ open, onOpen, onClose, runtimeContext, onRunDeepCheck, onStatusChange }) {
  const diagnostics = useDiagnosticsSession({
    getRuntimeContext: () => runtimeContext || {},
    onRunDeepCheck,
  })
  const eventCount = diagnostics.session.events?.length || 0

  useEffect(() => {
    onStatusChange?.({
      active: !!diagnostics.session.active,
      paused: !!diagnostics.session.paused,
      events: eventCount,
      lastSavedPath: diagnostics.session.lastSavedPath || '',
    })
  }, [onStatusChange, diagnostics.session.active, diagnostics.session.paused, diagnostics.session.lastSavedPath, eventCount])

  return (
    <>
      {open && <SystemDiagnosticsModal
        runtimeContext={runtimeContext}
        onRunDeepCheck={onRunDeepCheck}
        diagnosticsSession={diagnostics.session}
        diagnosticsActions={diagnostics}
        onClose={onClose}
        onMinimize={onClose}
      />}
      <DiagnosticsFloatingPanel
        session={diagnostics.session}
        onStart={diagnostics.start}
        onPause={diagnostics.pause}
        onResume={diagnostics.resume}
        onStop={diagnostics.stop}
        onExpand={() => onOpen?.()}
        onSave={diagnostics.save}
        onCopy={diagnostics.copy}
        onClear={diagnostics.clear}
        onCloseAll={diagnostics.close}
      />
    </>
  )
}
