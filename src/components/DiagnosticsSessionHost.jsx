import SystemDiagnosticsModal from './SystemDiagnosticsModal.jsx'
import DiagnosticsFloatingPanel from './DiagnosticsFloatingPanel.jsx'
import useDiagnosticsSession from '../hooks/useDiagnosticsSession.js'

export default function DiagnosticsSessionHost({ open, onOpen, onClose, runtimeContext, onRunDeepCheck }) {
  const diagnostics = useDiagnosticsSession({
    getRuntimeContext: () => runtimeContext || {},
    onRunDeepCheck,
  })

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
        onPause={diagnostics.pause}
        onResume={diagnostics.resume}
        onStop={diagnostics.stop}
        onExpand={() => onOpen?.()}
        onSave={diagnostics.save}
        onCopy={diagnostics.copy}
        onClear={diagnostics.clear}
        onCloseAll={diagnostics.close}
        onToggleDeep={diagnostics.toggleDeep}
      />
    </>
  )
}
