cd C:/build/exist-eXist-$env:EXIST_VERSION

if ($env:EXIST_VERSION -eq "2.2") {
  & ./tools/wrapper/bin/wrapper-windows-x86-64.exe --stop ..\conf\wrapper.conf
} else {
  Stop-Process $env:EXIST_PROCESS
}
& ./build.bat clean-default-data-dir
Remove-Item -Recurse -Force webapp/WEB-INF/logs/*
