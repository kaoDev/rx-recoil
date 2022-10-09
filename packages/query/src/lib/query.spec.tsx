import React, { ReactNode, Suspense, useEffect } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createStateContextValue, StateRoot } from '@rx-recoil/core';
import '@testing-library/jest-dom';
import {
	useMutableQuery,
	usePrefetchCallback,
	useQuery,
	useQueryRaw,
} from './query';
import { act } from 'react-dom/test-utils';
import { renderHookInStateRoot } from './testHelpers';

describe('query', () => {
	beforeEach(() => {
		cleanup();
	});
	it('should render query result as soon as it is available', async () => {
		const testPromise = new Promise<string>((resolve) => {
			setTimeout(() => {
				resolve('test value');
			});
		});
		const fetcher = jest.fn(() => {
			return testPromise;
		});

		function Tester() {
			const { data, error, loading } = useQueryRaw('test/1', fetcher);

			if (loading) return <div>loading...</div>;
			if (error) return <div>error!</div>;

			return <div>{data}</div>;
		}

		const { getByText } = render(
			<StateRoot>
				<Tester></Tester>
			</StateRoot>,
		);

		const fallback = getByText(/loading/);
		expect(fallback).toBeInTheDocument();
		const delayedElement = await waitFor(() => getByText(/test value/));

		expect(delayedElement).toBeInTheDocument();
	});

	it('should render query result as soon as it is available with suspense', async () => {
		const testPromise = new Promise<string>((resolve) => {
			setTimeout(() => {
				resolve('test value');
			});
		});
		const fetcher = jest.fn(() => {
			return testPromise;
		});

		function Tester() {
			const [data] = useQuery('test/1', fetcher);

			return <div>{data}</div>;
		}

		const { getByText } = render(
			<StateRoot>
				<Suspense fallback={<div>loading...</div>}>
					<Tester></Tester>
				</Suspense>
			</StateRoot>,
		);

		const fallback = getByText(/loading\.\.\./);
		expect(fallback).toBeInTheDocument();
		const delayedElement = await waitFor(() => getByText(/test value/));
		expect(fallback).not.toBeInTheDocument();

		expect(delayedElement).toBeInTheDocument();
	});

	it('should return error state when fetcher rejects', async () => {
		const testPromise = new Promise<string>((_resolve, reject) => {
			setTimeout(() => {
				reject(new Error('test Error'));
			});
		});
		const fetcher = jest.fn(() => {
			return testPromise;
		});

		function Tester() {
			const { data, error, loading } = useQueryRaw('test/1', fetcher);

			if (loading) return <div>loading...</div>;
			if (error) return <div>error!</div>;

			return <div>{data}</div>;
		}

		const { getByText } = render(
			<StateRoot>
				<Tester></Tester>
			</StateRoot>,
		);

		const fallback = getByText(/loading/);
		expect(fallback).toBeInTheDocument();
		const errorElement = await waitFor(() => getByText(/error!/));

		expect(errorElement).toBeInTheDocument();
	});

	it('should throw error state when fetcher rejects', async () => {
		const spy = jest.spyOn(console, 'error');
		spy.mockImplementation(() => undefined);

		const testPromise = new Promise<string>((_resolve, reject) => {
			setTimeout(() => {
				reject(new Error('test Error'));
			});
		});
		const fetcher = jest.fn(() => {
			return testPromise;
		});

		function Tester() {
			const [data] = useQuery('test/1', fetcher);

			return <div>{data}</div>;
		}

		const { getByText } = render(
			<StateRoot>
				<Suspense fallback={<div>loading...</div>}>
					<ErrorBoundary>
						<Tester></Tester>
					</ErrorBoundary>
				</Suspense>
			</StateRoot>,
		);

		const fallback = getByText(/loading/);
		expect(fallback).toBeInTheDocument();
		const errorElement = await waitFor(() =>
			getByText(/Error boundary fallback/),
		);

		expect(errorElement).toBeInTheDocument();

		spy.mockRestore();
	});

	it('should use prefetched data for query hook', async () => {
		const stateRootValue = createStateContextValue();
		const testPromise1 = new Promise<string>((resolve) => {
			setTimeout(() => {
				resolve('test value');
			});
		});
		const fetcher = jest.fn().mockReturnValue(testPromise1);

		function Tester() {
			const [data] = useQuery<string>('test/1', fetcher);

			return <div>{data}</div>;
		}

		function Prefetcher() {
			const prefetch = usePrefetchCallback(fetcher);
			useEffect(() => {
				prefetch('test/1');
				prefetch('test/1');
				prefetch('test/1');
			}, [prefetch]);

			return null;
		}

		const { findByText, rerender } = render(
			<StateRoot context={stateRootValue}>
				<Suspense fallback={<div>loading...</div>}>
					<Prefetcher />
				</Suspense>
			</StateRoot>,
		);

		expect(fetcher).toBeCalledTimes(1);

		await act(async () => {
			await testPromise1;
		});

		rerender(
			<StateRoot context={stateRootValue}>
				<Suspense fallback={<div>loading...</div>}>
					<Tester></Tester>
				</Suspense>
			</StateRoot>,
		);

		const delayedElement = await findByText('test value');

		expect(fetcher).toBeCalledTimes(1);
		expect(delayedElement).toBeInTheDocument();
	});

	it('should not prefetch if da is already queried', async () => {
		const stateRootValue = createStateContextValue();
		const testPromise1 = new Promise<string>((resolve) => {
			setTimeout(() => {
				resolve('test value 1');
			});
		});
		const fetcher = jest.fn().mockReturnValue(testPromise1);

		function Tester() {
			const [data] = useQuery<string>('test/1', fetcher);

			return <div>{data}</div>;
		}

		function Prefetcher() {
			const prefetch = usePrefetchCallback(fetcher);
			useEffect(() => {
				prefetch('test/1');
			}, [prefetch]);

			return null;
		}

		const { findByText, rerender } = render(
			<StateRoot context={stateRootValue}>
				<Suspense fallback={<div>loading...</div>}>
					<Tester></Tester>
					<Prefetcher />
				</Suspense>
			</StateRoot>,
		);

		expect(fetcher).toBeCalledTimes(1);

		await act(async () => {
			await testPromise1;
		});

		rerender(
			<StateRoot context={stateRootValue}>
				<Suspense fallback={<div>loading...</div>}>
					<Prefetcher />
					<Tester></Tester>
				</Suspense>
			</StateRoot>,
		);

		const delayedElement = await findByText('test value 1');

		expect(fetcher).toBeCalledTimes(1);
		expect(delayedElement).toBeInTheDocument();
	});

	it('should provide access to changed data based on key', async () => {
		const initialPromise = new Promise<number>((resolve) => {
			resolve(1);
		});
		const initialPromise2 = new Promise<number>((resolve) => {
			resolve(2);
		});

		const fetcher = jest.fn(async (key: string) => {
			if (key === '1') {
				return 1;
			} else {
				return 2;
			}
		});
		const { rerender, result } = renderHookInStateRoot(
			({ key, initial }: { key: string; initial?: Promise<number> }) =>
				useQuery(key, fetcher, { initialData: () => initial }),
			{
				initialProps: { key: '1', initial: initialPromise },
			},
		);

		await act(async () => {
			await tick();
		});

		expect(result.current[0]).toBe(1);

		rerender({ key: '2', initial: initialPromise2 });

		await act(async () => {
			await tick();
		});
		expect(result.current[0]).toBe(2);
	});

	it('should provide access a mutate function to change the query data', async () => {
		const initialPromise = new Promise<number>((resolve) => {
			resolve(1);
		});

		const fetcher = jest.fn(async (key: string) => {
			if (key === '1') {
				return 1;
			} else {
				return 2;
			}
		});
		const mutator = jest.fn(async (payload: number) => {
			await tick();
			return payload;
		});
		const { result } = renderHookInStateRoot(
			({ key, initial }: { key: string; initial?: Promise<number> }) =>
				useMutableQuery(key, fetcher, mutator, { initialData: () => initial }),
			{
				initialProps: { key: '1', initial: initialPromise },
			},
		);

		await act(async () => {
			await tick();
		});

		expect(result.current[0]).toBe(1);

		const mutate = result.current[3];

		const mutationPromise = mutate({ payload: 5, optimisticUpdate: 4 });

		await act(async () => {
			await mutationPromise;
			await tick();
		});
		expect(result.current[0]).toBe(5);
	});
});

class ErrorBoundary extends React.Component<
	{ children: ReactNode },
	{ hasError: boolean; error: Error | null }
> {
	constructor(props: { children: ReactNode }) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error) {
		// Update state so the next render will show the fallback UI.
		return { hasError: true, error };
	}
	override componentDidCatch(error: Error) {
		this.setState({ hasError: true, error });
	}

	override render() {
		if (this.state.hasError) {
			return <div>Error boundary fallback</div>;
		}

		return this.props.children;
	}
}

async function tick() {
	await new Promise((r) => setTimeout(r));
}
