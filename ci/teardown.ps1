cd C:/build/exist-eXist-$env:EXIST_VERSION

& ./tools/wrapper/bin/wrapper-windows-x86-64.exe --stop ..\conf\wrapper.conf

& ./build.bat clean-default-data-dir

Remove-Item -Recurse -Force webapp/WEB-INF/logs/*
