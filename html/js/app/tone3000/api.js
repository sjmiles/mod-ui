// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The network calls of the TONE3000 panel.
 * This file knows all the URLs. No other file in the island knows them.
 *
 * Every call goes to the device, never to TONE3000 itself: the device holds
 * the sign-in, and the browser never sees a token.
 * @module
 */

import { jq } from './legacy.js'

/**
 * @param {string} url
 * @param {object} [data]
 * @returns {Promise<any>}
 */
function get(url, data) {
    return Promise.resolve(jq().ajax({
        url: url,
        data: data || {},
        dataType: 'json',
        cache: false,
    }))
}

/**
 * @param {string} url
 * @param {object} [data]
 * @returns {Promise<any>}
 */
function post(url, data) {
    return Promise.resolve(jq().ajax({
        url: url,
        type: 'POST',
        data: JSON.stringify(data || {}),
        contentType: 'application/json',
        dataType: 'json',
        cache: false,
    }))
}

/** @returns {Promise<any>} The sign-in state of the device. */
export function status() {
    return get('/tone3000/status')
}

/** @returns {Promise<any>} Starts a sign-in and gives the code to enter. */
export function signIn() {
    return post('/tone3000/signin')
}

/** @returns {Promise<any>} */
export function signOut() {
    return post('/tone3000/signout')
}

/**
 * @param {string} list One of the names in model.LISTS.
 * @param {string} gear
 * @param {string} query
 * @param {number} page
 * @returns {Promise<any>}
 */
export function listTones(list, gear, query, page) {
    return get('/tone3000/tones', { list: list, gear: gear, query: query, page: page })
}

/**
 * @param {number} toneId
 * @returns {Promise<any>}
 */
export function listModels(toneId) {
    return get('/tone3000/models', { tone_id: toneId })
}

/**
 * @param {number} toneId
 * @param {number[]} modelIds
 * @returns {Promise<any>}
 */
export function download(toneId, modelIds) {
    return post('/tone3000/download', { tone_id: toneId, model_ids: modelIds })
}

/** @returns {Promise<any>} The NAM models on the device. */
export function namModels() {
    return get('/nam/models')
}
