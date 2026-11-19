const form = document.querySelector('#entry');
const camera = document.querySelector('#camera');
const preview = document.querySelector('#preview');
const cameraStatus = document.querySelector('#cameraStatus');
const save = document.querySelector('#save');
const saveStatus = document.querySelector('#saveStatus');
const saveError = document.querySelector('#saveError');
const code = form.elements.code;
const SHEETS_APP = 'https://script.google.com/macros/s/AKfycbzxvkzzhn-zs0FssvbrMXo-tHQDbmDpVr7AJtkazFK9lXQ05OwjX8nOn3TbLSSUxhry5w/exec';

// La conexión se gestiona con la sesión de Google. No se solicitan credenciales en el escáner.
try { localStorage.removeItem('escaner-codigos.connection.v1'); } catch {}

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

function isGoogleBridge(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === 'script.google.com' ||
      url.hostname === 'script.googleusercontent.com' || url.hostname.endsWith('-script.googleusercontent.com'));
  } catch { return false; }
}

function saveWithGoogle(payload) {
  return new Promise((resolve, reject) => {
    const session = crypto.randomUUID();
    const url = new URL(SHEETS_APP);
    url.search = new URLSearchParams({mode:'bridge',session});
    let popup;
    let bridgeSource;
    let bridgeOrigin;
    let closedTimer;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('La conexión con Google tardó demasiado. Inicia sesión en la ventana de Google y vuelve a guardar.')), 90000);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(closedTimer);
      window.removeEventListener('message', onMessage);
      if (popup && !popup.closed) popup.close();
      if (error) reject(error);
      else resolve(result);
    }

    function onMessage(event) {
      const message = event.data;
      if (!isGoogleBridge(event.origin) || message?.session !== session) return;
      if (message.kind === 'scanner-ready') {
        if (bridgeSource && event.source !== bridgeSource) return;
        bridgeSource = event.source;
        bridgeOrigin = event.origin;
        bridgeSource.postMessage({kind:'scanner-save',session,payload},bridgeOrigin);
      } else if (message.kind === 'scanner-result' && event.source === bridgeSource &&
                 event.origin === bridgeOrigin && message.id === payload.id) {
        if (message.saved) finish(null, message);
        else finish(new Error(message.error || 'Google no pudo guardar el registro. Revisa los datos y vuelve a guardar.'));
      }
    }

    window.addEventListener('message', onMessage);
    popup = window.open(url.href, 'escanerSheets', 'popup,width=540,height=640');
    if (!popup) {
      finish(new Error('Permite las ventanas emergentes de esta app para guardar con tu cuenta de Google.'));
      return;
    }
    closedTimer = setInterval(() => {
      if (popup.closed) finish(new Error('Se cerró la ventana de Google. Vuelve a guardar los mismos datos.'));
    }, 700);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (save.disabled) return;
  saveStatus.textContent = '';
  saveError.textContent = '';
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
    sheet:'Escaneos', type, code:value,
    format:value === scannedCode ? scannedFormat : 'Manual',
    amount:quantity, operator, notes:String(data.get('notes')).trim()
  };
  const key = JSON.stringify(payload);
  if (pending?.key !== key) pending = {key,id:crypto.randomUUID()};
  save.disabled = true;
  saveStatus.textContent = 'Guardando en Google Sheets…';
  try {
    await saveWithGoogle({...payload,id:pending.id});
    pending = undefined;
    code.value = '';
    form.elements.amount.value = '';
    form.elements.notes.value = '';
    scannedCode = '';
    scannedFormat = 'Manual';
    cameraStatus.textContent = '';
    saveStatus.textContent = 'Registro confirmado en Google Sheets.';
  } catch (error) {
    saveStatus.textContent = '';
    saveError.textContent = error.message || 'No se pudo guardar. Vuelve a guardar los mismos datos.';
  } finally {
    save.disabled = false;
  }
});
