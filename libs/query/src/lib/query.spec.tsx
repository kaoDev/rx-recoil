import React, { Suspense, useEffect } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createStateContextValue, StateRoot } from '@rx-recoil/core';
import '@testing-library/jest-dom';
import { usePrefetchCallback, useQuery, useQueryRaw } from './query';
import { act } from 'react-dom/test-utils';

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
        resolve('test value 1');
      });
    });
    const fetcher = jest.fn().mockReturnValueOnce(testPromise1);

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

    const { findByText, rerender, container } = render(
      <StateRoot context={stateRootValue}>
        <Suspense fallback={<div>loading...</div>}>
          <Prefetcher />
        </Suspense>
      </StateRoot>,
    );

    expect(container).toMatchInlineSnapshot(`<div />`);
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

    const delayedElement = await findByText('test value 1');

    expect(fetcher).toBeCalledTimes(1);
    expect(delayedElement).toBeInTheDocument();
  });
});

class ErrorBoundary extends React.Component<
  any,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    this.setState({ hasError: true, error });
  }

  render() {
    if (this.state.hasError) {
      return <div>Error boundary fallback</div>;
    }

    return this.props.children;
  }
}
