import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    LISTS, architectureLabel, creatorName, defaultPicks, formatCountdown, gearLabel, isImageUrl,
    listInfo, sizeRank, sortModels, togglePick, toneDetails, tonesOnDevice,
} from '../../html/js/app/tone3000/model.js'

const m = (id, name, size, architecture = '1') => ({ id, name, size, architecture })

test('listInfo falls back to the first list', () => {
    assert.equal(listInfo('trending').label, 'Trending')
    assert.equal(listInfo('nope').id, LISTS[0].id)
})

test('the lists that need a sign-in are the personal ones', () => {
    assert.deepEqual(LISTS.filter((l) => !l.needsSignIn).map((l) => l.id), ['trending', 'latest'])
})

test('labels', () => {
    assert.equal(gearLabel('amp-cab'), 'Amp + cab')
    assert.equal(gearLabel('weird'), 'weird')
    assert.equal(gearLabel(null), '')
    assert.equal(architectureLabel('2'), 'A2')
    assert.equal(architectureLabel(null), '')
})

test('sizeRank orders from light to heavy, unknown last', () => {
    assert.ok(sizeRank('nano') < sizeRank('feather'))
    assert.ok(sizeRank('lite') < sizeRank('standard'))
    assert.ok(sizeRank('standard') < sizeRank('custom'))
    assert.ok(sizeRank(null) > sizeRank('standard'))
})

test('sortModels groups a capture and puts the light sizes first', () => {
    const sorted = sortModels([m(1, 'B', 'nano'), m(2, 'A', 'standard'), m(3, 'A', 'nano'), m(4, 'A', 'nano', '2')])
    assert.deepEqual(sorted.map((x) => x.id), [3, 4, 2, 1])
})

test('defaultPicks takes the lightest light model of each capture', () => {
    const models = [
        m(1, 'Clean', 'standard'), m(2, 'Clean', 'feather'), m(3, 'Clean', 'nano'),
        m(4, 'Drive', 'standard'), m(5, 'Drive', 'lite'),
    ]
    assert.deepEqual(defaultPicks(models).sort(), [3, 5])
})

test('defaultPicks leaves out a capture that only has a standard model', () => {
    const models = [m(1, 'Clean', 'nano'), m(2, 'Drive', 'standard')]
    assert.deepEqual(defaultPicks(models), [1])
})

test('defaultPicks takes something when nothing is light', () => {
    assert.deepEqual(defaultPicks([m(1, 'Big', 'standard')]), [1])
    assert.deepEqual(defaultPicks([m(1, 'A', 'standard'), m(2, 'B', 'custom')]).sort(), [1, 2])
    assert.deepEqual(defaultPicks([]), [])
})

test('togglePick', () => {
    assert.deepEqual(togglePick([1, 2], 3, true), [1, 2, 3])
    assert.deepEqual(togglePick([1, 2], 2, true), [1, 2])
    assert.deepEqual(togglePick([1, 2], 1, false), [2])
})

test('tonesOnDevice reads the sidecars of the library', () => {
    const library = [
        { tone3000: { tone_id: 7 } }, { tone3000: { tone_id: 7 } }, { tone3000: null }, { tone3000: { tone_id: 'x' } },
    ]
    assert.deepEqual(tonesOnDevice(library), [7])
    assert.deepEqual(tonesOnDevice(null), [])
})

test('toneDetails', () => {
    assert.equal(toneDetails({ gear: 'amp', a1_models_count: 2, a2_models_count: 1, models_count: 3 }), 'Amp · 2 A1 + 1 A2')
    assert.equal(toneDetails({ gear: null, a1_models_count: 0, a2_models_count: 0, models_count: 1 }), '1 model')
})

test('creatorName prefers the display name', () => {
    assert.equal(creatorName({ display_name: 'Scott', username: 'sjm' }), 'Scott')
    assert.equal(creatorName({ display_name: null, username: 'sjm' }), 'sjm')
    assert.equal(creatorName(null), 'unknown')
})

test('isImageUrl only lets https through', () => {
    assert.ok(isImageUrl('https://cdn.tone3000.com/a.png'))
    assert.ok(!isImageUrl('http://x/a.png'))
    assert.ok(!isImageUrl('javascript:alert(1)'))
    assert.ok(!isImageUrl(null))
})

test('formatCountdown', () => {
    assert.equal(formatCountdown(545), '9:05')
    assert.equal(formatCountdown(-3), '0:00')
})
