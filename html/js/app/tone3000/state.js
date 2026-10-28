// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The state of the TONE3000 panel.
 * Only `update` changes the state. Thus there is one place to write log messages.
 * @module
 */

/**
 * @typedef {object} T3kState
 * @property {import('./model.js').Status|null} status The sign-in state, null before the first answer.
 * @property {string} list Which list of tones the panel shows.
 * @property {string} gear The gear filter, '' for all.
 * @property {string} query The search of the list, for the lists that take one.
 * @property {import('./model.js').Tone[]} tones
 * @property {number} page
 * @property {number} totalPages
 * @property {boolean} loading
 * @property {import('./model.js').Tone|null} selected The tone whose models the panel shows.
 * @property {import('./model.js').Model[]|null} models Null while they load.
 * @property {number[]} picked The ids of the models to download.
 * @property {boolean} downloading
 * @property {number[]} onDevice The ids of the tones that the device holds models of.
 * @property {string} message
 * @property {boolean} messageIsError
 */

/** @returns {T3kState} */
export function initialState() {
    return {
        status: null,
        list: 'favorited',
        gear: '',
        query: '',
        tones: [],
        page: 1,
        totalPages: 1,
        loading: false,
        selected: null,
        models: null,
        picked: [],
        downloading: false,
        onDevice: [],
        message: '',
        messageIsError: false,
    }
}

export function createStore() {
    let state = initialState()
    return {
        /** @returns {T3kState} */
        get() {
            return state
        },
        /** @param {Partial<T3kState>} patch */
        update(patch) {
            state = Object.assign({}, state, patch)
        },
    }
}
