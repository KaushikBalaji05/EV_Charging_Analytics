import { ApiError } from "@/lib/api/errors";
import { handleAuthed, ok, readJson } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { updateUser } from "@/lib/db/queries/users";
import { UpdateUserSchema, UserIdSchema } from "@/lib/validation/auth";

/**
 * PATCH /api/admin/users/[id]: ADMIN only.
 * body: any of { displayName, role, isActive, password } (unknown fields are rejected)
 * 200 updated | 400 invalid | 401 | 403 | 404 no such user
 * 409 would remove the last active administrator (database trigger trg_protect_last_admin)
 * Deactivating a user or resetting a password revokes all of that user's sessions.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ADMIN", async () => {
    const id = UserIdSchema.parse((await ctx.params).id);
    const { password, ...patch } = UpdateUserSchema.parse(await readJson(request));
    const user = await updateUser(id, patch, password === undefined ? undefined : await hashPassword(password));
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found.");
    return ok({ user });
  });
}
