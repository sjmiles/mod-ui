// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * The seam between the legacy code and the TONE3000 island.
 *
 * Like js/sfzbuilder.js: desktop.js calls `tone3000Box`, the window manager
 * needs the registration at once, and the island loads in the background.
 * See docs/frontend-architecture.md, rule 4.2.
 */

function tone3000ShowLoadError(root, err) {
    var text = (err && (err.message || err)) || 'unknown error'
    root.innerHTML = ''
    var box = document.createElement('div')
    box.setAttribute('style', [
        'position:absolute', 'top:0', 'bottom:45px', 'left:0', 'right:0',
        'z-index:2', 'background:#0a0a0a', 'color:#d8d8d8', 'padding:40px',
        'font-family:ui-monospace,Menlo,Consolas,monospace', 'font-size:13px',
        'line-height:1.7'
    ].join(';'))
    box.innerHTML =
        '<div style="color:#D91E36;font-weight:700;letter-spacing:.18em;' +
        'text-transform:uppercase;margin-bottom:14px">TONE3000 did not load</div>' +
        '<div style="color:#6f6f6f">The panel could not read its own files from' +
        ' <code style="color:#F29446">js/app/tone3000/</code>.' +
        ' Look in the network tab of the browser for a 404.</div>' +
        '<div style="margin-top:14px;color:#6f6f6f">Reason:' +
        ' <span style="color:#F29446"></span></div>'
    box.querySelector('span').textContent = text
    root.appendChild(box)
}

JqueryClass('tone3000Box', {
    init: function (options) {
        var self = $(this)

        options = $.extend({
            isMainWindow: true,
            windowName: "TONE3000"
        }, options)

        var root = self[0]
        var island = import('./app/tone3000/mount.js').then(function (module) {
            return module.mount(root)
        })
        island.catch(function (err) {
            console.error('Cannot load the TONE3000 panel', err)
            tone3000ShowLoadError(root, err)
        })
        self.data('tone3000Island', island)

        options.open = function () {
            island.then(function (it) { it.open() }, function () { /* the message is on the panel */ })
        }
        options.close = function () {
            island.then(function (it) { it.close() }, function () { })
        }

        self.window(options)

        return self
    }
})
