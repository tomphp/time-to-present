export const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
