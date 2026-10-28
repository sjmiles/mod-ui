// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The adapter to the legacy code.
 * This is the only file in the island that reads a global name.
 * @module
 */

/**
 * Draws the cables of a plugin again, after its jacks moved.
 * @param {HTMLElement} icon The element of the plugin on the board.
 */
export function redrawJacks(icon) {
    // @ts-ignore - desktop and jQuery are globals from classic scripts.
    const desktop = window.desktop, $ = window.jQuery
    if (desktop && desktop.pedalboard && $) {
        desktop.pedalboard.pedalboard('drawPluginJacks', $(icon))
    }
}
