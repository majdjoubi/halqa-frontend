@echo off
echo Copying Halqa logo as favicon...

REM Copy logo.png as favicon to src directory
copy /Y "src\assets\images\logo.png" "src\favicon.png" >nul

echo.
echo ✓ Favicon updated successfully!
echo.
echo The logo has been copied as favicon.png
echo.
echo To apply changes:
echo 1. Stop the development server (Ctrl+C)
echo 2. Clear browser cache (Ctrl+Shift+R)
echo 3. Restart server: npm start or ng serve
echo.

pause
