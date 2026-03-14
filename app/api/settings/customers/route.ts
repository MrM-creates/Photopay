import { readPhotographerId } from "@/lib/auth";
import { buildCustomerFullName } from "@/lib/customers";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type CustomerRow = {
  id: string;
  customer_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  email: string;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
};

type GalleryRow = {
  id: string;
  title: string;
  customer_id: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const customersExtended = await supabase
    .from("customers")
    .select("id,customer_number,first_name,last_name,full_name,email,note,last_used_at,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  let customers: CustomerRow[] = [];
  if (isMissingSchemaObjectError(customersExtended.error)) {
    const customersFallback = await supabase
      .from("customers")
      .select("id,full_name,email,note,last_used_at,created_at")
      .eq("photographer_id", auth.photographerId)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (isMissingSchemaObjectError(customersFallback.error)) {
      return ok({
        featureReady: false,
        migration: "20260312_0003_customers_and_engagement.sql",
        customers: [],
      });
    }
    if (customersFallback.error) {
      return fail("DB_ERROR", customersFallback.error.message, 500);
    }
    customers = customersFallback.data as CustomerRow[];
  } else if (customersExtended.error) {
    return fail("DB_ERROR", customersExtended.error.message, 500);
  } else {
    customers = customersExtended.data as CustomerRow[];
  }
  const customerIds = customers.map((entry) => entry.id);
  if (customerIds.length === 0) {
    return ok({
      featureReady: true,
      customers: [],
    });
  }

  const galleriesQuery = await supabase
    .from("galleries")
    .select("id,title,customer_id,status,updated_at,created_at")
    .eq("photographer_id", auth.photographerId)
    .in("customer_id", customerIds);

  if (galleriesQuery.error && !isMissingSchemaObjectError(galleriesQuery.error)) {
    return fail("DB_ERROR", galleriesQuery.error.message, 500);
  }

  const galleries = (galleriesQuery.error ? [] : galleriesQuery.data) as GalleryRow[];
  const galleriesSorted = [...galleries].sort((left, right) => {
    const leftAt = new Date(left.updated_at || left.created_at).getTime();
    const rightAt = new Date(right.updated_at || right.created_at).getTime();
    return rightAt - leftAt;
  });
  const galleryIds = galleries.map((entry) => entry.id);
  const paidOrderCountByGalleryId = new Map<string, number>();

  if (galleryIds.length > 0) {
    const paidOrders = await supabase
      .from("orders")
      .select("id,gallery_id")
      .in("gallery_id", galleryIds)
      .eq("payment_status", "paid");

    if (!paidOrders.error) {
      for (const order of paidOrders.data) {
        paidOrderCountByGalleryId.set(order.gallery_id, (paidOrderCountByGalleryId.get(order.gallery_id) ?? 0) + 1);
      }
    } else if (!isMissingSchemaObjectError(paidOrders.error)) {
      return fail("DB_ERROR", paidOrders.error.message, 500);
    }
  }

  const statsByCustomerId = new Map<
    string,
    {
      projectCount: number;
      draftProjectCount: number;
      liveProjectCount: number;
      archivedProjectCount: number;
      paidOrderCount: number;
      lastProjectSavedAt: string | null;
    }
  >();
  const linkedProjectsByCustomerId = new Map<
    string,
    Array<{ id: string; title: string; status: "draft" | "published" | "archived"; updatedAt: string }>
  >();

  for (const gallery of galleriesSorted) {
    if (!gallery.customer_id) continue;
    const current = statsByCustomerId.get(gallery.customer_id) ?? {
      projectCount: 0,
      draftProjectCount: 0,
      liveProjectCount: 0,
      archivedProjectCount: 0,
      paidOrderCount: 0,
      lastProjectSavedAt: null,
    };

    current.projectCount += 1;
    if (gallery.status === "draft") current.draftProjectCount += 1;
    if (gallery.status === "published") current.liveProjectCount += 1;
    if (gallery.status === "archived") current.archivedProjectCount += 1;
    current.paidOrderCount += paidOrderCountByGalleryId.get(gallery.id) ?? 0;

    const lastSavedCandidate = gallery.updated_at || gallery.created_at;
    if (!current.lastProjectSavedAt || new Date(lastSavedCandidate).getTime() > new Date(current.lastProjectSavedAt).getTime()) {
      current.lastProjectSavedAt = lastSavedCandidate;
    }

    statsByCustomerId.set(gallery.customer_id, current);

    const linkedProjects = linkedProjectsByCustomerId.get(gallery.customer_id) ?? [];
    linkedProjects.push({
      id: gallery.id,
      title: gallery.title,
      status: gallery.status,
      updatedAt: lastSavedCandidate,
    });
    linkedProjectsByCustomerId.set(gallery.customer_id, linkedProjects);
  }

  return ok({
    featureReady: true,
    customers: customers.map((entry) => {
      const stats = statsByCustomerId.get(entry.id) ?? {
        projectCount: 0,
        draftProjectCount: 0,
        liveProjectCount: 0,
        archivedProjectCount: 0,
        paidOrderCount: 0,
        lastProjectSavedAt: null,
      };

      return {
        id: entry.id,
        customerNumber: entry.customer_number ?? null,
        firstName: entry.first_name ?? null,
        lastName: entry.last_name ?? null,
        fullName: buildCustomerFullName({
          fullName: entry.full_name,
          firstName: entry.first_name ?? null,
          lastName: entry.last_name ?? null,
        }),
        email: entry.email,
        note: entry.note,
        lastUsedAt: entry.last_used_at,
        createdAt: entry.created_at,
        projectCount: stats.projectCount,
        draftProjectCount: stats.draftProjectCount,
        liveProjectCount: stats.liveProjectCount,
        archivedProjectCount: stats.archivedProjectCount,
        paidOrderCount: stats.paidOrderCount,
        lastProjectSavedAt: stats.lastProjectSavedAt,
        linkedProjects: (linkedProjectsByCustomerId.get(entry.id) ?? []).map((project) => ({
          id: project.id,
          title: project.title,
          status: project.status,
          updatedAt: project.updatedAt,
        })),
      };
    }),
  });
}
