import React from 'react';
import { atom, selector, useAtom } from '@rx-recoil/core';

function fahrenheitToCelsius(fahrenheit: number) {
	if (isNaN(fahrenheit)) {
		fahrenheit = 0;
	}
	return ((fahrenheit - 32) * 5) / 9;
}
function celsiusToFahrenheit(celsius: number) {
	if (isNaN(celsius)) {
		celsius = 0;
	}
	return (celsius * 9) / 5 + 32;
}

const tempCelsius = atom<number, number>(0, {
	debugKey: 'tempCelsius',
	volatile: false,
});

const tempFahrenheit = selector(
	({ get }) => celsiusToFahrenheit(get(tempCelsius)),
	({ set }, newValue: number) => {
		set(tempCelsius, fahrenheitToCelsius(newValue));
	},
	{
		volatile: true,
	},
);

export function Temperature() {
	const [tempF, setTempF] = useAtom(tempFahrenheit);
	const [tempC, setTempC] = useAtom(tempCelsius);

	const addTenCelsius = () => setTempC(tempC + 10);
	const addTenFahrenheit = () => setTempF(tempF + 10);
	const reset = () => setTempC(0);

	return (
		<section>
			<h2>selector state example</h2>
			<p>
				Temp (Celsius): {tempC}
				<br />
				Temp (Fahrenheit): {tempF}
			</p>
			<p>
				<label>
					°C{' '}
					<input
						value={Math.round(tempC)}
						onChange={(event) => setTempC(parseInt(event.target.value, 10))}
					/>
				</label>
				<br />
				<label>
					°F{' '}
					<input
						value={Math.round(tempF)}
						onChange={(event) => setTempF(parseInt(event.target.value, 10))}
					/>
				</label>
			</p>
			<p>
				<button onClick={addTenCelsius}>Add 10 Celsius</button>
			</p>
			<p>
				<button onClick={addTenFahrenheit}>Add 10 Fahrenheit</button>
			</p>
			<p>
				<button onClick={reset}>Reset</button>
			</p>
		</section>
	);
}
