// SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * The seam between modgui.js and the NAM pedal face island
 * (js/app/namface/). GUI.triggerJS calls namFace with every plugin GUI event;
 * the island loads on the first one and ignores every plugin without a NAM
 * model parameter.
 */

function namFace(gui, event) {
    if (!namFace.island) {
        namFace.island = import('./app/namface/mount.js')
        namFace.island.catch(function (err) {
            console.error('Cannot load the NAM pedal face', err)
        })
    }
    namFace.island.then(function (module) {
        module.apply(gui, event)
    }, function () { })
}
