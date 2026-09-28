/** True once an ISO timestamp is in the past. */
export function hasExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
