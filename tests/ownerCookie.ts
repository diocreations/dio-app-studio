import type { Project } from '../src/worker/db'
import { createOwnerSession, ownerCookieName } from '../src/worker/ownerAuth'

/** A real dashboard session for tests that edit a project. */
export async function ownerCookieFor(db: D1Database, project: Project): Promise<string> {
  const session = await createOwnerSession(db, project.id)
  return `${ownerCookieName(project.token)}=${session.id}`
}
