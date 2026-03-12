import SuccessClient from "./SuccessClient";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id ?? "";

  return <SuccessClient orderId={orderId} />;
}
