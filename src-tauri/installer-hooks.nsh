; Acuvio — NSIS installer hooks
; --------------------------------------------------------------------------
; Adds an "Open with Acuvio" entry to the Windows right-click context menu for
; common log / text file types, and removes it again on uninstall.
;
; This is wired in via `bundle.windows.nsis.installerHooks` in tauri.conf.json.
; The installer runs per-machine (elevated), so the keys live under HKLM.
;
; We use `SystemFileAssociations\<ext>\shell\...` rather than overwriting the
; default file association — this adds a *secondary* verb so Acuvio appears
; alongside the user's existing "Open" / "Open with" choices without hijacking
; double-click behaviour.
;
; ${MAINBINARYNAME} is defined by Tauri's generated installer and matches the
; installed executable name, so "$INSTDIR\${MAINBINARYNAME}.exe" is always the
; correct path regardless of product naming.

!macro AcuvioRegisterExt EXT
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\${EXT}\shell\Acuvio.Open" "" "Open with Acuvio"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\${EXT}\shell\Acuvio.Open" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\${EXT}\shell\Acuvio.Open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro AcuvioUnregisterExt EXT
  DeleteRegKey HKLM "Software\Classes\SystemFileAssociations\${EXT}\shell\Acuvio.Open"
!macroend

; Called by Tauri's NSIS template after files are installed.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro AcuvioRegisterExt ".log"
  !insertmacro AcuvioRegisterExt ".txt"
  !insertmacro AcuvioRegisterExt ".out"
  !insertmacro AcuvioRegisterExt ".err"
  !insertmacro AcuvioRegisterExt ".json"
  !insertmacro AcuvioRegisterExt ".ndjson"
  !insertmacro AcuvioRegisterExt ".csv"
  ; Tell the shell that file associations changed so the menu updates now.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; Called by Tauri's NSIS template after files are removed on uninstall.
!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro AcuvioUnregisterExt ".log"
  !insertmacro AcuvioUnregisterExt ".txt"
  !insertmacro AcuvioUnregisterExt ".out"
  !insertmacro AcuvioUnregisterExt ".err"
  !insertmacro AcuvioUnregisterExt ".json"
  !insertmacro AcuvioUnregisterExt ".ndjson"
  !insertmacro AcuvioUnregisterExt ".csv"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
