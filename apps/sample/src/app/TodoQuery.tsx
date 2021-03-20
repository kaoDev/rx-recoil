import { useQuery } from '@rx-recoil/query';
import React, { Suspense, useState } from 'react';

const todoFetcher = (
  id: string,
): Promise<{
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}> => {
  return fetch(
    `https://jsonplaceholder.typicode.com/todos/${id}`,
  ).then((response) => response.json());
};

function Todo({ id }: { id: string }) {
  const todo = useQuery(id, todoFetcher);
  return <div>{JSON.stringify(todo, null, 2)}</div>;
}

export function TodoQuery() {
  const [id, setId] = useState('1');
  return (
    <section>
      <h2>Todo:</h2>
      <input type="number" onChange={(e) => setId(e.target.value)} value={id} />
      <Suspense fallback={<div>loading</div>}>
        <Todo id={id} />
      </Suspense>
    </section>
  );
}
