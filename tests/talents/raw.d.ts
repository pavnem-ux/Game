/** Vite `?raw` imports (text of a file) used by the catalog check. */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
