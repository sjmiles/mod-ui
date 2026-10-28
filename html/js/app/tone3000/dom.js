// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-check

/**
 * The few element tools this island needs.
 *
 * The SFZ builder has a fuller set. The architecture keeps islands apart until
 * two of them need the same code (docs/frontend-architecture.md, section 6),
 * and this island needs two functions of it, so it holds its own copy of them.
 * @module
 */

import { jq } from './legacy.js'

/**
 * Makes an element. See `h` in the SFZ builder: the tag can hold classes after
 * a dot, a property that starts with "on" becomes a listener, and a string
 * child becomes a text node, thus the text is always safe.
 *
 * @param {string} tag
 * @param {object} [props]
 * @param {(Node|string|null|false|undefined)[]} [children]
 * @returns {HTMLElement}
 */
export function h(tag, props, children) {
    const parts = tag.split('.')
    const node = document.createElement(parts[0] || 'div')
    for (let i = 1; i < parts.length; i++) {
        node.classList.add(parts[i])
    }
    for (const key in props || {}) {
        const value = (props || {})[key]
        if (value === null || value === undefined || value === false) {
            continue
        }
        if (key.indexOf('on') === 0) {
            node.addEventListener(key.slice(2), value)
        } else if (key === 'text') {
            node.textContent = String(value)
        } else if (key in node && key !== 'list' && key !== 'form') {
            // @ts-ignore - a direct property keeps the type, for example checked.
            node[key] = value
        } else {
            node.setAttribute(key, String(value))
        }
    }
    for (const child of children || []) {
        if (child === null || child === undefined || child === false) {
            continue
        }
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    }
    return node
}

/**
 * Removes every child of an element, with the jQuery `empty` when jQuery is
 * there (architecture rule 4.11).
 * @param {HTMLElement} node
 */
export function clear(node) {
    const $ = jq()
    if ($) {
        $(node).empty()
        return
    }
    while (node.firstChild) {
        node.removeChild(node.firstChild)
    }
}
