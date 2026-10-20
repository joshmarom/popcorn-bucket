; Runs before files are copied. WinVer.nsh is already included by electron-builder.
; Windows 11 reports itself as Windows 10, so this accepts both and stops on 8.1 and older.
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Popcorn Bucket requires Windows 10 or later."
    Abort
  ${EndIf}
!macroend
