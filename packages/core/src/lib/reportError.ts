export type ErrorReporter = (error: Error) => void

export const reportError =
	(report?: ErrorReporter) => (error: unknown, fallbackMessage: string) => {
		if (error instanceof Error) {
			report?.(error)
			return
		}
		report?.(new Error(fallbackMessage))
	}
