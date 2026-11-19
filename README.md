# Escáner de códigos

Escáner móvil de EAN-13 y Code 128 para registrar materiales de bodega y lecturas de medidores en Google Sheets.

## Uso

1. Abre https://alfzunigajr-glitch.github.io/escaner-codigos/
2. Escanea o escribe el código y completa tipo, cantidad o lectura, usuario y notas.
3. Pulsa **Guardar en Google Sheets**. La app abre una ventana de Google para guardar y la cierra cuando el servidor confirma el registro.
4. Si Google solicita inicio de sesión, usa la cuenta propietaria de la hoja. Permite las ventanas emergentes para este sitio.

La app no solicita URL ni token. La hoja conserva su acceso privado. La sesión de Google autoriza cada guardado; no se publica ninguna credencial en GitHub.

## Configuración de administración

- Proyecto de Apps Script vinculado a la hoja: pegar Code.gs y ejecutar configure.
- Implementación web: **Ejecutar como yo**, acceso **Solo yo**.
- SHEETS_APP en app.js apunta a la URL /exec existente.
- Google restringe el acceso a la implementación a la cuenta propietaria; saveScan no solicita permisos adicionales de identidad.
- Los reintentos del mismo registro usan el mismo ID para evitar duplicados.
- La cámara permanece en GitHub Pages; el guardado se ejecuta desde la ventana de Google con google.script.run.
