// Paystack verification stub. Requires PAYSTACK_SECRET_KEY in server/.env.
// The static app calls POST /api/payments/verify with a Paystack transaction
// reference; the server confirms it with Paystack and returns { verified: true }.
// Without a secret key configured, verification is unavailable and the app
// keeps subscriptions in "pending" (never activates on frontend word alone).
export async function verifyPaystackReference(reference: string): Promise<{ verified: boolean; amountKobo?: number; reason?: string }> {
  const secret = (process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secret) return { verified: false, reason: "no_secret_configured" };
  if (!reference) return { verified: false, reason: "no_reference" };
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return { verified: false, reason: `paystack_${res.status}` };
  const data = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number } };
  if (data && data.status === true && data.data && data.data.status === "success") {
    return { verified: true, amountKobo: data.data.amount ?? 0 };
  }
  return { verified: false, reason: "not_successful" };
}
