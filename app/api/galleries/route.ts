import { hash } from "bcryptjs";
import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { upsertCustomerForPhotographer } from "@/lib/customers";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { toPublicSlug } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const createGallerySchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  customer: z
    .discriminatedUnion("mode", [
      z.object({
        mode: z.literal("existing"),
        customerId: z.string().uuid(),
      }),
      z.object({
        mode: z.literal("new"),
        fullName: z.string().trim().min(1).max(180),
        email: z.string().trim().email().max(320),
        note: z.string().trim().max(1000).optional(),
      }),
    ])
    .optional(),
});

type BaseGalleryRow = {
  id: string;
  title: string;
  description: string | null;
  public_slug: string;
  status: string;
  published_at: string | null;
  cover_asset_id: string | null;
  archive_after_days?: number | null;
  never_auto_archive?: boolean | null;
  customer_id?: string | null;
  created_at: string;
};

function mapGalleryStatus(input: {
  paidOrderCount: number;
  purchasedAssetCount: number;
  downloadedAssetCount: number;
  lastAccessAt: string | null;
}): "new" | "active" | "downloads" | "completed" {
  if (input.purchasedAssetCount > 0 && input.downloadedAssetCount >= input.purchasedAssetCount) {
    return "completed";
  }
  if (input.downloadedAssetCount > 0) {
    return "downloads";
  }
  if (input.lastAccessAt || input.paidOrderCount > 0) {
    return "active";
  }
  return "new";
}

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();

  let supportsLifecycleColumns = true;
  let supportsCustomerColumns = true;

  let baseGalleryRows: BaseGalleryRow[] = [];

  const queryAllColumns = await supabase
    .from("galleries")
    .select(
      "id,title,description,public_slug,status,published_at,cover_asset_id,archive_after_days,never_auto_archive,customer_id,created_at",
    )
    .eq("photographer_id", auth.photographerId)
    .order("created_at", { ascending: false });

  if (isMissingSchemaObjectError(queryAllColumns.error)) {
    const queryLifecycleOnly = await supabase
      .from("galleries")
      .select("id,title,description,public_slug,status,published_at,cover_asset_id,archive_after_days,never_auto_archive,created_at")
      .eq("photographer_id", auth.photographerId)
      .order("created_at", { ascending: false });

    if (isMissingSchemaObjectError(queryLifecycleOnly.error)) {
      const queryCustomerOnly = await supabase
        .from("galleries")
        .select("id,title,description,public_slug,status,published_at,cover_asset_id,customer_id,created_at")
        .eq("photographer_id", auth.photographerId)
        .order("created_at", { ascending: false });

      if (isMissingSchemaObjectError(queryCustomerOnly.error)) {
        supportsLifecycleColumns = false;
        supportsCustomerColumns = false;

        const minimalQuery = await supabase
          .from("galleries")
          .select("id,title,description,public_slug,status,published_at,cover_asset_id,created_at")
          .eq("photographer_id", auth.photographerId)
          .order("created_at", { ascending: false });

        if (minimalQuery.error) {
          return fail("DB_ERROR", minimalQuery.error.message, 500);
        }

        baseGalleryRows = minimalQuery.data.map((row) => ({
          ...row,
          archive_after_days: 90,
          never_auto_archive: false,
          customer_id: null,
        }));
      } else if (queryCustomerOnly.error) {
        return fail("DB_ERROR", queryCustomerOnly.error.message, 500);
      } else {
        supportsLifecycleColumns = false;
        supportsCustomerColumns = true;
        baseGalleryRows = queryCustomerOnly.data.map((row) => ({
          ...row,
          archive_after_days: 90,
          never_auto_archive: false,
        }));
      }
    } else if (queryLifecycleOnly.error) {
      return fail("DB_ERROR", queryLifecycleOnly.error.message, 500);
    } else {
      supportsLifecycleColumns = true;
      supportsCustomerColumns = false;
      baseGalleryRows = queryLifecycleOnly.data.map((row) => ({
        ...row,
        customer_id: null,
      }));
    }
  } else if (queryAllColumns.error) {
    return fail("DB_ERROR", queryAllColumns.error.message, 500);
  } else {
    baseGalleryRows = queryAllColumns.data;
  }

  const galleryIds = baseGalleryRows.map((gallery) => gallery.id);
  if (galleryIds.length === 0) {
    return ok({ galleries: [] });
  }

  const customerById = new Map<string, { id: string; fullName: string; email: string; note: string | null }>();

  if (supportsCustomerColumns) {
    const customerIds = Array.from(new Set(baseGalleryRows.map((row) => row.customer_id).filter((value): value is string => Boolean(value))));

    if (customerIds.length > 0) {
      const customersQuery = await supabase
        .from("customers")
        .select("id,full_name,email,note")
        .in("id", customerIds)
        .eq("photographer_id", auth.photographerId);

      if (isMissingSchemaObjectError(customersQuery.error)) {
        supportsCustomerColumns = false;
      } else if (customersQuery.error) {
        return fail("DB_ERROR", customersQuery.error.message, 500);
      } else {
        for (const customer of customersQuery.data) {
          customerById.set(customer.id, {
            id: customer.id,
            fullName: customer.full_name,
            email: customer.email,
            note: customer.note,
          });
        }
      }
    }
  }

  const [packagesQuery, assetsQuery] = await Promise.all([
    supabase.from("packages").select("id,gallery_id,active").in("gallery_id", galleryIds),
    supabase.from("gallery_assets").select("id,gallery_id,is_active").in("gallery_id", galleryIds),
  ]);

  if (packagesQuery.error) {
    return fail("DB_ERROR", packagesQuery.error.message, 500);
  }

  if (assetsQuery.error) {
    return fail("DB_ERROR", assetsQuery.error.message, 500);
  }

  const packageCountByGallery = new Map<string, number>();
  const assetCountByGallery = new Map<string, number>();

  for (const pkg of packagesQuery.data) {
    if (!pkg.active) continue;
    packageCountByGallery.set(pkg.gallery_id, (packageCountByGallery.get(pkg.gallery_id) ?? 0) + 1);
  }

  for (const asset of assetsQuery.data) {
    if (!asset.is_active) continue;
    assetCountByGallery.set(asset.gallery_id, (assetCountByGallery.get(asset.gallery_id) ?? 0) + 1);
  }

  const lastAccessAtByGallery = new Map<string, string | null>();
  const paidOrderCountByGallery = new Map<string, number>();
  const purchasedAssetCountByGallery = new Map<string, number>();
  const downloadedAssetCountByGallery = new Map<string, number>();

  const accessEventsQuery = await supabase
    .from("gallery_access_events")
    .select("gallery_id,created_at")
    .in("gallery_id", galleryIds)
    .order("created_at", { ascending: false });

  if (!accessEventsQuery.error) {
    for (const event of accessEventsQuery.data) {
      if (!lastAccessAtByGallery.has(event.gallery_id)) {
        lastAccessAtByGallery.set(event.gallery_id, event.created_at);
      }
    }
  } else if (!isMissingSchemaObjectError(accessEventsQuery.error)) {
    return fail("DB_ERROR", accessEventsQuery.error.message, 500);
  }

  const paidOrdersQuery = await supabase
    .from("orders")
    .select("id,gallery_id")
    .in("gallery_id", galleryIds)
    .eq("payment_status", "paid");

  if (paidOrdersQuery.error && !isMissingSchemaObjectError(paidOrdersQuery.error)) {
    return fail("DB_ERROR", paidOrdersQuery.error.message, 500);
  }

  const paidOrders = paidOrdersQuery.error ? [] : paidOrdersQuery.data;
  const paidOrderIds = paidOrders.map((order) => order.id);
  const orderIdToGalleryId = new Map(paidOrders.map((order) => [order.id, order.gallery_id]));

  for (const order of paidOrders) {
    paidOrderCountByGallery.set(order.gallery_id, (paidOrderCountByGallery.get(order.gallery_id) ?? 0) + 1);
  }

  if (paidOrderIds.length > 0) {
    const orderItemsQuery = await supabase.from("order_items").select("id,order_id").in("order_id", paidOrderIds);
    if (orderItemsQuery.error && !isMissingSchemaObjectError(orderItemsQuery.error)) {
      return fail("DB_ERROR", orderItemsQuery.error.message, 500);
    }

    if (!orderItemsQuery.error && orderItemsQuery.data.length > 0) {
      const orderItemIds = orderItemsQuery.data.map((item) => item.id);
      const orderItemIdToGalleryId = new Map<string, string>();

      for (const item of orderItemsQuery.data) {
        const galleryId = orderIdToGalleryId.get(item.order_id);
        if (galleryId) {
          orderItemIdToGalleryId.set(item.id, galleryId);
        }
      }

      const orderItemAssetsQuery = await supabase
        .from("order_item_assets")
        .select("id,order_item_id")
        .in("order_item_id", orderItemIds);

      if (orderItemAssetsQuery.error && !isMissingSchemaObjectError(orderItemAssetsQuery.error)) {
        return fail("DB_ERROR", orderItemAssetsQuery.error.message, 500);
      }

      if (!orderItemAssetsQuery.error && orderItemAssetsQuery.data.length > 0) {
        const orderItemAssetIdToGalleryId = new Map<string, string>();

        for (const itemAsset of orderItemAssetsQuery.data) {
          const galleryId = orderItemIdToGalleryId.get(itemAsset.order_item_id);
          if (!galleryId) continue;
          orderItemAssetIdToGalleryId.set(itemAsset.id, galleryId);
          purchasedAssetCountByGallery.set(galleryId, (purchasedAssetCountByGallery.get(galleryId) ?? 0) + 1);
        }

        const grantsQuery = await supabase
          .from("download_grants")
          .select("order_item_asset_id,download_count")
          .in("order_item_asset_id", orderItemAssetsQuery.data.map((entry) => entry.id));

        if (grantsQuery.error && !isMissingSchemaObjectError(grantsQuery.error)) {
          return fail("DB_ERROR", grantsQuery.error.message, 500);
        }

        if (!grantsQuery.error) {
          for (const grant of grantsQuery.data) {
            if (grant.download_count <= 0) continue;
            const galleryId = orderItemAssetIdToGalleryId.get(grant.order_item_asset_id);
            if (!galleryId) continue;
            downloadedAssetCountByGallery.set(galleryId, (downloadedAssetCountByGallery.get(galleryId) ?? 0) + 1);
          }
        }
      }
    }
  }

  return ok({
    galleries: baseGalleryRows.map((row) => {
      const paidOrderCount = paidOrderCountByGallery.get(row.id) ?? 0;
      const purchasedAssetCount = purchasedAssetCountByGallery.get(row.id) ?? 0;
      const downloadedAssetCount = downloadedAssetCountByGallery.get(row.id) ?? 0;
      const lastAccessAt = lastAccessAtByGallery.get(row.id) ?? null;
      const linkedCustomer = supportsCustomerColumns && row.customer_id ? customerById.get(row.customer_id) ?? null : null;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        publicSlug: row.public_slug,
        status: row.status,
        publishedAt: row.published_at,
        coverAssetId: row.cover_asset_id,
        archiveAfterDays: supportsLifecycleColumns ? (row.archive_after_days ?? 90) : 90,
        neverAutoArchive: supportsLifecycleColumns ? Boolean(row.never_auto_archive) : false,
        customerId: supportsCustomerColumns ? row.customer_id ?? null : null,
        customerName: linkedCustomer?.fullName ?? null,
        customerEmail: linkedCustomer?.email ?? null,
        customerNote: linkedCustomer?.note ?? null,
        customerStatus: mapGalleryStatus({
          paidOrderCount,
          purchasedAssetCount,
          downloadedAssetCount,
          lastAccessAt,
        }),
        lastAccessAt,
        paidOrderCount,
        purchasedAssetCount,
        downloadedAssetCount,
        createdAt: row.created_at,
        packageCount: packageCountByGallery.get(row.id) ?? 0,
        assetCount: assetCountByGallery.get(row.id) ?? 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = createGallerySchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();
  const photographerId = auth.photographerId;

  const ensurePhotographer = await supabase.from("photographers").upsert(
    {
      id: photographerId,
      auth_user_id: photographerId,
      display_name: "Photographer",
    },
    {
      onConflict: "id",
    },
  );

  if (ensurePhotographer.error) {
    return fail("DB_ERROR", ensurePhotographer.error.message, 500);
  }

  let customerId: string | null = null;
  if (parsed.data.customer) {
    if (parsed.data.customer.mode === "existing") {
      const customer = await supabase
        .from("customers")
        .select("id")
        .eq("id", parsed.data.customer.customerId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (isMissingSchemaObjectError(customer.error)) {
        return fail(
          "FEATURE_NOT_READY",
          "Customer assignment is not available yet. Please run migration 20260312_0003_customers_and_engagement.sql.",
          409,
        );
      }
      if (customer.error) return fail("DB_ERROR", customer.error.message, 500);
      if (!customer.data) return fail("CUSTOMER_NOT_FOUND", "Customer not found", 404);

      customerId = customer.data.id;
    } else {
      const upsert = await upsertCustomerForPhotographer(supabase, photographerId, {
        fullName: parsed.data.customer.fullName,
        email: parsed.data.customer.email,
        note: parsed.data.customer.note ?? null,
      });
      if (upsert.error) {
        if (upsert.error.code === "42P01") {
          return fail(
            "FEATURE_NOT_READY",
            "Customer assignment is not available yet. Please run migration 20260312_0003_customers_and_engagement.sql.",
            409,
          );
        }
        return fail("DB_ERROR", upsert.error.message, 500);
      }
      customerId = upsert.data.id;
    }
  }

  const placeholderPassword = `draft-${crypto.randomUUID()}-${Date.now()}`;
  const accessPasswordHash = await hash(placeholderPassword, 12);
  const normalizedTitle = parsed.data.title.trim();
  const publicSlug = toPublicSlug(normalizedTitle);

  const insert = await supabase
    .from("galleries")
    .insert({
      photographer_id: photographerId,
      title: normalizedTitle,
      description: parsed.data.description ?? null,
      public_slug: publicSlug,
      access_password_hash: accessPasswordHash,
      status: "draft",
      customer_id: customerId,
    })
    .select("id,public_slug,status,customer_id")
    .single();

  if (isMissingSchemaObjectError(insert.error)) {
    if (customerId) {
      return fail(
        "FEATURE_NOT_READY",
        "Customer assignment is not available yet. Please run migration 20260312_0003_customers_and_engagement.sql.",
        409,
      );
    }

    const fallbackInsert = await supabase
      .from("galleries")
      .insert({
        photographer_id: photographerId,
        title: normalizedTitle,
        description: parsed.data.description ?? null,
        public_slug: publicSlug,
        access_password_hash: accessPasswordHash,
        status: "draft",
      })
      .select("id,public_slug,status")
      .single();

    if (
      fallbackInsert.error?.code === "23505" ||
      fallbackInsert.error?.message?.includes("uq_galleries_photographer_title_normalized")
    ) {
      return fail("DUPLICATE_PROJECT_NAME", "Es gibt bereits ein Projekt mit diesem Namen. Bitte wähle einen anderen Namen.", 409);
    }

    if (fallbackInsert.error) {
      return fail("DB_ERROR", fallbackInsert.error.message, 500);
    }

    return ok(
      {
        id: fallbackInsert.data.id,
        publicSlug: fallbackInsert.data.public_slug,
        status: fallbackInsert.data.status,
        customerId: null,
      },
      201,
    );
  }

  if (
    insert.error?.code === "23505" ||
    insert.error?.message?.includes("uq_galleries_photographer_title_normalized")
  ) {
    return fail("DUPLICATE_PROJECT_NAME", "Es gibt bereits ein Projekt mit diesem Namen. Bitte wähle einen anderen Namen.", 409);
  }

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      id: insert.data.id,
      publicSlug: insert.data.public_slug,
      status: insert.data.status,
      customerId: insert.data.customer_id ?? null,
    },
    201,
  );
}
