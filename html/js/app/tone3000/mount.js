// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The TONE3000 island: browse your TONE3000 tones and download NAM models to
 * the pedal. The legacy code starts the island with `mount`. This is the only
 * seam.
 * @module
 */

import * as api from './api.js'
import * as model from './model.js'
import * as view from './view.js'
import { createStore } from './state.js'
import { refreshNamModels } from './legacy.js'

/** Where the browser keeps the list you looked at last. */
const LIST_KEY = 'tone3000.list'

/** How often the panel asks whether a sign-in went through, in ms. */
const SIGN_IN_POLL = 3000

function addStylesheet() {
    if (document.querySelector('link[data-tone3000]')) {
        return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.type = 'text/css'
    link.href = new URL('./tone3000.css', import.meta.url).href
    link.setAttribute('data-tone3000', '1')
    // A panel whose stylesheet did not load has no size and gives no other
    // sign. Say it instead. See docs/frontend-architecture.md, section 7.
    link.addEventListener('error', () => {
        console.error('The TONE3000 panel cannot read', link.href)
        const root = document.getElementById('tone3000-library')
        if (root) {
            root.setAttribute('style', 'position:absolute;top:0;bottom:45px;left:0;right:0;'
                + 'z-index:2;background:#0a0a0a;color:#D91E36;padding:40px;font:13px monospace')
            root.textContent = 'The TONE3000 panel cannot read its stylesheet: ' + link.href
        }
    })
    document.head.appendChild(link)
}

/** @param {string} key */
function readSetting(key) {
    try {
        return window.localStorage.getItem(key)
    } catch (e) {
        return null
    }
}

/**
 * @param {string} key
 * @param {string} value
 */
function writeSetting(key, value) {
    try {
        window.localStorage.setItem(key, value)
    } catch (e) {
        /* The panel works without storage. */
    }
}

/**
 * @param {any} err
 * @param {string} fallback
 * @returns {string}
 */
function errorText(err, fallback) {
    return (err && err.error) || fallback
}

/**
 * Puts the TONE3000 panel in an element.
 * @param {HTMLElement} root The panel element.
 * @returns {{ open: () => void, close: () => void, destroy: () => void }}
 */
export function mount(root) {
    addStylesheet()

    const store = createStore()
    const saved = readSetting(LIST_KEY)
    if (saved && model.LISTS.some((l) => l.id === saved)) {
        store.update({ list: saved })
    }

    // Which view of the list the answers belong to. A click on another tab or
    // another gear while a list is loading must not let the old answer land
    // over the new one (docs/frontend-architecture.md, rule 4.7).
    let generation = 0
    function fresh() {
        const mine = generation
        return () => mine === generation
    }

    // The same for the models of a tone: open tone A, then tone B, and the
    // models of A must not land in the panel of B.
    let detailGeneration = 0

    let pollTimer = 0
    let isOpen = false

    /** @type {view.Handlers} */
    const handlers = {
        onSignIn: signIn,
        onSignOut: signOut,
        onList: (list) => {
            writeSetting(LIST_KEY, list)
            store.update({ list: list, query: '' })
            el.query.value = ''
            loadTones()
        },
        onGear: (gear) => {
            store.update({ gear: gear })
            loadTones()
        },
        onQuery: (query) => {
            store.update({ query: query })
            loadTones()
        },
        onMore: () => loadTones(store.get().page + 1),
        onOpenTone: openTone,
        onCloseTone: () => {
            detailGeneration++
            store.update({ selected: null, models: null, picked: [] })
            drawTones()
            drawDetail()
        },
        onPick: (id, on) => {
            store.update({ picked: model.togglePick(store.get().picked, id, on) })
            drawDetail()
        },
        onDownload: download,
    }

    const el = view.createLayout(root, handlers)

    function drawAccount() { view.renderAccount(el, store.get(), handlers) }
    function drawToolbar() { view.renderToolbar(el, store.get()) }
    function drawTones() { view.renderTones(el, store.get(), handlers) }
    function drawDetail() { view.renderDetail(el, store.get(), handlers) }

    /**
     * @param {string} text
     * @param {boolean} [isError]
     */
    function say(text, isError) {
        store.update({ message: text, messageIsError: !!isError })
        view.renderMessage(el, text, !!isError)
    }

    /** @param {model.Status} status */
    function setStatus(status) {
        const was = store.get().status
        store.update({ status: status })
        drawAccount()
        if (status.error) {
            say(status.error, true)
        }
        // A sign-in that just went through: show the lists that need it.
        if (was && !was.connected && status.connected) {
            say('Signed in to TONE3000.')
            loadTones()
        }
        schedulePoll()
    }

    function schedulePoll() {
        window.clearTimeout(pollTimer)
        const status = store.get().status
        if (isOpen && status && status.pending) {
            pollTimer = window.setTimeout(refreshStatus, SIGN_IN_POLL)
        }
    }

    /** @returns {Promise<void>} */
    function refreshStatus() {
        return api.status().then((resp) => setStatus(resp.status), () => {
            say('Cannot reach the pedal.', true)
        })
    }

    function signIn() {
        say('')
        api.signIn().then((resp) => {
            if (!resp.ok) {
                say(errorText(resp, 'Cannot start the sign-in.'), true)
            }
            if (resp.status) {
                setStatus(resp.status)
            }
        }, () => say('Cannot reach the pedal.', true))
    }

    function signOut() {
        api.signOut().then((resp) => {
            setStatus(resp.status)
            say('Signed out. The models on the pedal stay.')
            loadTones()
        }, () => say('Cannot reach the pedal.', true))
    }

    /** @param {number} [page] A next page, or nothing for a new list. */
    function loadTones(page) {
        const state = store.get()
        const info = model.listInfo(state.list)
        const nextPage = page || 1
        if (nextPage === 1) {
            generation++
            store.update({ tones: [], page: 1, totalPages: 1 })
        }
        drawToolbar()
        if (info.needsSignIn && !(state.status && state.status.connected)) {
            store.update({ loading: false })
            drawTones()
            return
        }
        const still = fresh()
        store.update({ loading: true })
        drawTones()
        api.listTones(state.list, state.gear, info.query ? state.query : '', nextPage).then((resp) => {
            if (!still()) {
                return
            }
            if (!resp.ok) {
                store.update({ loading: false })
                say(errorText(resp, 'Cannot read the list.'), true)
                if (resp.status) {
                    setStatus(resp.status)
                }
                drawTones()
                return
            }
            store.update({
                loading: false,
                tones: (nextPage === 1 ? [] : store.get().tones).concat(resp.tones || []),
                page: resp.page || nextPage,
                totalPages: resp.total_pages || 1,
            })
            drawTones()
        }, () => {
            if (still()) {
                store.update({ loading: false })
                say('Cannot reach the pedal.', true)
                drawTones()
            }
        })
    }

    /** Reads which tones the pedal already holds, for the "On pedal" marks. */
    function loadOnDevice() {
        return api.namModels().then((resp) => {
            store.update({ onDevice: model.tonesOnDevice(resp.models || []) })
            drawTones()
        }, () => { /* the marks are a help, not a need */ })
    }

    /** @param {model.Tone} tone */
    function openTone(tone) {
        detailGeneration++
        const mine = detailGeneration
        store.update({ selected: tone, models: null, picked: [] })
        drawTones()
        drawDetail()
        const status = store.get().status
        if (!(status && status.connected)) {
            store.update({ models: [] })
            drawDetail()
            say('Sign in to TONE3000 to download models.', true)
            return
        }
        api.listModels(tone.id).then((resp) => {
            if (mine !== detailGeneration) {
                return
            }
            if (!resp.ok) {
                store.update({ models: [] })
                say(errorText(resp, 'Cannot read the models of this tone.'), true)
                drawDetail()
                return
            }
            const models = resp.models || []
            store.update({ models: models, picked: model.defaultPicks(models) })
            drawDetail()
        }, () => {
            if (mine === detailGeneration) {
                store.update({ models: [] })
                say('Cannot reach the pedal.', true)
                drawDetail()
            }
        })
    }

    function download() {
        const state = store.get()
        if (!state.selected || state.picked.length === 0 || state.downloading) {
            return
        }
        const tone = state.selected
        store.update({ downloading: true })
        say('Downloading ' + state.picked.length + ' model(s) of ' + tone.title + '…')
        drawDetail()
        api.download(tone.id, state.picked).then((resp) => {
            store.update({ downloading: false })
            if (!resp.ok) {
                say(errorText(resp, 'The download failed.'), true)
                drawDetail()
                return
            }
            const n = (resp.files || []).length
            say(n + (n === 1 ? ' model is' : ' models are') + ' on the pedal. Drag '
                + (n === 1 ? 'it' : 'them') + ' from the NAM Models tab of the plugin bar onto the pedalboard.')
            drawDetail()
            refreshNamModels()
            loadOnDevice()
        }, () => {
            store.update({ downloading: false })
            say('The download failed: cannot reach the pedal.', true)
            drawDetail()
        })
    }

    function open() {
        isOpen = true
        drawToolbar()
        drawAccount()
        drawTones()
        refreshStatus().then(() => loadTones())
        loadOnDevice()
    }

    function close() {
        isOpen = false
        window.clearTimeout(pollTimer)
    }

    drawToolbar()
    drawAccount()

    return { open: open, close: close, destroy: close }
}
