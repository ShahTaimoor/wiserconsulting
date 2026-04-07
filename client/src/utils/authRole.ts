/** Matches admin checks used across the app; API/JSON may send role as number or string. */
export function isAdminRole(role: string | number | undefined): boolean {
  return role === 1 || role === "1" || role === "admin";
}
