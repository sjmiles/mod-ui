// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The NAM pedal face: a plate on the pedal of a NAM plugin that shows the
 * picture and the name of its current model. modgui.js hands every GUI event
 * of every plugin to `apply` (through js/namface.js); only the plugins with a
 * NAM model parameter get a plate.
 * @module
 */

import * as model from './model.js'

function addStylesheet() {
    if (document.querySelector('link[data-namface]')) {
        return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.type = 'text/css'
    link.href = new URL('./namface.css', import.meta.url).href
    link.setAttribute('data-namface', '1')
    document.head.appendChild(link)
}

/**
 * @param {HTMLElement} icon
 * @returns {HTMLElement|null}
 */
function findPlate(icon) {
    for (const child of Array.from(icon.children)) {
        if (child.classList.contains('nam-face')) {
            return /** @type {HTMLElement} */ (child)
        }
    }
    return null
}

/**
 * The element the plugin's own template drew: the pedal inside the wrapper
 * that the board makes for each plugin.
 * @param {HTMLElement} icon
 * @returns {HTMLElement}
 */
function pedalOf(icon) {
    return /** @type {HTMLElement|null} */ (icon.querySelector('.mod-pedal')) || icon
}

/**
 * @param {HTMLElement} icon
 * @param {model.Face|null} face
 */
function render(icon, face) {
    const pedal = pedalOf(icon)
    const old = findPlate(pedal)
    if (!face) {
        if (old) {
            old.remove()
        }
        return
    }
    addStylesheet()
    const plate = document.createElement('div')
    plate.className = 'nam-face'
    plate.setAttribute('aria-hidden', 'true')
    if (model.isImageUrl(face.image)) {
        const img = document.createElement('img')
        img.className = 'nam-face-image'
        img.alt = ''
        img.referrerPolicy = 'no-referrer'
        img.src = /** @type {string} */ (face.image)
        // A picture that cannot load leaves the name alone on the plate.
        img.addEventListener('error', () => img.remove())
        plate.appendChild(img)
    }
    const text = document.createElement('div')
    text.className = 'nam-face-text'
    const title = document.createElement('div')
    title.className = 'nam-face-title'
    title.textContent = face.title
    text.appendChild(title)
    const line = model.detailLine(face)
    if (line) {
        const detail = document.createElement('div')
        detail.className = 'nam-face-detail'
        detail.textContent = line
        text.appendChild(detail)
    }
    plate.appendChild(text)
    if (old) {
        old.replaceWith(plate)
    } else {
        pedal.appendChild(plate)
    }
}

/**
 * Takes one event of a plugin GUI (GUI.triggerJS in modgui.js).
 * @param {any} gui The legacy GUI object.
 * @param {any} event
 */
export function apply(gui, event) {
    const icon = gui && gui.icon && gui.icon[0]
    // Only pedals on the board, not the previews of the plugin bar.
    if (!(icon instanceof HTMLElement) || !icon.hasAttribute('mod-instance')) {
        return
    }
    if (gui.namFaceUri === undefined) {
        gui.namFaceUri = model.modelParameterUri(gui.effect)
    }
    if (!gui.namFaceUri) {
        return
    }
    const path = model.modelPathOf(event, gui.namFaceUri)
    if (path === null || icon.dataset.namFacePath === path) {
        return
    }
    icon.dataset.namFacePath = path
    if (!path) {
        render(icon, null)
        return
    }
    fetch('/nam/face?path=' + encodeURIComponent(path), { cache: 'no-store' })
        .then((resp) => resp.json())
        .then((resp) => {
            // Another model was chosen while this one loaded.
            if (icon.dataset.namFacePath === path) {
                render(icon, resp && resp.ok ? resp.face : null)
            }
        }, () => { /* the plate is a help, not a need */ })
}
