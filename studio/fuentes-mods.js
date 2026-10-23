/**
 * De dónde sale cada mod de un pack, leyendo SOLO su índice publicado (23-oct, cola 189).
 *
 * Preparar el servidor necesitaba el pack en el disco (el .mrpack de Modrinth o la carpeta de la instancia). Un pack
 * de CurseForge, o mixto como El Portal, traído de la API no lo tiene, y daba «No encuentro el archivo». Enmanuel: «no
 * le puedo dar error al preparar eso… cuando sea un mixto… de CurseForge, de Modrinth y propios de la persona». El
 * índice ya dice de dónde sale cada uno, en este orden de preferencia:
 *
 *   modrinth    su CDN (cdn.modrinth.com): se baja y se comprueba con su huella
 *   curseforge  `descargaManual.pagina`: NUNCA se baja ni se mete en un zip (sus condiciones); se abre su página
 *               oficial y la persona pulsa Download (descargar-mods.ps1 lo recoge y lo comprueba)
 *   creador     lo que aloja él (su GitHub, o Maguet): se baja y se comprueba
 *
 * Al montar, lo que estaba en Modrinth (por su huella) ya quedó con la dirección de Modrinth (desde-carpeta.js): un mod
 * con página de CurseForge es porque no está en Modrinth.
 */
const path = require('path')

const TIPOS_MOD = ['FabricMod', 'ForgeMod']
const CARPETAS_SERVIDOR = ['config/', 'defaultconfigs/', 'kubejs/', 'scripts/']
const MD5 = /^[a-f0-9]{32}$/i

/** 'modrinth' | 'curseforge' | 'creador', o null si no hay de dónde sacarlo. */
function fuenteDe(m) {
    const a = m.artifact || {}
    if (m.descargaManual && /^https:\/\/www\.curseforge\.com\//.test(String(m.descargaManual.pagina || ''))) return 'curseforge'
    if (/^https:\/\/cdn\.modrinth\.com\/data\/[A-Za-z0-9]+\//.test(String(a.url || ''))) return 'modrinth'
    if (/^https:\/\/[^\s]+$/.test(String(a.url || ''))) return 'creador'
    return null
}

/** Un nombre de archivo que se pueda escribir en cualquier sistema, sin salirse de su carpeta. */
function archivoSeguro(ruta) {
    const n = path.posix.basename(String(ruta || '').replace(/\\/g, '/'))
    return n && n !== '.' && n !== '..' && !/[<>:"|?*\u0000-\u001f]/.test(n) ? n : null
}

/**
 * Los mods del pack (los de primer nivel), con su fuente.
 * @returns {Array<{ archivo, nombre, fuente, url, pagina, md5, tamano, proyecto }>}
 */
function modsDelIndice(servidor) {
    const salida = []
    for (const m of (servidor && servidor.modules) || []) {
        if (!TIPOS_MOD.includes(m.type)) continue
        const a = m.artifact || {}
        const archivo = archivoSeguro(a.path)
        const fuente = fuenteDe(m)
        if (!archivo || !fuente) continue
        salida.push({
            archivo,
            nombre: m.name || archivo,
            fuente,
            url: fuente === 'curseforge' ? null : a.url,
            pagina: fuente === 'curseforge' ? m.descargaManual.pagina : null,
            md5: MD5.test(String(a.MD5 || '')) ? String(a.MD5).toLowerCase() : null,
            tamano: Number(a.size) || 0,
            proyecto: (/^https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\//.exec(String(a.url || '')) || [])[1] || null
        })
    }
    return salida
}

/**
 * Los que van al servidor. Fuera, los que Modrinth dice que son solo de cliente; los demás van (sin el archivo no se
 * puede leer su lado, y uno de menos tira el servidor: la misma regla que separar-servidor.js con los que no lo dicen).
 * @param {Function} porProyecto  ids → Map(id → 'cliente'|'servidor'|'ambos') (lado-en-plataforma.js)
 */
async function paraServidor(mods, { porProyecto }) {
    let lados = new Map()
    const ids = mods.map(m => m.proyecto).filter(Boolean)
    if (ids.length) { try { lados = await porProyecto(ids) } catch (e) { lados = new Map() } }
    const van = [], fuera = []
    for (const m of mods) (m.proyecto && lados.get(m.proyecto) === 'cliente' ? fuera : van).push(m)
    return { van, fuera, sinComprobar: van.filter(m => !m.proyecto || !lados.has(m.proyecto)) }
}

/** Las configuraciones que también necesita el servidor (config/, defaultconfigs/, kubejs/, scripts/). */
function configsDelIndice(servidor) {
    const salida = []
    for (const m of (servidor && servidor.modules) || []) {
        const a = m.artifact || {}
        const ruta = String(a.path || '').replace(/\\/g, '/')
        if (m.type !== 'File' || !CARPETAS_SERVIDOR.some(c => ruta.startsWith(c))) continue
        if (ruta.split('/').some(t => t === '..' || t === '') || !/^https:\/\//.test(String(a.url || ''))) continue
        salida.push({ ruta, url: a.url, md5: MD5.test(String(a.MD5 || '')) ? String(a.MD5).toLowerCase() : null })
    }
    return salida
}

module.exports = { fuenteDe, modsDelIndice, paraServidor, configsDelIndice, archivoSeguro }
