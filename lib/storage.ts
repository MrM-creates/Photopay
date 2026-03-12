const defaultAssetsBucket = "photopay-assets";

let assetsBucketEnsured = false;

export function getAssetsBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? defaultAssetsBucket;
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) return "upload.bin";

  const clean = trimmed
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  return clean || "upload.bin";
}

export function buildStorageKeys(galleryId: string, filename: string) {
  const safeFilename = sanitizeFilename(filename);
  const uniqueId = crypto.randomUUID();
  const originalKey = `orig/${galleryId}/${uniqueId}/${safeFilename}`;
  const previewKey = `preview/${galleryId}/${uniqueId}/${safeFilename}`;

  return {
    originalKey,
    previewKey,
  };
}

export async function ensureAssetsBucket(
  supabase: {
    storage: {
      listBuckets: () => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
      createBucket: (
        id: string,
        options: { public: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  },
) {
  if (assetsBucketEnsured) return;

  const bucketName = getAssetsBucketName();
  const list = await supabase.storage.listBuckets();

  if (list.error) {
    throw new Error(`Bucket list failed: ${list.error.message}`);
  }

  const exists = (list.data ?? []).some((bucket) => bucket.name === bucketName);

  if (!exists) {
    const create = await supabase.storage.createBucket(bucketName, { public: false });
    if (create.error) {
      throw new Error(`Bucket create failed: ${create.error.message}`);
    }
  }

  assetsBucketEnsured = true;
}
