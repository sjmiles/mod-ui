// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The pure part of the NAM pedal face: which parameter holds the model, and
 * which model an event of the plugin GUI is about. No DOM and no network here.
 * @module
 */

/** The file type of NAM models, as the NAM plugin declares it (mod:fileTypes). */
export const FILETYPE = 'nammodel'

/**
 * @typedef {object} Face
 * @property {string} title
 * @property {string|null} detail
 * @property {string|null} size
 * @property {string|null} image
 * @property {Credit|null} [tone3000] Set when the model came from TONE3000.
 */

/**
 * @typedef {object} Credit
 * @property {string|null} creator
 * @property {string|null} license
 * @property {string|null} url
 */

/**
 * The URI of the writable parameter that takes NAM models, or null for a
 * plugin that has none.
 * @param {any} effect The plugin data of the legacy GUI.
 * @returns {string|null}
 */
export function modelParameterUri(effect) {
    const parameters = (effect && effect.parameters) || []
    for (const p of parameters) {
        if (p && p.writable !== false && p.valid !== false
            && Array.isArray(p.fileTypes) && p.fileTypes.indexOf(FILETYPE) >= 0) {
            return p.uri
        }
    }
    return null
}

/**
 * The model path that a GUI event sets, '' when it clears the model, or null
 * when the event is about something else.
 * @param {any} event An event of GUI.triggerJS in modgui.js.
 * @param {string} uri The model parameter.
 * @returns {string|null}
 */
export function modelPathOf(event, uri) {
    if (!event) {
        return null
    }
    if (event.type === 'start') {
        const found = (event.parameters || []).find((/** @type {any} */ p) => p && p.uri === uri)
        return found ? (typeof found.value === 'string' ? found.value : '') : null
    }
    if (event.type === 'change' && event.uri === uri) {
        return typeof event.value === 'string' ? event.value : ''
    }
    return null
}

/**
 * The line under the title: the capture and its size, then who made a
 * TONE3000 tone and its license (the API terms want both kept with the tone).
 * @param {Face} face
 * @returns {string}
 */
export function detailLine(face) {
    const credit = face.tone3000 || null
    return [
        face.detail,
        face.size,
        credit && credit.creator ? 'by ' + credit.creator : null,
        credit ? credit.license : null,
    ].filter(Boolean).join(' · ')
}

/**
 * Only pictures from the device or over https go on the board.
 * @param {string|null} url
 * @returns {boolean}
 */
export function isImageUrl(url) {
    return typeof url === 'string' && (url.startsWith('/nam/image?') || url.startsWith('https://'))
}

