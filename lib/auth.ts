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
