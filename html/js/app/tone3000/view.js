// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The elements of the TONE3000 panel. Each function draws one part from the
 * state and calls back into mount.js for anything that changes it.
 * @module
 */

import * as model from './model.js'
import { h, clear } from './dom.js'

/**
 * @typedef {object} Handlers
 * @property {() => void} onSignIn
 * @property {() => void} onSignOut
 * @property {(list: string) => void} onList
 * @property {(gear: string) => void} onGear
 * @property {(query: string) => void} onQuery
 * @property {() => void} onMore
 * @property {() => void} onBrowse
 * @property {(tone: model.Tone) => void} onOpenTone
 * @property {() => void} onCloseTone
 * @property {(id: number, on: boolean) => void} onPick
 * @property {() => void} onDownload
 */

/**
 * Makes the frame of the panel.
 * @param {HTMLElement} root
 * @param {Handlers} handlers
 */
export function createLayout(root, handlers) {
    clear(root)

    const header = h('header', {}, [h('h1.bottom.top', { text: 'TONE3000' })])

    const account = h('div.t3k-account')

    const tabs = h('div.t3k-tabs', { role: 'tablist', 'aria-label': 'Lists of tones' })
    /** @type {Record<string, HTMLButtonElement>} */
    const tabButtons = {}
    for (const list of model.LISTS) {
        const button = /** @type {HTMLButtonElement} */ (h('button.t3k-tab', {
            type: 'button', role: 'tab', text: list.label,
            onclick: () => handlers.onList(list.id),
        }))
        tabButtons[list.id] = button
        tabs.appendChild(button)
    }

    const gear = /** @type {HTMLSelectElement} */ (h('select.t3k-gear', {
        'aria-label': 'Gear type',
        onchange: () => handlers.onGear(gear.value),
    }, model.GEARS.map((g) => h('option', { value: g.id, text: g.label }))))

    let queryTimer = 0
    const query = /** @type {HTMLInputElement} */ (h('input.t3k-query', {
        type: 'search', placeholder: 'Search this list', 'aria-label': 'Search this list',
        oninput: () => {
            window.clearTimeout(queryTimer)
            queryTimer = window.setTimeout(() => handlers.onQuery(query.value.trim()), 400)
        },
    }))

    const catalog = h('button.t3k-btn.t3k-btn--accent.t3k-catalog', {
        type: 'button',
        title: 'Search every NAM tone in TONE3000\'s own picker. The tone you pick opens here, ready to download.',
        text: 'Search all of TONE3000 ↗',
        onclick: handlers.onBrowse,
    })

    const toolbar = h('div.t3k-toolbar', {}, [tabs, gear, query, catalog])

    const grid = h('div.t3k-grid', { role: 'list' })
    const more = h('button.t3k-btn.t3k-more', { type: 'button', text: 'More', onclick: handlers.onMore })
    const empty = h('div.t3k-empty')
    const results = h('div.t3k-results', {}, [grid, empty, more])

    const detail = h('aside.t3k-detail', { 'aria-label': 'Models of the tone' })
    const message = h('div.t3k-message', { role: 'status' })

    const brand = h('div.t3k-brand', {}, [
        h('span.t3k-wordmark', { text: 'TONE3000' }),
        h('span.t3k-brand-note', { text: 'Neural amp, pedal and cab captures' }),
    ])

    const body = h('div.t3k-body', {}, [results, detail])
    const panel = h('div.t3k-panel', {}, [
        h('div.t3k-top', {}, [brand, account]),
        toolbar, message, body,
    ])
    root.appendChild(header)
    root.appendChild(panel)

    return { root, header, panel, account, tabs, tabButtons, gear, query, catalog, grid, more, empty, detail, message, body }
}

/** @typedef {ReturnType<typeof createLayout>} Elements */

/**
 * @param {string|null} url
 * @param {string} cls
 * @param {string} alt
 * @returns {HTMLElement}
 */
function image(url, cls, alt) {
    if (!model.isImageUrl(url)) {
        return h('div.' + cls + '.t3k-noimage', { 'aria-hidden': 'true' })
    }
    return h('img.' + cls, { src: url, alt: alt, loading: 'lazy', referrerpolicy: 'no-referrer' })
}

/**
 * @param {Elements} el
 * @param {import('./state.js').T3kState} state
 * @param {Handlers} handlers
 */
export function renderAccount(el, state, handlers) {
    clear(el.account)
    const status = state.status
    if (!status) {
        el.account.appendChild(h('span.t3k-dim', { text: 'Checking the sign-in…' }))
        return
    }
    if (!status.enabled) {
        el.account.appendChild(h('span.t3k-dim', { text: 'No TONE3000 client id is set on this device.' }))
        return
    }
    if (status.connected) {
        const user = status.user || { display_name: null, username: null, avatar_url: null }
        el.account.appendChild(image(user.avatar_url, 't3k-avatar', ''))
        el.account.appendChild(h('span.t3k-user', { text: user.display_name || user.username || 'Signed in' }))
        el.account.appendChild(h('button.t3k-btn.t3k-btn--quiet', { type: 'button', text: 'Sign out', onclick: handlers.onSignOut }))
        return
    }
    if (status.pending) {
        const p = status.pending
        const link = p.verification_uri_complete || p.verification_uri
        el.account.appendChild(h('div.t3k-code-box', {}, [
            h('div.t3k-code-step', {}, [
                'On your phone or computer, open ',
                h('a', { href: link, target: '_blank', rel: 'noopener', text: p.verification_uri.replace(/^https:\/\//, '') }),
                ' and enter',
            ]),
            h('div.t3k-code', { text: p.user_code, 'aria-label': 'Sign-in code ' + p.user_code.split('').join(' ') }),
            h('div.t3k-dim', { text: 'Waiting for the sign-in… the code runs out in ' + model.formatCountdown(p.expires_in) }),
        ]))
        return
    }
    el.account.appendChild(h('button.t3k-btn.t3k-btn--accent', {
        type: 'button', text: 'Sign in to TONE3000', onclick: handlers.onSignIn,
    }))
}

/**
 * @param {Elements} el
 * @param {import('./state.js').T3kState} state
 */
export function renderToolbar(el, state) {
    const info = model.listInfo(state.list)
    for (const id in el.tabButtons) {
        const on = id === state.list
        el.tabButtons[id].classList.toggle('t3k-tab--on', on)
        el.tabButtons[id].setAttribute('aria-selected', on ? 'true' : 'false')
    }
    el.gear.value = state.gear
    el.query.style.display = info.query ? '' : 'none'
}

/**
 * @param {Elements} el
 * @param {string} text
 * @param {boolean} isError
 */
export function renderMessage(el, text, isError) {
    el.message.textContent = text || ''
    el.message.classList.toggle('t3k-message--err', !!isError)
}

/**
 * @param {Elements} el
 * @param {import('./state.js').T3kState} state
 * @param {Handlers} handlers
 */
export function renderTones(el, state, handlers) {
    clear(el.grid)
    const info = model.listInfo(state.list)
    const signedIn = !!(state.status && state.status.connected)

    let emptyText = ''
    if (info.needsSignIn && !signedIn) {
        emptyText = 'Sign in to see your ' + info.label.toLowerCase() + '. Trending, Latest and Search all of TONE3000 work without a sign-in.'
    } else if (state.loading && state.tones.length === 0) {
        emptyText = 'Loading…'
    } else if (state.tones.length === 0) {
        emptyText = state.list === 'favorited'
            ? 'No NAM tones in your favorites yet. Favorite a tone on tone3000.com and it shows up here.'
            : 'No NAM tones here.'
    }
    el.empty.textContent = emptyText
    el.empty.style.display = emptyText ? '' : 'none'
    el.more.style.display = !state.loading && state.page < state.totalPages ? '' : 'none'

    for (const tone of state.tones) {
        const onDevice = state.onDevice.indexOf(tone.id) >= 0
        const card = h('button.t3k-card', {
            type: 'button', role: 'listitem',
            'aria-label': tone.title + ' by ' + model.creatorName(tone.creator),
            onclick: () => handlers.onOpenTone(tone),
        }, [
            image(tone.image_url, 't3k-card-image', ''),
            h('span.t3k-card-title', { text: tone.title }),
            h('span.t3k-card-details', { text: model.toneDetails(tone) }),
            h('span.t3k-card-creator', {}, [
                image(tone.creator.avatar_url, 't3k-avatar.t3k-avatar--small', ''),
                h('span', { text: model.creatorName(tone.creator) }),
            ]),
            onDevice ? h('span.t3k-badge', { text: 'On pedal' }) : null,
        ])
        if (state.selected && state.selected.id === tone.id) {
            card.classList.add('t3k-card--on')
        }
        el.grid.appendChild(card)
    }
}

/**
 * @param {Elements} el
 * @param {import('./state.js').T3kState} state
 * @param {Handlers} handlers
 */
export function renderDetail(el, state, handlers) {
    clear(el.detail)
    const tone = state.selected
    el.body.classList.toggle('t3k-body--detail', !!tone)
    if (!tone) {
        return
    }

    el.detail.appendChild(h('div.t3k-detail-head', {}, [
        h('h2.t3k-detail-title', { text: tone.title }),
        h('button.t3k-btn.t3k-btn--quiet', { type: 'button', text: 'Close', onclick: handlers.onCloseTone }),
    ]))
    el.detail.appendChild(h('div.t3k-dim', {}, [
        model.toneDetails(tone) + ' · by ' + model.creatorName(tone.creator) + ' · ',
        tone.url ? h('a', { href: tone.url, target: '_blank', rel: 'noopener', text: 'View on TONE3000 ↗' }) : null,
    ]))

    if (state.models === null) {
        el.detail.appendChild(h('div.t3k-dim.t3k-pad', { text: 'Loading the models…' }))
        return
    }
    if (state.models.length === 0) {
        el.detail.appendChild(h('div.t3k-dim.t3k-pad', { text: 'This tone has no NAM model that the pedal can load.' }))
        return
    }

    el.detail.appendChild(h('p.t3k-hint', {
        text: 'Light models (nano, feather, lite) leave room for other plugins: the Pi runs about eight of them at once, or three or four standard ones.',
    }))

    const list = h('ul.t3k-models')
    for (const m of model.sortModels(state.models)) {
        const id = 't3k-model-' + m.id
        const checkbox = /** @type {HTMLInputElement} */ (h('input', {
            type: 'checkbox', id: id, checked: state.picked.indexOf(m.id) >= 0,
            onchange: () => handlers.onPick(m.id, checkbox.checked),
        }))
        list.appendChild(h('li.t3k-model', {}, [
            checkbox,
            h('label', { for: id }, [
                h('span.t3k-model-name', { text: m.name }),
                m.size ? h('span.t3k-tag', { text: m.size }) : null,
                model.architectureLabel(m.architecture) ? h('span.t3k-tag', { text: model.architectureLabel(m.architecture) }) : null,
            ]),
        ]))
    }
    el.detail.appendChild(list)

    const count = state.picked.length
    el.detail.appendChild(h('button.t3k-btn.t3k-btn--accent.t3k-download', {
        type: 'button',
        disabled: state.downloading || count === 0,
        text: state.downloading ? 'Downloading…' : 'Download ' + count + (count === 1 ? ' model' : ' models') + ' to the pedal',
        onclick: handlers.onDownload,
    }))
}
