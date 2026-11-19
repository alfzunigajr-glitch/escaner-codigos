# Escáner de códigos

Página móvil para registrar materiales de bodega y lecturas de medidores. Lee EAN-13 y Code 128 con la cámara y también admite ingreso manual.

## Activar el sitio

En GitHub, abre **Settings → Pages** y elige **Deploy from a branch → main → /(root)**. El enlace que muestra GitHub Pages usa HTTPS, necesario para acceder a la cámara.

## Conectar Google Sheets

1. Crea una hoja de cálculo y abre **Extensiones → Apps Script**.
2. Pega el contenido de `Code.gs`, guarda y ejecuta `configure` desde el editor. Autoriza el acceso solicitado. Se crea la pestaña **Escaneos**.
3. En **Configuración del proyecto → Propiedades de la secuencia de comandos**, copia el valor de `SCAN_TOKEN`.
4. Selecciona **Implementar → Nueva implementación → Aplicación web**. Configura **Ejecutar como yo** y acceso **Cualquier persona**, si tu cuenta lo permite. Copia la URL que termina en `/exec`.
5. Abre el sitio en el celular. En **Conexión con Google Sheets**, ingresa la URL y el token. El token se conserva en el formulario de la página mientras está abierta.
6. Guarda primero un código manual de prueba y verifica que aparezca en **Escaneos**. Luego abre la cámara y escanea un código real.

El sitio confirma cada guardado consultando un identificador aleatorio. Reintentar el mismo registro en la misma página usa ese identificador para evitar filas duplicadas. La aplicación web valida el token en cada escritura. Mantén el token fuera de GitHub y comparte la hoja solo con quienes deban verla.
