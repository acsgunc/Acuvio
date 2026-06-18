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

!include "LogicLib.nsh"

; --------------------------------------------------------------------------
; Dependency checks
; --------------------------------------------------------------------------
; Acuvio's only external runtime dependency is the Microsoft Edge WebView2
; Runtime (the engine that renders the UI). The Visual C++ runtime dependency
; is removed by static CRT linking (see src-tauri/.cargo/config.toml), so it is
; not checked here.
;
; The installer is already configured to download & install WebView2 silently
; (`webviewInstallMode` in tauri.conf.json). This preinstall hook additionally
; *informs* the user up-front when WebView2 is missing and gives a manual
; download link as a fallback, so nothing happens silently behind their back.

; WebView2 Runtime "Clients" GUID used by Microsoft EdgeUpdate.
!define ACUVIO_WV2_CLIENT "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define ACUVIO_WV2_DOWNLOAD "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

; Sets $0 to the installed WebView2 version string, or "" when not present.
!macro AcuvioDetectWebView2
  Push $1
  StrCpy $0 ""
  ; Per-machine (64-bit OS stores the 32-bit EdgeUpdate keys under WOW6432Node).
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${ACUVIO_WV2_CLIENT}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${ACUVIO_WV2_CLIENT}" "pv"
  ${EndIf}
  ${If} $0 == ""
    ; Per-user install.
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${ACUVIO_WV2_CLIENT}" "pv"
  ${EndIf}
  ; A "0.0.0.0" version means the key exists but the runtime is not installed.
  ${If} $0 == "0.0.0.0"
    StrCpy $0 ""
  ${EndIf}
  SetRegView lastused
  Pop $1
!macroend

; Called by Tauri's NSIS template before files are installed.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro AcuvioDetectWebView2
  ${If} $0 == ""
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
      "Acuvio needs the Microsoft Edge WebView2 Runtime, which is not installed on this PC.$\r$\n$\r$\nClick OK and the installer will download and install it for you automatically (an internet connection is required).$\r$\n$\r$\nIf the automatic install fails, you can install it manually from:$\r$\n${ACUVIO_WV2_DOWNLOAD}" \
      IDOK acuvio_wv2_ok
    ; User chose Cancel: open the manual download page and abort the install.
    ExecShell "open" "${ACUVIO_WV2_DOWNLOAD}"
    Abort "Installation cancelled: the WebView2 Runtime is required."
    acuvio_wv2_ok:
  ${EndIf}
!macroend

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
