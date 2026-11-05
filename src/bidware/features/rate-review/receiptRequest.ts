/** Local response retirement only; conveys no authentication or business authority. */
export function createReceiptRequest<T>(publish: (binding: string, value: T) => void) {
  let generation = 0;
  let retired = false;
  return {
    async load(binding: string, read: () => Promise<T>, failed: T) {
      if (retired) return;
      const current = ++generation;
      let value: T;
      try { value = await read(); } catch { value = failed; }
      if (!retired && current === generation) publish(binding, value);
    },
    retire() { retired = true; generation++; },
  };
}
