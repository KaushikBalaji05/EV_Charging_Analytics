/**
 * Creates a user (use it for the FIRST administrator).
 *
 *   npm run user:create -- --email you@example.com --name "Your Name" --role ADMIN
 *
 * The password is read from a hidden prompt (or from stdin when piped), so it never
 * appears in shell history, environment files or the repository.
 * Reuses the same validation and Argon2id hashing as the API.
 */
import readline from "node:readline";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      // Piped input (automation): first line is the password.
      const rl = readline.createInterface({ input: process.stdin });
      rl.once("line", (line) => {
        resolve(line); // resolve BEFORE close(): close() fires the 'close' handler synchronously
        rl.close();
      });
      rl.once("close", () => reject(new Error("No password supplied on stdin")));
      return;
    }
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\u0003") process.exit(130); // Ctrl+C
        if (c === "\r" || c === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  try {
    process.loadEnvFile(".env.local"); // same file Next.js uses
  } catch {
    /* fine if variables are already in the environment */
  }
  // Imported after the env is loaded so the pool sees DATABASE_URL.
  const { CreateUserSchema } = await import("@/lib/validation/auth");
  const { hashPassword } = await import("@/lib/auth/password");
  const { createUser } = await import("@/lib/db/queries/users");
  const { getPool } = await import("@/lib/db/pool");

  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? "ANALYST").toUpperCase();
  if (!email || !name) {
    console.error('Usage: npm run user:create -- --email <email> --name "<display name>" [--role ADMIN|ANALYST]');
    process.exitCode = 2;
    return;
  }

  const password = await readHidden("Password (min 12 characters, input hidden): ");
  if (process.stdin.isTTY) {
    const again = await readHidden("Repeat password: ");
    if (again !== password) {
      console.error("Passwords do not match. Nothing was created.");
      process.exitCode = 1;
      return;
    }
  }

  const parsed = CreateUserSchema.safeParse({ email, displayName: name, role, password });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const user = await createUser({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    });
    console.log(`Created ${user.role} account for ${user.email} (id ${user.userId}).`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") console.error("A user with that email already exists.");
    else if (code === "42P01") console.error("The users table is missing. Apply database/migrations/003_users_and_sessions.sql first.");
    else console.error("Could not create the user. Check DATABASE_URL and that the database is running.");
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", (err as Error).message);
  process.exitCode = 1;
});
