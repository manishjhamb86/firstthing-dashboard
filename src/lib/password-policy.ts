/**
 * One password rule, shared, rather than the ">= 8" check retyped at every
 * call site (2026-10-20) — the length floor matches what this codebase
 * already enforces for a temporary password on account creation
 * (portal-authority.ts's checkAccountCreate, the admin/ops reset forms).
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A viewer changing their own password (2026-10-20, user-asked: "a user can
 * change his password after login"). Pure — the one thing it cannot check,
 * whether the stated CURRENT password actually matches, needs bcrypt and the
 * stored hash, so that stays in the Server Action; this is everything about
 * the NEW password that can be judged without either.
 */
export function refusePasswordChange(input: {
  newPassword: string;
  confirmPassword: string;
}): string | null {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (input.newPassword !== input.confirmPassword) {
    return "The two passwords don't match.";
  }
  return null;
}
