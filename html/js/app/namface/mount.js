// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The NAM pedal face: the pedal of a NAM plugin shows the picture of its
 * current model across the whole face, and its name over the printed title. modgui.js hands every GUI event
 * of every plugin to `apply` (through js/namface.js); only the plugins with a
 * NAM model parameter get a plate.
 * @module
 */

import * as model from './model.js'

/** The padding of the backdrop on both sides, in px (namface.css). */
const FRAME_INSET = 20

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
 * @param {HTMLElement} pedal
 * @param {string} cls
 * @returns {HTMLElement|null}
 */
function findChild(pedal, cls) {
    for (const child of Array.from(pedal.children)) {
        if (child.classList.contains(cls)) {
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
 * The picture fills the whole face, under the knobs, the footswitch and the
 * drop-down: it goes first among the children of the pedal.
 * @param {HTMLElement} pedal
 * @param {string|null} image
 */
function renderBackdrop(pedal, image) {
    const old = findChild(pedal, 'nam-face-backdrop')
    if (!model.isImageUrl(image)) {
        if (old) {
            old.remove()
        }
        return
    }
    const backdrop = document.createElement('div')
    backdrop.className = 'nam-face-backdrop'
    backdrop.setAttribute('aria-hidden', 'true')
    const img = document.createElement('img')
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    img.src = /** @type {string} */ (image)
    // A picture that cannot load leaves the face as the plugin drew it.
    img.addEventListener('error', () => backdrop.remove())
    // Fit the longest side: as large as the face allows, never cropped.
    // CSS alone cannot both enlarge a small picture and keep the frame tight
    // around it, so the size is set once the picture is known.
    img.addEventListener('load', () => {
        const size = model.fitSize(img.naturalWidth, img.naturalHeight,
            backdrop.clientWidth - FRAME_INSET, backdrop.clientHeight - FRAME_INSET)
        if (size) {
            img.style.width = size.width + 'px'
            img.style.height = size.height + 'px'
        }
    })
    backdrop.appendChild(img)
    if (old) {
        old.replaceWith(backdrop)
    } else {
        pedal.insertBefore(backdrop, pedal.firstChild)
    }
}

/**
 * The name of the model, over the printed title of the face.
 * @param {HTMLElement} pedal
 * @param {model.Face} face
 */
function renderPlate(pedal, face) {
    const plate = document.createElement('div')
    plate.className = 'nam-face'
    plate.setAttribute('aria-hidden', 'true')
    const title = document.createElement('div')
    title.className = 'nam-face-title'
    title.textContent = face.title
    plate.appendChild(title)
    const line = model.detailLine(face)
    if (line) {
        const detail = document.createElement('div')
        detail.className = 'nam-face-detail'
        detail.textContent = line
        plate.appendChild(detail)
    }
    const old = findChild(pedal, 'nam-face')
    if (old) {
        old.replaceWith(plate)
    } else {
        pedal.appendChild(plate)
    }
}

/**
 * @param {HTMLElement} icon
 * @param {model.Face|null} face
 */
function render(icon, face) {
    const pedal = pedalOf(icon)
    if (!face) {
        pedal.classList.remove('nam-face-on')
        renderBackdrop(pedal, null)
        const old = findChild(pedal, 'nam-face')
        if (old) {
            old.remove()
        }
        return
    }
    addStylesheet()
    pedal.classList.add('nam-face-on')
    renderBackdrop(pedal, face.image)
    renderPlate(pedal, face)
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
