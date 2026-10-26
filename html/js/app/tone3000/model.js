// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The pure functions of the TONE3000 panel. No DOM and no network here.
 * @module
 */

/**
 * @typedef {object} Creator
 * @property {string|null} username
 * @property {string|null} display_name
 * @property {string|null} avatar_url
 * @property {string|null} url
 */

/**
 * @typedef {object} Tone
 * @property {number} id
 * @property {string} title
 * @property {string|null} url
 * @property {string|null} gear
 * @property {string|null} format
 * @property {string|null} image_url
 * @property {string[]} sizes
 * @property {number} models_count
 * @property {number} a1_models_count
 * @property {number} a2_models_count
 * @property {boolean} is_favorite
 * @property {Creator} creator
 */

/**
 * @typedef {object} Model
 * @property {number} id
 * @property {string} name
 * @property {string|null} size
 * @property {string|null} architecture '1', '2', 'custom' or null.
 */

/**
 * @typedef {object} Status
 * @property {boolean} enabled
 * @property {boolean} connected
 * @property {{ username: string|null, display_name: string|null, avatar_url: string|null }|null} user
 * @property {{ user_code: string, verification_uri: string, verification_uri_complete: string|null, expires_in: number }|null} pending
 * @property {string|null} error
 */

/**
 * The lists that the panel offers. The free tier of the TONE3000 API allows
 * these and the hosted picker; a full search of the catalog needs a commercial
 * agreement, so the panel links to tone3000.com for it.
 * `query` says whether the list takes a search.
 */
export const LISTS = [
    { id: 'favorited', label: 'Favorites', query: true, needsSignIn: true },
    { id: 'downloaded', label: 'Downloaded', query: true, needsSignIn: true },
    { id: 'created', label: 'My tones', query: true, needsSignIn: true },
    { id: 'trending', label: 'Trending', query: false, needsSignIn: false },
    { id: 'latest', label: 'Latest', query: false, needsSignIn: false },
]

/** The gear types of TONE3000, in its own order. */
export const GEARS = [
    { id: '', label: 'All gear' },
    { id: 'amp', label: 'Amp' },
    { id: 'amp-cab', label: 'Amp + cab' },
    { id: 'pedal', label: 'Pedal' },
    { id: 'outboard', label: 'Outboard' },
    { id: 'cab', label: 'Cab' },
    { id: 'space', label: 'Space' },
    { id: 'experimental', label: 'Experimental' },
]

/** Where the full catalog is, for everything the lists above do not reach. */
export const CATALOG_URL = 'https://www.tone3000.com/search'

/**
 * The NAM sizes from the lightest to the heaviest. The lighter the model, the
 * more of them the Pi runs at once: about eight light ones on a Pi 5, three or
 * four standard ones.
 */
export const SIZES = ['nano', 'feather', 'lite', 'standard']

/** The sizes the panel picks for you. Standard models are a choice you make. */
const LIGHT_SIZES = ['nano', 'feather', 'lite']

/**
 * @param {string} id
 * @returns {{ id: string, label: string, query: boolean, needsSignIn: boolean }}
 */
export function listInfo(id) {
    return LISTS.find((l) => l.id === id) || LISTS[0]
}

/**
 * @param {string|null} gear
 * @returns {string}
 */
export function gearLabel(gear) {
    const found = GEARS.find((g) => g.id === gear)
    return found && gear ? found.label : (gear || '')
}

/**
 * @param {string|null} architecture
 * @returns {string}
 */
export function architectureLabel(architecture) {
    if (architecture === '1') return 'A1'
    if (architecture === '2') return 'A2'
    if (architecture === 'custom') return 'Custom'
    return ''
}

/**
 * @param {string|null} size
 * @returns {number} The place of the size in SIZES; an unknown size goes last.
 */
export function sizeRank(size) {
    const i = SIZES.indexOf(size || '')
    return i < 0 ? SIZES.length : i
}

/**
 * Sorts the models of a tone: by name, then from the lightest to the heaviest,
 * then A1 before A2.
 * @param {Model[]} models
 * @returns {Model[]} A new array.
 */
export function sortModels(models) {
    return models.slice().sort((a, b) =>
        a.name.localeCompare(b.name)
        || sizeRank(a.size) - sizeRank(b.size)
        || String(a.architecture).localeCompare(String(b.architecture)))
}

/**
 * The models the panel ticks when it opens a tone.
 *
 * A tone often holds the same capture at several sizes. The panel picks the
 * lightest light one of each name, so that a model runs on the Pi next to
 * other plugins; you can tick the others yourself. A name with no light model
 * gets the lightest it has.
 * @param {Model[]} models
 * @returns {number[]} The ids.
 */
export function defaultPicks(models) {
    /** @type {Map<string, Model>} */
    const best = new Map()
    for (const m of models) {
        const current = best.get(m.name)
        if (!current || sizeRank(m.size) < sizeRank(current.size)) {
            best.set(m.name, m)
        }
    }
    const picks = []
    for (const m of best.values()) {
        if (LIGHT_SIZES.indexOf(m.size || '') >= 0 || best.size === 1) {
            picks.push(m.id)
        }
    }
    if (picks.length === 0) {
        for (const m of best.values()) picks.push(m.id)
    }
    return picks
}

/**
 * Adds or removes one id.
 * @param {number[]} picked
 * @param {number} id
 * @param {boolean} on
 * @returns {number[]} A new array.
 */
export function togglePick(picked, id, on) {
    const rest = picked.filter((p) => p !== id)
    return on ? rest.concat([id]) : rest
}

/**
 * The ids of the tones that the device already holds models of, from the
 * sidecars of the NAM library.
 * @param {{ tone3000: { tone_id?: number }|null }[]} namModels
 * @returns {number[]}
 */
export function tonesOnDevice(namModels) {
    const ids = new Set()
    for (const m of namModels || []) {
        if (m.tone3000 && typeof m.tone3000.tone_id === 'number') {
            ids.add(m.tone3000.tone_id)
        }
    }
    return Array.from(ids)
}

/**
 * The line under the title of a tone card: the gear and the model counts.
 * @param {Tone} tone
 * @returns {string}
 */
export function toneDetails(tone) {
    const parts = []
    const gear = gearLabel(tone.gear)
    if (gear) parts.push(gear)
    const counts = []
    if (tone.a1_models_count) counts.push(tone.a1_models_count + ' A1')
    if (tone.a2_models_count) counts.push(tone.a2_models_count + ' A2')
    if (counts.length) {
        parts.push(counts.join(' + '))
    } else if (tone.models_count) {
        parts.push(tone.models_count + (tone.models_count === 1 ? ' model' : ' models'))
    }
    return parts.join(' · ')
}

/**
 * @param {Creator} creator
 * @returns {string}
 */
export function creatorName(creator) {
    return (creator && (creator.display_name || creator.username)) || 'unknown'
}

/**
 * Whether the panel may show this URL as an image. A tone comes from another
 * site, so only a web address goes into a src.
 * @param {string|null} url
 * @returns {boolean}
 */
export function isImageUrl(url) {
    return typeof url === 'string' && /^https:\/\//.test(url)
}

/**
 * @param {number} seconds
 * @returns {string} "9:05"
 */
export function formatCountdown(seconds) {
    const s = Math.max(0, Math.floor(seconds))
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}
