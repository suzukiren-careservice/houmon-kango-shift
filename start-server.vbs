Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -WindowStyle Hidden -Command ""Start-Process -FilePath 'C:\Program Files\Git\usr\bin\perl.exe' -ArgumentList 'C:\Users\r-suzuki\OneDrive\デスクトップ\Claude\serve.pl','C:\Users\r-suzuki\OneDrive\デスクトップ\Claude' -WindowStyle Hidden""", 0, False
