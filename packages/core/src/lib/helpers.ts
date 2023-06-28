import { useSyncExternalStore } from 'react'
import {
	BehaviorSubject,
	firstValueFrom,
	isObservable as isObservableBase,
	Observable,
} from 'rxjs'
import { filter } from 'rxjs/operators'
import { EMPTY_TYPE, EMPTY_VALUE } from './types'
import { useLazyRef } from './useLazyRef'

export function isPromise(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		typeof (value as any).subscribe !== 'function' &&
		typeof (value as any).then === 'function'
	)
}

export function isObservable<T>(value: unknown): value is Observable<T> {
	return isObservableBase(value)
}

export function useObservable<T>(value$: Observable<T>, initialValue: T) {
	const currentValue$ = useLazyRef(() => new BehaviorSubject(initialValue))

	const value = useSyncExternalStore(
		(onStoreChange) => {
			const subscription = value$.subscribe((next) => {
				currentValue$.next(next)
				onStoreChange()
			})

			return () => {
				subscription.unsubscribe()
			}
		},
		() => {
			return currentValue$.getValue()
		},
	)

	return value
}

export function createUseValueHook<Value>(value$: BehaviorSubject<Value>) {
	let initialValuePromise: Promise<unknown> | null = null
	function getInitialValuePromise() {
		if (!initialValuePromise) {
			initialValuePromise = firstValueFrom(
				(value$ as Observable<unknown>).pipe(filter((v) => v !== EMPTY_VALUE)),
			)
		}

		return initialValuePromise
	}

	function useValue(): Exclude<Value, EMPTY_TYPE> {
		const currentValue = useObservable(value$, value$.value)

		if (currentValue === EMPTY_VALUE) {
			throw getInitialValuePromise()
		}
		initialValuePromise = null

		return currentValue as Exclude<Value, EMPTY_TYPE>
	}

	function useValueRaw() {
		const currentValue = useObservable(value$, value$.value)

		return currentValue
	}

	return { useValue, useValueRaw }
}
