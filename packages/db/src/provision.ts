import type { Locale, Prisma, PrismaClient, Role } from "./generated/prisma/client.js";

export type ProvisionedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
  locale?: Locale;
  pincodes?: readonly string[];
};

/**
 * Creates a user who can sign in with email and password. Accounts are
 * provisioned by the lender, never self-registered (sign-up is disabled), so
 * the seed and the test fixtures both go through here.
 *
 * `passwordHash` comes from better-auth/crypto's hashPassword; hash once and
 * reuse it, since hashing is deliberately slow.
 */
export function provisionUser(
  db: PrismaClient | Prisma.TransactionClient,
  user: ProvisionedUser,
  passwordHash: string,
) {
  return db.user.create({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      role: user.role,
      branchId: user.branchId,
      ...(user.locale ? { locale: user.locale } : {}),
      accounts: {
        create: {
          id: `acc_${user.id}`,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      },
      pincodes: { create: (user.pincodes ?? []).map((pincode) => ({ pincode })) },
    },
  });
}
