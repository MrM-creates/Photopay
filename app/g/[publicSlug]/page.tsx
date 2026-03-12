import PublicGalleryClient from "./PublicGalleryClient";

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;

  return <PublicGalleryClient publicSlug={publicSlug} />;
}
