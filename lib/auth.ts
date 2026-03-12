import { fail } from "@/lib/http";

export function readPhotographerId(headers: Headers) {
  const photographerId = headers.get("x-photographer-id");
  if (!photographerId) {
    return {
      error: fail("UNAUTHORIZED", "Missing x-photographer-id header", 401),
    };
  }

  return { photographerId };
}

export function readCartToken(headers: Headers) {
  const cartToken = headers.get("x-cart-token");
  if (!cartToken) {
    return {
      error: fail("GALLERY_ACCESS_DENIED", "Missing x-cart-token header", 401),
    };
  }

  return { cartToken };
}

export function readProjectId(headers: Headers) {
  const projectId = headers.get("x-project-id");
  if (!projectId) {
    return {
      error: fail("CONTEXT_MISMATCH", "Missing x-project-id header", 409),
    };
  }

  return { projectId };
}

export function ensureProjectContext(headers: Headers, expectedProjectId: string) {
  const context = readProjectId(headers);
  if ("error" in context) {
    return context;
  }

  if (context.projectId !== expectedProjectId) {
    return {
      error: fail("CONTEXT_MISMATCH", "Project context mismatch", 409, {
        expectedProjectId,
        requestProjectId: context.projectId,
      }),
    };
  }

  return context;
}
