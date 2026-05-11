/**
 * Quote a shell argument safely using single quotes.
 * Handles embedded single quotes by ending the quote, adding an escaped quote, and re-opening.
 */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
