import { describe, expect, test } from 'claude-code/testing'

import { isTextRead, mapText, trim } from '../hooks/lib'

describe('lib', () => {
  test('recorta conservando principio y final', () => {
    const text = 'A'.repeat(700) + 'B'.repeat(10_000) + 'C'.repeat(300)
    const out = trim(text, 1000)!
    expect(out.startsWith('A'.repeat(700))).toBe(true)
    expect(out.endsWith('C'.repeat(300))).toBe(true)
    expect(out).toContain('caracteres omitidos')
    expect(trim('corto', 1000)).toBe(null)
  })

  test('mapText toca texto y resultados de herramientas', () => {
    const { blocks, changed } = mapText(
      [
        { type: 'tool_result', tool_use_id: 'x', content: 'hola' },
        { type: 'tool_result', tool_use_id: 'y', content: [{ type: 'text', text: 'hola' }] },
        { type: 'image', source: {} },
      ],
      t => t.toUpperCase(),
    )
    expect(changed).toBe(true)
    expect(blocks[0]!.content).toBe('HOLA')
    expect((blocks[1]!.content as { text: string }[])[0]!.text).toBe('HOLA')
    expect(blocks[2]!.type).toBe('image')
  })

  test('no frena imágenes ni PDF', () => {
    expect(isTextRead('/a/b.java')).toBe(true)
    expect(isTextRead('/a/b.PDF')).toBe(false)
  })
})

describe('mod', () => {
  test('frena la primera lectura entera de un archivo grande y deja la segunda', async ($, on) => {
    on('fs.stat', () => ({ value: { kind: 'file', size: 500 * 1024, mtimeMs: 0, isLink: false } }) as never)
    on('ui.toast', () => ({ value: undefined }) as never)
    let reads = 0
    on('tool.call', { tool: 'Read' }, () => {
      reads += 1
      return { result: { type: 'text', file: { filePath: '/big.log', content: 'x', numLines: 1, startLine: 1, totalLines: 1 } } } as never
    })
    const first = await $.tool.call({ tool: 'Read', file_path: '/big.log' })
    expect(first.deny).toMatch(/pesa 500 KB/)
    expect(reads).toBe(0)
    await $.tool.call({ tool: 'Read', file_path: '/big.log' })
    expect(reads).toBe(1)
    await $.tool.call({ tool: 'Read', file_path: '/big.log', limit: 100 })
    expect(reads).toBe(2)
  })
})
