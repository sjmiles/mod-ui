import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailLine, fitSize, isImageUrl, modelParameterUri, modelPathOf } from '../../html/js/app/namface/model.js'

const URI = 'http://github.com/mikeoliphant/neural-amp-modeler-lv2#model'

test('modelParameterUri finds the nammodel parameter', () => {
    assert.equal(modelParameterUri({ parameters: [
        { uri: 'x#ir', writable: true, fileTypes: ['ir'] },
        { uri: URI, writable: true, fileTypes: ['nammodel'] },
    ] }), URI)
    assert.equal(modelParameterUri({ parameters: [{ uri: URI, writable: false, fileTypes: ['nammodel'] }] }), null)
    assert.equal(modelParameterUri({}), null)
    assert.equal(modelParameterUri(null), null)
})

test('modelPathOf reads start and change events', () => {
    assert.equal(modelPathOf({ type: 'start', parameters: [{ uri: URI, value: '/m/a.nam' }] }, URI), '/m/a.nam')
    assert.equal(modelPathOf({ type: 'start', parameters: [{ uri: URI, value: null }] }, URI), '')
    assert.equal(modelPathOf({ type: 'start', parameters: [] }, URI), null)
    assert.equal(modelPathOf({ type: 'change', uri: URI, value: '/m/b.nam' }, URI), '/m/b.nam')
    assert.equal(modelPathOf({ type: 'change', symbol: 'gain', value: 3 }, URI), null)
    assert.equal(modelPathOf(null, URI), null)
})

test('detailLine and isImageUrl', () => {
    assert.equal(detailLine({ title: 't', detail: 'Crunch', size: 'nano', image: null }), 'Crunch · nano')
    assert.equal(detailLine({ title: 't', detail: null, size: null, image: null }), '')
    assert.ok(isImageUrl('/nam/image?path=x'))
    assert.ok(isImageUrl('https://cdn.tone3000.com/a.jpg'))
    assert.ok(!isImageUrl('http://evil/a.jpg'))
    assert.ok(!isImageUrl('javascript:alert(1)'))
    assert.ok(!isImageUrl(null))
})

test('fitSize fits the longest side without cropping', () => {
    assert.deepEqual(fitSize(240, 160, 540, 248), { width: 372, height: 248 })
    assert.deepEqual(fitSize(1000, 200, 540, 248), { width: 540, height: 108 })
    assert.deepEqual(fitSize(800, 800, 540, 248), { width: 248, height: 248 })
    assert.equal(fitSize(0, 100, 540, 248), null)
    assert.equal(fitSize(100, 100, 0, 248), null)
})
