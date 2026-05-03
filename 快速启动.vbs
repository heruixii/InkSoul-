' AI 酒馆静默启动脚本
' 双击即可在后台启动前后端

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 获取当前目录
strPath = FSO.GetParentFolderName(WScript.ScriptFullName)
strBatPath = strPath & "\start.bat"

If FSO.FileExists(strBatPath) Then
    WshShell.Run "cmd.exe /k call " & Chr(34) & strBatPath & Chr(34), 1, False
Else
    MsgBox "start.bat was not found. Please check the project files.", vbExclamation, "AI Tavern"
End If

Set WshShell = Nothing
Set FSO = Nothing
