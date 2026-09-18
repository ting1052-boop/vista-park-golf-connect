; 타석 PC 는 매장 오픈 때 전원이 켜지므로 Agent 도 부팅과 함께 떠야 한다.
; 설치 시 시작프로그램 바로가기를 만들고, 제거 시 함께 지운다.
; 타석별 토큰(bays.config.local.json)은 %APPDATA% 에 있고 설치 관리자가
; 건드리지 않으므로, 재설치해도 설정이 유지된다.

!macro customInstall
  CreateShortCut "$SMSTARTUP\VISTA Windows Agent.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\VISTA Windows Agent.lnk"
!macroend
