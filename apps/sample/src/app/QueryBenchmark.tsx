import { useQuery } from '@rx-recoil/query'
import { Suspense, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

function ErrorFallback({
	error,
	resetErrorBoundary,
}: {
	error: Error
	resetErrorBoundary: () => void
}) {
	return (
		<div role="alert">
			<p>Something went wrong:</p>
			<pre>{error.message}</pre>
			<button onClick={resetErrorBoundary}>Reset</button>
		</div>
	)
}

const todoFetcher = (
	id: string,
): Promise<{
	userId: number
	id: number
	title: string
	completed: boolean
}> => {
	return fetch(`https://jsonplaceholder.typicode.com/todos/${id}`).then(
		(response) => {
			if (response.status >= 400) {
				throw new Error(
					`Failed to request data, got ${response.status} as server status`,
				)
			}
			return response.json()
		},
	)
}

function Todo({ id }: { id: string }) {
	const [todo] = useQuery(id, todoFetcher)
	return (
		<div style={{ textAlign: 'left' }}>
			<pre
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(todo, null, 2),
				}}
			/>
		</div>
	)
}

export function QueryBenchmark() {
	const [id, setId] = useState('1')
	return (
		<section>
			<h2>Todo:</h2>
			<label>
				<p>choose todo id to load:</p>
				<input
					style={{ marginBottom: 20 }}
					type="number"
					onChange={(e) => setId(e.target.value)}
					value={id}
				/>
			</label>
			<ErrorBoundary
				FallbackComponent={ErrorFallback}
				onReset={() => setId('1')}
				resetKeys={[id]}
			>
				<Suspense fallback={<div>loading</div>}>
					{Array.from({ length: 100 }).map((_, i) => (
						<Todo id={id} key={`${i}-${id}`} />
					))}
				</Suspense>
			</ErrorBoundary>
		</section>
	)
}
