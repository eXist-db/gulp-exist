if (-Not (Test-Path C:\build\exist-eXist-$env:EXIST_VERSION -PathType Any)) {
  Add-AppveyorMessage -Message \"Download and build eXist-db $env:EXIST_VERSION from https://github.com/eXist-db/exist/archive/eXist-$env:EXIST_VERSION.zip\"

  appveyor DownloadFile https://github.com/eXist-db/exist/archive/eXist-$env:EXIST_VERSION.zip

  7z x -y eXist-$env:EXIST_VERSION.zip -oC:\build

  cd C:/build/exist-eXist-$env:EXIST_VERSION

  & ./build.bat

} else {
  Add-AppveyorMessage -Message \"Using cached eXist-db $env:EXIST_VERSION\"

  cd C:/build/exist-eXist-$env:EXIST_VERSION
}

if ($env:EXIST_VERSION -eq "2.2") {
    & ./tools/wrapper/bin/install.bat
    & ./tools/wrapper/bin/wrapper-windows-x86-64.exe --start ..\conf\wrapper.conf
} else {
    $env:EXIST_PROCESS = Start-Process -NoNewWindow .\bin\startup.bat -PassThru
    sleep 30
}

cd $env:APPVEYOR_BUILD_FOLDER

npm prune
