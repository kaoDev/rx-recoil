import { renderHook, RenderHookOptions } from '@testing-library/react'
import { Suspense } from 'react'
import { createStateContextValue, StateRoot } from './core'

type StateRootContextValue = ReturnType<typeof createStateContextValue>

export function renderHookInStateRoot<Result, Props>(
	hook: (initialProps: Props) => Result,
	{
		stateRootValue,
		...options
	}: { stateRootValue?: StateRootContextValue } & Omit<
		RenderHookOptions<Props>,
		'wrapper'
	>,
) {
	return renderHook<Result, Props>(hook, {
		wrapper: ({ children }) => (
			<StateRoot context={stateRootValue}>
				<Suspense>{children}</Suspense>
			</StateRoot>
		),
		...options,
	})
}
