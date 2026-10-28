// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The adapter to the legacy code.
 * This is the only file in the island that reads a global name.
 * @module
 */

/**
 * Gives the jQuery function from the legacy code.
 * @returns {any}
 */
export function jq() {
    // @ts-ignore - jQuery is a global from a classic script.
    return window.jQuery
}

/**
 * Asks the plugin bar to read the NAM models again, so that a model this
 * panel just downloaded can be dragged to the pedalboard at once.
 */
export function refreshNamModels() {
    // @ts-ignore - desktop is a global from a classic script.
    const desktop = window.desktop
    if (desktop && desktop.effectBox) {
        desktop.effectBox.effectBox('showNamModels')
    }
}
