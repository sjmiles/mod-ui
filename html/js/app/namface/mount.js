// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The NAM pedal face: the pedal of a NAM plugin grows taller and shows the
 * picture of its current model above its controls, and its name at the top. modgui.js hands every GUI event
 * of every plugin to `apply` (through js/namface.js); only the plugins with a
 * NAM model parameter get a plate.
 * @module
 */

import * as model from './model.js'
import { redrawJacks } from './legacy.js'

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
 * With a picture, the pedal grows taller: the picture gets the top of the
 * face and the controls move down (namface.css). The jacks move with them,
 * so the cables are drawn again.
 * @param {HTMLElement} icon
 * @param {HTMLElement} pedal
 * @param {boolean} on
 */
function setTall(icon, pedal, on) {
    if (pedal.classList.contains('nam-face-tall') === on) {
        return
    }
    pedal.classList.toggle('nam-face-tall', on)
    // The board copies the size of the pedal to its wrapper on its own
    // timer; the cables follow the jacks, which moved now.
    window.requestAnimationFrame(() => redrawJacks(icon))
    window.setTimeout(() => redrawJacks(icon), 600)
}

/**
 * The picture, in its own area above the controls of a tall face, or behind
 * them on the face of another plugin. It goes first among the children of
 * the pedal.
 * @param {HTMLElement} icon
 * @param {HTMLElement} pedal
 * @param {string|null} image
 */
function renderBackdrop(icon, pedal, image) {
    const old = findChild(pedal, 'nam-face-backdrop')
    if (!model.isImageUrl(image)) {
        if (old) {
            old.remove()
        }
        setTall(icon, pedal, false)
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
    img.addEventListener('error', () => {
        backdrop.remove()
        setTall(icon, pedal, false)
    })
    // Fit the longest side, keeping the shape of the picture: namface.css
    // sizes the picture from its ratio, which is known once it loads. Until
    // then it stays hidden, so it never shows stretched.
    img.addEventListener('load', () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            img.style.setProperty('--nam-ratio', String(img.naturalWidth / img.naturalHeight))
            img.classList.add('nam-face-loaded')
        }
    })
    backdrop.appendChild(img)
    if (old) {
        old.replaceWith(backdrop)
    } else {
        pedal.insertBefore(backdrop, pedal.firstChild)
    }
    setTall(icon, pedal, true)
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
 * The TONE3000 mark in the corner of the pedal, for a model from TONE3000
 * (their design rules put it on the block that plays a loaded tone).
 * @param {HTMLElement} pedal
 * @param {model.Face|null} face
 */
function renderMark(pedal, face) {
    const old = findChild(pedal, 'nam-face-mark')
    if (!face || !face.tone3000) {
        if (old) {
            old.remove()
        }
        return
    }
    const mark = document.createElement('div')
    mark.className = 'nam-face-mark'
    mark.textContent = 'T3K'
    mark.title = 'From TONE3000'
    if (old) {
        old.replaceWith(mark)
    } else {
        pedal.appendChild(mark)
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
        renderBackdrop(icon, pedal, null)
        const old = findChild(pedal, 'nam-face')
        if (old) {
            old.remove()
        }
        renderMark(pedal, null)
        return
    }
    addStylesheet()
    pedal.classList.add('nam-face-on')
    renderBackdrop(icon, pedal, face.image)
    renderPlate(pedal, face)
    renderMark(pedal, face)
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
