export function pick<T extends object, K extends keyof T>(
  object: T,
  keys: readonly K[],
): Pick<T, K> {
  return keys.reduce(
    (result, key) => {
      result[key] = object[key];
      return result;
    },
    {} as Pick<T, K>,
  );
}
