/**
 * Mods que el jugador baja a mano desde CurseForge (CURSEFORGE.md §3, 14-oct).
 *
 * ── Por qué ───────────────────────────────────────────────────────────────────
 * Sin la API de CurseForge (y con ella, cuando el autor no permite distribuir),
 * un mod que solo está en CurseForge no se puede bajar automáticamente ni
 * alojar en ningún otro sitio: sería repartir el archivo de otro. Lo que sí se
 * puede —y es lo que hacen los launchers serios— es mandar al jugador a la
 * página OFICIAL del archivo, que lo baje él, y colocarlo nosotros.
 *
 * Un amigo de Enmanuel monta sus packs desde CurseForge y necesita que esto
 * funcione YA, antes de tener la API (pedido 14-oct).
 *
 * ── Cómo ──────────────────────────────────────────────────────────────────────
 * Un módulo del índice con `descargaManual: { pagina }` no se baja: se busca.
 *   1. ¿Ya está en su sitio con su huella (MD5)? Nada que hacer.
 *   2. Si no, se le enseña al jugador con un botón a su página de CurseForge.
 *   3. Se vigila su carpeta de Descargas: un archivo con el mismo tamaño y la
 *      misma huella es ese mod, y se copia a donde va. Otro archivo con el mismo
 *      nombre pero distinta huella NO vale (otra versión, o algo que no es).
 *
 * La huella la puso el creador en Studio a partir de SU copia, así que lo que
 * acaba en el juego del jugador es exactamente lo que probó el creador.
 *
 * Sin Electron en la lógica: se prueba con node a secas. La pantalla va en
 * `pedir()`, que sí usa el DOM.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/** Solo páginas de CurseForge para Minecraft: el enlace viene del índice y se abre en el navegador. */
const PAGINA = /^https:\/\/(www\.)?curseforge\.com\/minecraft\/(mc-mods|texture-packs|shaders|data-packs|customization|modpacks)\/[a-z0-9_-]+(\/(files|download)\/\d+)?\/?$/i
const esPaginaValida = url => PAGINA.test(String(url || ''))

const md5DeArchivo = ruta => crypto.createHash('md5').update(fs.readFileSync(ruta)).digest('hex')

/** ¿El archivo está ya en su sitio, entero y con su huella? */
function estaEnSuSitio(destino, md5, tamano) {
    try {
        const st = fs.statSync(destino)
        if (tamano && st.size !== tamano) return false
        return !md5 || md5DeArchivo(destino) === md5
    } catch (e) {
        return false
    }
}

/**
 * Los que faltan, de entre los módulos de un servidor ya cargado por helios.
 * Cada módulo de helios sabe dónde va (`getPath()`) y guarda lo que vino en el
 * índice (`rawModule`).
 */
function pendientes(modulos) {
    const r = []
    const ver = lista => {
        for (const m of lista || []) {
            const raw = m.rawModule || m
            const manual = raw.descargaManual
            if (manual && esPaginaValida(manual.pagina)) {
                const a = raw.artifact || {}
                const destino = typeof m.getPath === 'function' ? m.getPath() : manual.destino
                if (!estaEnSuSitio(destino, a.MD5, a.size)) {
                    r.push({ id: raw.id, nombre: raw.name || path.basename(destino), archivo: path.basename(a.path || destino),
                        pagina: manual.pagina, destino, md5: a.MD5, tamano: a.size, listo: false })
                }
            }
            ver(m.subModules || raw.subModules)
        }
    }
    ver(modulos)
    return r
}

/**
 * Mira una carpeta (la de Descargas) y coloca los que encuentre.
 * Primero por tamaño —barato— y solo entonces la huella. Devuelve los colocados.
 */
function buscarEn(carpeta, faltan) {
    const colocados = []
    let archivos
    try { archivos = fs.readdirSync(carpeta, { withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(carpeta, e.name)) } catch (e) { return colocados }
    const porTamano = new Map()
    for (const a of archivos) {
        try { const t = fs.statSync(a).size; if (!porTamano.has(t)) porTamano.set(t, []); porTamano.get(t).push(a) } catch (e) { /* desapareció */ }
    }
    for (const f of faltan.filter(x => !x.listo)) {
        for (const candidato of porTamano.get(f.tamano) || []) {
            if (/\.(crdownload|part|tmp)$/i.test(candidato)) continue   // aún bajándose
            if (md5DeArchivo(candidato) !== f.md5) continue
            fs.mkdirSync(path.dirname(f.destino), { recursive: true })
            fs.copyFileSync(candidato, f.destino + '.tmp')
            fs.renameSync(f.destino + '.tmp', f.destino)
            f.listo = true
            colocados.push(f)
            break
        }
    }
    return colocados
}

/**
 * La pantalla: la lista, un botón por mod a su página, y la vigilancia de
 * Descargas. Resuelve true cuando están todos, false si el jugador cancela.
 *
 * @param {Array} faltan          de `pendientes()`
 * @param {object} o
 * @param {string} o.descargas    su carpeta de Descargas
 * @param {Function} o.abrir      abre una dirección en el navegador (shell.openExternal): la vía de respaldo
 * @param {Function} [o.abrirDentro]  (pagina, alBajar, alAvisar) → la página en una ventana del launcher
 *                                    (ventanacurseforge.js); si está, es la vía principal
 */
function pedir(faltan, o) {
    return new Promise(resolver => {
        const el = (tag, clase, hijos) => {
            const n = document.createElement(tag)
            if (clase) n.className = clase
            for (const h of hijos || []) n.appendChild(h)
            return n
        }
        const velo = el('div', null, [el('div', 'dmCaja', [
            el('div', 'dmTitulo'), el('div', 'dmQue'), el('ul', 'dmLista'),
            el('div', 'dmPie', [el('span', 'dmEstado'), el('button', 'dmCancelar')])
        ])])
        velo.id = 'descargaManual'
        velo.firstChild.setAttribute('role', 'dialog')
        velo.firstChild.setAttribute('aria-modal', 'true')
        velo.querySelector('.dmCancelar').type = 'button'
        document.body.appendChild(velo)
        const $ = s => velo.querySelector(s)
        $('.dmTitulo').textContent = faltan.length === 1 ? 'Falta 1 mod que se baja a mano' : 'Faltan ' + faltan.length + ' mods que se bajan a mano'
        $('.dmQue').textContent = 'Sus autores lo piden así: se bajan desde su página de CurseForge. Pulsa «Abrir», dale a ' +
            'Download en la página y no hagas nada más: en cuanto se baje, lo encontramos en tu carpeta de Descargas y lo ponemos en su sitio.'
        $('.dmCancelar').textContent = 'Ahora no'

        // Antes de abrir nada, se explica (Enmanuel, 14-oct): qué va a salir, qué hay que pulsar y por qué.
        let avisado = false
        const aviso = el('div', 'dmAviso', [el('p'), el('div', 'dmPie', [el('button', 'dmSeguir')])])
        aviso.firstChild.textContent = 'A continuación se abre la página oficial de CurseForge dentro del launcher. ' +
            'Solo tienes que pulsar «Download» en esa página: nosotros ponemos el mod en su sitio. Se hace así para ' +
            'respetar las reglas de CurseForge y lo que pidió el autor de cada mod (que su descarga pase por su página).'
        aviso.querySelector('.dmSeguir').textContent = 'Entendido, abrir'
        aviso.hidden = true
        velo.firstChild.insertBefore(aviso, $('.dmLista'))

        /** Lo que se bajó en la ventana: ¿es uno de los que faltan? Si sí, a su sitio. */
        const alBajar = (ruta, nombre) => {
            const md5 = md5DeArchivo(ruta)
            const f = faltan.find(x => !x.listo && x.md5 === md5)
            if (!f) {
                const esperado = faltan.find(x => !x.listo && x.archivo === path.basename(nombre))
                return { ok: false, mensaje: esperado
                    ? 'Ese «' + nombre + '» no es exactamente el que usa el modpack (otra versión). En la página, busca el archivo de la versión correcta.'
                    : 'Ese archivo no es ninguno de los que faltan.' }
            }
            fs.mkdirSync(path.dirname(f.destino), { recursive: true })
            fs.copyFileSync(ruta, f.destino + '.tmp')
            fs.renameSync(f.destino + '.tmp', f.destino)
            f.listo = true
            pintar()
            if (faltan.every(x => x.listo)) setTimeout(() => terminar(true), 700)
            return { ok: true }
        }
        const alAvisar = m => { $('.dmEstado').textContent = m }
        const abrirUno = f => {
            if (!esPaginaValida(f.pagina)) return Promise.resolve({ ok: false })
            f.abierto = true
            pintar()
            if (o.abrirDentro) return Promise.resolve(o.abrirDentro(f.pagina, alBajar, alAvisar))
            o.abrir(f.pagina)
            return Promise.resolve({ ok: false, motivo: 'navegador' })
        }

        /**
         * «Bajar todos» (Enmanuel, 14-oct): de uno en uno — se abre, se baja solo, ✓, se cierra, el siguiente.
         * El que falla pasa al final; tras una segunda vuelta queda con su botón para intentarlo a mano.
         */
        let enMarcha = false
        const bajarTodos = async () => {
            if (enMarcha || !o.abrirDentro) return
            enMarcha = true
            pintar()
            const cola = faltan.filter(f => !f.listo)
            const vueltas = new Map()
            while (cola.length) {
                const f = cola.shift()
                if (f.listo) continue
                f.bajando = true
                f.fallo = false
                pintar()
                alAvisar('Bajando ' + f.nombre + '…')
                const r = await abrirUno(f)
                f.bajando = false
                if (!f.listo) {
                    const n = (vueltas.get(f) || 0) + 1
                    vueltas.set(f, n)
                    if (r && r.motivo === 'cerrada') break   // cerró la ventana: se para, no se le insiste
                    if (n < 2) cola.push(f)                  // al final de la cola, otra vuelta
                    else f.fallo = true
                }
                pintar()
            }
            enMarcha = false
            pintar()
        }

        const pintar = () => {
            const lista = $('.dmLista')
            lista.textContent = ''
            for (const f of faltan) {
                const li = document.createElement('li')
                li.className = f.listo ? 'listo' : f.fallo ? 'fallo' : f.bajando ? 'bajando' : ''
                const nombre = document.createElement('span')
                nombre.className = 'dmNombre'
                nombre.textContent = (f.listo ? '✓ ' : f.bajando ? '⏳ ' : f.fallo ? '⚠ ' : '') + f.nombre
                li.appendChild(nombre)
                if (!f.listo && !enMarcha) {
                    const b = document.createElement('button')
                    b.type = 'button'
                    b.textContent = f.abierto ? 'Abrir otra vez' : 'Abrir'
                    b.onclick = () => {
                        if (avisado) return abrirUno(f)
                        aviso.hidden = false
                        aviso.querySelector('.dmSeguir').onclick = () => { avisado = true; aviso.hidden = true; abrirUno(f) }
                    }
                    li.appendChild(b)
                }
                lista.appendChild(li)
            }
            const quedan = faltan.filter(f => !f.listo).length
            if (!enMarcha) $('.dmEstado').textContent = quedan ? 'Faltan ' + quedan + '.' : '¡Listos todos!'
            // El botón grande: los baja todos, de uno en uno. Solo con la ventana propia (sin ella no se ve el ✓).
            todos.hidden = !o.abrirDentro || enMarcha || !quedan
        }

        const todos = el('button', 'dmTodos')
        todos.type = 'button'
        todos.textContent = 'Bajar todos, uno por uno'
        todos.onclick = () => {
            if (avisado) return bajarTodos()
            aviso.hidden = false
            aviso.querySelector('.dmSeguir').onclick = () => { avisado = true; aviso.hidden = true; bajarTodos() }
        }
        // Junto a «Ahora no», en SU pie. Con `$('.dmPie')` salía el del aviso (va antes en la ventana), insertBefore
        // fallaba y la ventana se quedaba sin lista ni botones (22-oct, prueba real: 20 mods sin forma de bajarlos).
        $('.dmCancelar').before(todos)

        // Con la ventana propia, el aviso sale de entrada y desde él se empieza: leer, pulsar, y se bajan solos.
        // La autorización se recuerda (Enmanuel, 14-oct: «al darle a jugar, que con un clic todo funcione»): la
        // primera vez hace falta, porque abrir ventanas sin explicar asusta; después, empieza solo y dice qué hace.
        const RECUERDO = 'maguet.descargaManualAutorizada'
        const yaAutorizo = () => { try { return localStorage.getItem(RECUERDO) === '1' } catch (e) { return false } }
        const autorizar = () => { try { localStorage.setItem(RECUERDO, '1') } catch (e) { /* solo no se recuerda */ } }
        if (o.abrirDentro) {
            if (yaAutorizo()) {
                avisado = true
                alAvisar('Bajando los mods de CurseForge desde su página oficial, uno por uno…')
                setTimeout(bajarTodos, 400)
            } else {
                aviso.hidden = false
                aviso.querySelector('.dmSeguir').textContent = 'Entendido, bajar todos'
                aviso.querySelector('.dmSeguir').onclick = () => { autorizar(); avisado = true; aviso.hidden = true; bajarTodos() }
            }
        }

        let reloj = null
        const terminar = ok => { clearInterval(reloj); velo.remove(); resolver(ok) }
        $('.dmCancelar').onclick = () => terminar(false)
        reloj = setInterval(() => {
            try {
                if (buscarEn(o.descargas, faltan).length) pintar()
                if (faltan.every(f => f.listo)) setTimeout(() => terminar(true), 700)
            } catch (err) {
                console.warn('[Descarga manual] No pude mirar tu carpeta de Descargas:', err.message)
            }
        }, 1500)
        pintar()
    })
}

module.exports = { pendientes, buscarEn, pedir, esPaginaValida, estaEnSuSitio }
