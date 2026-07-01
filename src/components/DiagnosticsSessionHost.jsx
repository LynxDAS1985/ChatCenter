import { useEffect } from 'react'
import SystemDiagnosticsModal from './SystemDiagnosticsModal.jsx'
import DiagnosticsFloatingPanel from './DiagnosticsFloatingPanel.jsx'
import useDiagnosticsSession from '../hooks/useDiagnosticsSession.js'
import { buildDiagnosticsTargets } from '../utils/diagnosticsTargets.js'

export default function DiagnosticsSessionHost({ open, onOpen, onClose, runtimeContext, onRunDeepCheck, onStatusChange }) {
  const diagnostics = useDiagnosticsSession({
    getRuntimeContext: () => runtimeContext || {},
    onRunDeepCheck,
  })
  const eventCount = diagnostics.session.events?.length || 0
  const { targets, preferred } = buildDiagnosticsTargets(runtimeContext || {})
  const selectedTarget = diagnostics.session.target || preferred

  useEffect(() => {
    onStatusChange?.({
      active: !!diagnostics.session.active,
      paused: !!diagnostics.session.paused,
      events: eventCount,
      lastSavedPath: diagnostics.session.lastSavedPath || '',
      target: selectedTarget || null,
    })
  }, [onStatusChange, diagnostics.session.active, diagnostics.session.paused, diagnostics.session.lastSavedPath, eventCount, selectedTarget])

  return (
    <>
      {open && <SystemDiagnosticsModal
        runtimeContext={runtimeContext}
        onRunDeepCheck={onRunDeepCheck}
        diagnosticsTargets={targets}
        selectedTarget={selectedTarget}
        diagnosticsSession={diagnostics.session}
        diagnosticsActions={diagnostics}
        onClose={onClose}
        onMinimize={onClose}
      />}
      <DiagnosticsFloatingPanel
        session={diagnostics.session}
        selectedTarget={selectedTarget}
        onStart={() => diagnostics.start(selectedTarget)}
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
