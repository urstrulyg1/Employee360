import { db } from "@/db";
import { careerAchievements, careerGoals, employeeProfiles, performanceEvidence } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { ACHIEVEMENT_CATEGORIES, GOAL_HORIZONS } from "@/lib/domain";

export const GET = handle(async () => {
  const user = await requireUser();
  const [goals, achievements, promotion, profile] = await Promise.all([
    db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt))).orderBy(careerGoals.targetDate),
    db.select().from(careerAchievements).where(and(eq(careerAchievements.userId, user.id), isNull(careerAchievements.deletedAt))).orderBy(desc(careerAchievements.achievedDate)),
    db.select().from(performanceEvidence).where(eq(performanceEvidence.userId, user.id)).limit(1),
    db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1),
  ]);
  return ok({ goals, achievements, promotion: promotion[0] ?? null, profile: profile[0] ?? null });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const entity = String(body.entity ?? "");

  if (entity === "goal") {
    const title = String(body.title ?? "").trim();
    if (!title) throw new ApiError(400, "Goal title required");
    const horizon = GOAL_HORIZONS.includes(body.horizon as never) ? String(body.horizon) : "quarterly";
    const [row] = await db.insert(careerGoals).values({
      userId: user.id, title, horizon,
      description: (body.description as string) || null,
      targetDate: (body.targetDate as string) || null,
      progress: Math.min(100, Math.max(0, Number(body.progress ?? 0))),
      status: String(body.status ?? "not_started"),
      evidence: (body.evidence as string) || null,
      completionNotes: (body.completionNotes as string) || null,
    }).returning();
    await audit(user.id, "goal", row.id, "created", { title });
    return ok(row, 201);
  }

  if (entity === "achievement") {
    const title = String(body.title ?? "").trim();
    if (!title) throw new ApiError(400, "Achievement title required");
    const category = ACHIEVEMENT_CATEGORIES.includes(body.category as never) ? String(body.category) : "technical";
    const [row] = await db.insert(careerAchievements).values({
      userId: user.id, title, category,
      description: (body.description as string) || null,
      impact: (body.impact as string) || null,
      achievedDate: (body.achievedDate as string) || null,
      evidenceUrl: (body.evidenceUrl as string) || null,
    }).returning();
    await audit(user.id, "achievement", row.id, "created", { title });
    return ok(row, 201);
  }

  if (entity === "promotion") {
    const fields = {
      targetRole: (body.targetRole as string) || null,
      requiredCompetencies: (body.requiredCompetencies as string) || null,
      demonstratedSkills: (body.demonstratedSkills as string) || null,
      achievementsSummary: (body.achievementsSummary as string) || null,
      evidenceLinks: (body.evidenceLinks as string) || null,
      feedback: (body.feedback as string) || null,
      developmentGaps: (body.developmentGaps as string) || null,
      nextSteps: (body.nextSteps as string) || null,
    };
    const [row] = await db.insert(performanceEvidence).values({ userId: user.id, ...fields })
      .onConflictDoUpdate({ target: performanceEvidence.userId, set: { ...fields, updatedAt: new Date() } })
      .returning();
    await audit(user.id, "promotion", row.id, "updated");
    return ok(row, 201);
  }

  throw new ApiError(400, "Unknown entity (goal | achievement | promotion).");
});

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const entity = String(body.entity ?? "");
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");

  if (entity === "goal") {
    const [existing] = await db.select().from(careerGoals)
      .where(and(eq(careerGoals.id, id), eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt))).limit(1);
    if (!existing) throw new ApiError(404, "Goal not found");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["title", "description", "horizon", "targetDate", "status", "evidence", "completionNotes"]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (body.progress !== undefined) patch.progress = Math.min(100, Math.max(0, Number(body.progress)));
    const [row] = await db.update(careerGoals).set(patch).where(eq(careerGoals.id, id)).returning();
    await audit(user.id, "goal", id, "updated");
    return ok(row);
  }

  if (entity === "achievement") {
    const [existing] = await db.select().from(careerAchievements)
      .where(and(eq(careerAchievements.id, id), eq(careerAchievements.userId, user.id), isNull(careerAchievements.deletedAt))).limit(1);
    if (!existing) throw new ApiError(404, "Achievement not found");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["title", "description", "impact", "category", "achievedDate", "evidenceUrl"]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const [row] = await db.update(careerAchievements).set(patch).where(eq(careerAchievements.id, id)).returning();
    await audit(user.id, "achievement", id, "updated");
    return ok(row);
  }

  throw new ApiError(400, "Unknown entity.");
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ entity?: string; id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  if (body.entity === "goal") {
    await db.update(careerGoals).set({ deletedAt: new Date() })
      .where(and(eq(careerGoals.id, body.id), eq(careerGoals.userId, user.id)));
  } else if (body.entity === "achievement") {
    await db.update(careerAchievements).set({ deletedAt: new Date() })
      .where(and(eq(careerAchievements.id, body.id), eq(careerAchievements.userId, user.id)));
  } else {
    throw new ApiError(400, "Unknown entity.");
  }
  await audit(user.id, String(body.entity), body.id, "deleted");
  return ok({ deleted: true });
});
