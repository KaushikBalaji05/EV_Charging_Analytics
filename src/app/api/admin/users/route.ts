import { handleAuthed, ok, readJson } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { createUser, listUsers } from "@/lib/db/queries/users";
import { CreateUserSchema } from "@/lib/validation/auth";

/** GET /api/admin/users: ADMIN only. Never includes password hashes. */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => ok({ users: await listUsers() }));
}

/**
 * POST /api/admin/users: ADMIN only. body: { email, displayName, role, password }
 * 201 created | 400 invalid input | 401 | 403 | 409 email already registered
 */
export async function POST(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const input = CreateUserSchema.parse(await readJson(request));
    const user = await createUser({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
    return ok({ user }, { status: 201 });
  });
}
