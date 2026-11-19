const form = document.querySelector('#entry');
const camera = document.querySelector('#camera');
const preview = document.querySelector('#preview');
const cameraStatus = document.querySelector('#cameraStatus');
const save = document.querySelector('#save');
const saveStatus = document.querySelector('#saveStatus');
const saveError = document.querySelector('#saveError');
const connection = document.querySelector('#connection');
const endpointInput = document.querySelector('#endpoint');
const tokenInput = document.querySelector('#token');
const code = form.elements.code;

let cameraControls;
let cameraSession = 0;
let scannedCode = '';
let scannedFormat = 'Manual';
let pending;

form.elements.type.addEventListener('change', () => {
  document.querySelector('#amountLabel').textContent =
    form.elements.type.value === 'Medidor' ? 'Lectura' : 'Cantidad';
});

function stopCamera() {
  cameraSession++;
  cameraControls?.stop();
  cameraControls = undefined;
  preview.hidden = true;
  camera.textContent = 'Abrir cámara';
}

camera.addEventListener('click', async () => {
  if (!preview.hidden) {
    stopCamera();
    cameraStatus.textContent = '';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.ZXingBrowser) {
    cameraStatus.textContent = 'La cámara no está disponible. Puedes escribir el código.';
    return;
  }

  const session = ++cameraSession;
  const formats = new Map([[7, 'EAN-13'], [4, 'Code 128']]);
  const reader = new ZXingBrowser.BrowserMultiFormatReader(
    new Map([[2, [...formats.keys()]]])
  );
  preview.hidden = false;
  camera.textContent = 'Cerrar cámara';
  cameraStatus.textContent = 'Apunta al código de barras.';
  try {
    const controls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      preview,
      (result, error, activeControls) => {
        if (session !== cameraSession || !result) return;
        const format = formats.get(result.getBarcodeFormat());
        if (!format) return;

        scannedCode = result.getText();
        scannedFormat = format;
        code.value = scannedCode;
        cameraControls = activeControls;
        stopCamera();
        cameraStatus.textContent = format + ' detectado.';
      }
    );
    if (session === cameraSession) cameraControls = controls;
    else controls.stop();
  } catch {
    if (session !== cameraSession) return;
    stopCamera();
    cameraStatus.textContent = 'No se pudo abrir la cámara. Revisa los permisos o escribe el código.';
  }
});

window.addEventListener('pagehide', stopCamera);

function confirmReceipt(endpoint, id) {
  return new Promise((resolve) => {
    const callback = 'receipt_' + crypto.randomUUID().replaceAll('-', '');
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ id, callback, ts: String(Date.now()) });
    const script = document.createElement('script');
    const timeout = setTimeout(() => settle(false), 6000);

    function settle(saved) {
      clearTimeout(timeout);
      script.remove();
      delete window[callback];
      resolve(saved);
    }

    window[callback] = (result) => settle(result?.saved === true);
    script.onerror = () => settle(false);
    script.src = url.href;
    document.head.append(script);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveStatus.textContent = '';
  saveError.textContent = '';
  const endpoint = endpointInput.value.trim();
  const token = tokenInput.value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint) || !token) {
    connection.open = true;
    saveError.textContent = 'Ingresa la URL /exec de Apps Script y el token.';
    return;
  }

  const data = new FormData(form);
  const value = code.value.trim();
  const quantity = String(data.get('amount')).trim().replace(',', '.');
  const type = data.get('type');
  const operator = String(data.get('operator')).trim();
  if (!value || !operator || !/^\d+(\.\d+)?$/.test(quantity) ||
      !Number.isFinite(Number(quantity)) ||
      (type === 'Bodega' && (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1))) {
    saveError.textContent = 'Completa el código, el usuario y una cantidad entera positiva o una lectura válida.';
    return;
  }
  const payload = {
    sheet: 'Escaneos',
    type,
    code: value,
    format: value === scannedCode ? scannedFormat : 'Manual',
    amount: quantity,
    operator,
    notes: String(data.get('notes')).trim()
  };
  const key = JSON.stringify([endpoint, payload]);
  if (pending?.key !== key) pending = { key, id: crypto.randomUUID() };

  save.disabled = true;
  saveStatus.textContent = 'Guardando registro…';
  try {
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      body: new URLSearchParams({ ...payload, id: pending.id, token }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => {});
    for (let attempt = 0; attempt < 2; attempt++) {
      if (await confirmReceipt(endpoint, pending.id)) {
        pending = undefined;
        code.value = '';
        form.elements.amount.value = '';
        form.elements.notes.value = '';
        scannedCode = '';
        scannedFormat = 'Manual';
        cameraStatus.textContent = '';
        saveStatus.textContent = 'Registro confirmado en Google Sheets.';
        return;
      }
    }
    saveStatus.textContent = '';
    saveError.textContent = 'No se pudo confirmar el registro. Revisa la conexión y vuelve a guardar los mismos datos.';
  } finally {
    save.disabled = false;
  }
});
