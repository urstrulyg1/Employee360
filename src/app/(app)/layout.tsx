import { redirect } from "next/navigation";
import { db } from "@/db";
import { employeeProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [profile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1);

  return (
    <Shell
      user={{
        name: user.name,
        email: user.email,
        avatarColor: profile?.avatarColor ?? "#6366f1",
        designation: profile?.designation ?? null,
      }}
    >
      {children}
    </Shell>
  );
}
