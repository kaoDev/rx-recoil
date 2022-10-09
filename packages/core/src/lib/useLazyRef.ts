import { useRef } from 'react'

export function useLazyRef<T>(fn: () => T) {
	const ref = useRef<T>()
	if (!ref.current) {
		ref.current = fn()
	}
	return ref.current
}
