/**
 * La página oficial de CurseForge, dentro de una ventana del launcher (14-oct).
 *
 * Enmanuel quería que el mod se bajara «sin abrir el navegador». Bajarlo por
 * detrás, sin pasar por la página, es justo lo que CurseForge y el autor no
 * permiten (CURSEFORGE.md). Lo que sí: la página de DESCARGA de ese archivo en
 * curseforge.com empieza a bajarlo sola a los pocos segundos (con su
 * publicidad, que es lo que el autor quiere). El launcher abre esa página, la
 * deja hacer, atrapa la descarga, comprueba la huella y la coloca.
 *
 * ── Dos modos (23-oct) ────────────────────────────────────────────────────────
 * `PIDE_CLIC = false` (el de ahora): la página de descarga, que baja sola.
 * `PIDE_CLIC = true`: la página del ARCHIVO (`…/files/<id>`), donde la persona
 * pulsa «Download», como hace Prism. Enmanuel: «lancemos sin clic, pero que
 * quede guardado para cuando quiera volver al clic de Download». Cambiar este
 * valor es lo único que hace falta; las pruebas cubren los dos.
 *
 * ── Uno por uno, sin desastres (Enmanuel, 14-oct) ─────────────────────────────
 * Se abre UNA ventana, se espera; si la descarga no arranca, se recarga la
 * página (pocas veces); si sale bien, se cierra sola. Quien llama va abriendo
 * la siguiente. Nada de veinte ventanas a la vez.
 *
 * ── Encerrada, y sin nada que asuste a Windows ────────────────────────────────
 *   - Su propia sesión (`partition`): ni cookies ni datos del launcher.
 *   - Sin Node, aislada y en sandbox: es una página de fuera.
 *   - Solo navega por curseforge.com y su servidor de archivos. Ningún otro
 *     enlace, ninguna ventana nueva.
 *   - La descarga va a una carpeta temporal y se copia a la del juego: lo mismo
 *     que hace cualquier descarga, sin permisos especiales.
 */
const path = require('path')
const os = require('os')
const fs = require('fs')

const PERMITIDO = /^https:\/\/([a-z0-9-]+\.)*(curseforge\.com|forgecdn\.net)\//i

/** false: la página de descarga baja sola. true: la persona pulsa «Download» (ver arriba). */
const PIDE_CLIC = false

/**
 * Qué página se abre. Sin clic: la de DESCARGA (`…/download/<id>`), que baja sola. Con clic: la del ARCHIVO
 * (`…/files/<id>`), donde la persona pulsa «Download». Con solo la página del mod (sin archivo), esa: la persona elige.
 */
function paginaDeDescarga(pagina, conClic = PIDE_CLIC) {
    const m = /^(https:\/\/(www\.)?curseforge\.com\/minecraft\/[a-z-]+\/[a-z0-9_-]+)\/(files|download)\/(\d+)\/?$/i.exec(String(pagina || ''))
    if (!m) return { url: pagina, automatica: false }
    return conClic ? { url: m[1] + '/files/' + m[4], automatica: false } : { url: m[1] + '/download/' + m[4], automatica: true }
}

/**
 * La página de un proyecto por su NÚMERO (15-oct). El zip que exporta CurseForge trae `projectID` y `fileID`, no el
 * nombre del mod en la dirección: curseforge.com/projects/<n> redirige a /minecraft/<tipo>/<nombre>. Probado en una
 * ventana real (en `curl` da 403: Cloudflare solo deja pasar navegadores).
 */
function paginaDelProyecto(projectID) {
    const n = Number(projectID)
    if (!Number.isInteger(n) || n <= 0) throw new Error('Número de proyecto de CurseForge no válido: ' + projectID)
    return 'https://www.curseforge.com/projects/' + n
}

/** De la página de un proyecto, su tipo (mc-mods, texture-packs, shaders…) y su dirección. null si no es una. */
function proyectoDe(url) {
    const m = /^(https:\/\/www\.curseforge\.com\/minecraft\/([a-z-]+)\/[a-z0-9_-]+)\/?(\?.*)?$/i.exec(String(url || ''))
    return m ? { pagina: m[1], tipo: m[2].toLowerCase() } : null
}

/**
 * Abre la página y espera UNA descarga buena.
 *
 * @param {object} remote        @electron/remote — o, desde el proceso principal de Studio, cualquier objeto con
 *                               { BrowserWindow, session, getCurrentWindow } (15-oct)
 * @param {string|{projectID,fileID}} pagina  la página del archivo (ya validada con esPaginaValida), o el número
 *                               del proyecto y del archivo, como vienen en el manifest.json del zip
 * @param {Function} alBajar     (rutaTemporal, nombre, proyecto) → { ok, mensaje } (o su promesa)  decide si vale y la
 *                               coloca; el archivo temporal se borra cuando contesta
 * @param {Function} [alAvisar]  (mensaje) → se enseña en el LAUNCHER, no en la página de CurseForge
 * @param {object} [o]           { espera: ms por intento (automática), intentos, conClic (por defecto PIDE_CLIC) }
 * @returns {Promise<{ok:boolean, motivo?:string, pagina?:string, tipo?:string}>}  al cerrarse la ventana. Con
 *                               número: `pagina` es la de ese archivo (…/files/<id>) y `tipo` el del proyecto.
 */
function abrir(remote, pagina, alBajar, alAvisar, o = {}) {
    const porNumero = pagina && typeof pagina === 'object'
    let proyecto = null   // { pagina, tipo } cuando se resuelve el número
    const conClic = o.conClic === undefined ? PIDE_CLIC : !!o.conClic
    const destino = porNumero
        ? { url: paginaDelProyecto(pagina.projectID), automatica: !conClic }
        : paginaDeDescarga(pagina, conClic)
    const espera = o.espera || 45000
    const intentos = o.intentos || 3
    return new Promise(resolver => {
        const { BrowserWindow, session } = remote
        const PARTICION = 'curseforge-descargas'
        const ses = session.fromPartition(PARTICION)
        const ventana = new BrowserWindow({
            parent: remote.getCurrentWindow ? remote.getCurrentWindow() : undefined, width: 1100, height: 820, autoHideMenuBar: true,
            title: destino.automatica ? 'CurseForge — la descarga empieza sola' : 'CurseForge — pulsa «Download»',
            webPreferences: { partition: PARTICION, nodeIntegration: false, contextIsolation: true, sandbox: true }
        })
        const contenido = ventana.webContents
        contenido.on('will-navigate', (e, url) => { if (!PERMITIDO.test(url)) e.preventDefault() })
        contenido.on('will-redirect', (e, url) => { if (!PERMITIDO.test(url)) e.preventDefault() })
        contenido.setWindowOpenHandler(({ url }) => {
            if (PERMITIDO.test(url)) contenido.loadURL(url)
            return { action: 'deny' }
        })
        // Por número (zip de CurseForge): /projects/<n> redirige a la página del proyecto; en cuanto llega, se va
        // a la página de descarga de ESE archivo. Cloudflare puede tardar unos segundos la primera vez.
        if (porNumero) {
            contenido.on('did-navigate', (e, url) => {
                if (proyecto) return
                const p = proyectoDe(url)
                if (!p) return
                proyecto = p
                contenido.loadURL(p.pagina + (conClic ? '/files/' : '/download/') + Number(pagina.fileID)).catch(() => {})
            })
        }

        let resultado = { ok: false, motivo: 'cerrada' }
        let intento = 1
        let bajando = false
        let reloj = null
        let actual = null, ultimoAvance = 0
        // Si en un rato no empezó a bajar, se recarga; tras varios intentos, se deja para el final.
        const vigilar = () => {
            clearTimeout(reloj)
            // Con clic (o sin archivo concreto): hasta que la persona pulse, sin prisa. Una descarga ya empezada sí se vigila.
            if (!destino.automatica && !bajando) return
            reloj = setTimeout(() => {
                if (ventana.isDestroyed()) return
                // Empezó y se quedó parada (22-oct, prueba real: Cobweb, 9 min en «Downloading…»). Antes, con una
                // descarga en marcha se dejaba de vigilar y el launcher esperaba para siempre. Sin un byte en `espera`
                // ms, se cancela: su `done` vuelve a vigilar y se recarga, como si no hubiera arrancado.
                if (bajando) {
                    if (Date.now() - ultimoAvance < espera) return vigilar()
                    if (!destino.automatica) {
                        // Con clic no se recarga: se le pide que pulse otra vez, y tras varias, se deja para el final.
                        if (intento >= intentos) { resultado = { ok: false, motivo: 'la descarga se quedó parada ' + intentos + ' veces' }; if (actual) actual.cancel(); return ventana.close() }
                        intento++
                        if (alAvisar) alAvisar('La descarga se quedó parada; pulsa «Download» otra vez…')
                        return actual && actual.cancel()
                    }
                    if (alAvisar) alAvisar('La descarga se quedó parada; lo intento otra vez…')
                    return actual && actual.cancel()
                }
                if (intento >= intentos) {
                    resultado = { ok: false, motivo: 'no empezó a bajar tras ' + intentos + ' intentos' }
                    return ventana.close()
                }
                intento++
                if (alAvisar) alAvisar('No arrancó la descarga; recargo la página (intento ' + intento + ' de ' + intentos + ')…')
                contenido.reload()
                vigilar()
            }, espera)
        }

        const alDescargar = (evento, item) => {
            if (item.getURL() && !PERMITIDO.test(item.getURL())) { item.cancel(); return }
            bajando = true
            actual = item
            ultimoAvance = Date.now()
            item.on('updated', () => { ultimoAvance = Date.now() })
            vigilar()
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'))
            item.setSavePath(path.join(tmp, path.basename(item.getFilename())))
            item.once('done', async (e, estado) => {
                bajando = false
                let r = { ok: false, mensaje: 'La descarga se cortó.' }
                if (estado === 'completed') {
                    // Puede contestar más tarde (22-oct): en el launcher decide la ventana, por IPC (descargacurseforge.js).
                    try { r = await alBajar(item.getSavePath(), item.getFilename(), proyecto) } catch (err) { r = { ok: false, mensaje: err.message } }
                }
                fs.rmSync(tmp, { recursive: true, force: true })
                if (r.ok) {
                    resultado = proyecto
                        ? { ok: true, pagina: proyecto.pagina + '/files/' + Number(pagina.fileID), tipo: proyecto.tipo }
                        : { ok: true }
                    if (!ventana.isDestroyed()) ventana.close()
                } else {
                    if (alAvisar) alAvisar(r.mensaje)
                    vigilar()   // otra oportunidad: puede elegir el archivo bueno o se recarga
                }
            })
        }
        ses.on('will-download', alDescargar)
        ventana.on('closed', () => { clearTimeout(reloj); ses.removeListener('will-download', alDescargar); resolver(resultado) })
        ventana.loadURL(destino.url)
        vigilar()
    })
}

module.exports = { abrir, paginaDeDescarga, paginaDelProyecto, proyectoDe, PERMITIDO, PIDE_CLIC }
