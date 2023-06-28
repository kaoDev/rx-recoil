import { act, cleanup } from '@testing-library/react'
import { atom } from './atom'
import { useAtom } from './core'
import { renderHookInStateRoot } from './testHelpers'

describe('rx-recoil atom functionality', () => {
	afterEach(() => {
		cleanup()
	})

	it('should provide access to the initial value of an atom', async () => {
		const testAtom = atom('test', {
			debugKey: 'testAtom',
		})

		const { result } = renderHookInStateRoot(() => useAtom(testAtom), {})

		expect(result.current[0]).toBe('test')
	})

	it('should provide access to the initial value of an atom with lazy initialization', async () => {
		const testAtom = atom(() => 'test', {
			debugKey: 'testAtom',
		})

		const { result } = renderHookInStateRoot(() => useAtom(testAtom), {})

		expect(result.current[0]).toBe('test')
	})

	it('should provide access to the update function for tha atom state, and return the updated value', async () => {
		const testAtom = atom('test', {
			debugKey: 'testAtom',
		})

		const { result, rerender } = renderHookInStateRoot(
			() => useAtom(testAtom),
			{},
		)

		act(() => {
			result.current[1]('updated value')
		})
		rerender()
		expect(result.current[0]).toBe('updated value')
	})
})
