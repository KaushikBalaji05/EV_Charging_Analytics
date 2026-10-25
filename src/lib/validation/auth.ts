import { z } from "zod";
import { AUTH } from "@/lib/config";
import { positiveInt } from "@/lib/validation/common";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(AUTH.minPasswordLength, `Password must be at least ${AUTH.minPasswordLength} characters`)
  .max(AUTH.maxPasswordLength, `Password must be at most ${AUTH.maxPasswordLength} characters`);

const roleSchema = z.enum(["ADMIN", "ANALYST"], { error: "Role must be ADMIN or ANALYST" });

/** POST /api/auth/login. Length rules for the password are NOT enforced here, only presence. */
export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(AUTH.maxPasswordLength, "Password is too long"),
});

/** POST /api/admin/users. strict(): unknown keys (e.g. passwordHash) are rejected, not ignored. */
export const CreateUserSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    role: roleSchema,
    password: passwordSchema,
  })
  .strict();

/** PATCH /api/admin/users/[id]: at least one allowed field. */
export const UpdateUserSchema = z
  .object({
    displayName: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Provide at least one field to change" });

export const UserIdSchema = positiveInt;

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
