import { Mark } from "@/components/app-shell";
import { Card, Note } from "@/components/ui";
import { hasExpired } from "@/lib/time";
import { lookupGoods } from "@/lib/cbam/goods";
import { DatabaseNotConfiguredError, getDb } from "@/lib/db";
import { findRequestByToken } from "@/lib/suppliers";
import { SupplierForm } from "./supplier-form";

export const dynamic = "force-dynamic";

/**
 * The page a precursor supplier opens from the operator's link. No account:
 * the token is the credential, and nothing submitted here is applied until
 * the operator accepts it.
 */
export default async function SupplierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let request: Awaited<ReturnType<typeof findRequestByToken>> = null;
  try {
    request = await findRequestByToken(await getDb(), token);
  } catch (error) {
    if (!(error instanceof DatabaseNotConfiguredError)) throw error;
  }

  const expired = request ? hasExpired(request.expiresAt) : false;
  const closed = request ? !["open", "submitted"].includes(request.status) : false;

  return (
    <div className="flex min-h-screen flex-col items-center bg-plane px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <Mark />
        <div>
          <div className="text-[15.5px] font-semibold leading-none text-ink">CarbonPass</div>
          <div className="mt-1 text-[12.5px] leading-none text-muted">
            CBAM supplier data request
          </div>
        </div>
      </div>
      <div className="w-full max-w-[640px]">
        {!request || expired || closed ? (
          <Card title="This link is not active">
            <Note tone="warning">
              {!request
                ? "The link is not valid."
                : expired
                  ? "The link has expired."
                  : "This request has been closed."}{" "}
              Ask your customer for a new link.
            </Note>
          </Card>
        ) : (
          <Card
            title={`${request.operator} asks for your CBAM data`}
            subtitle={`For ${lookupGoods(request.cnCode)?.description ?? request.cnCode} (CN ${request.cnCode}) supplied to ${request.installation}, production year ${request.year}.`}
          >
            <div className="space-y-4">
              {request.message ? (
                <Note>
                  <span className="text-ink">Message from {request.operator}:</span>{" "}
                  {request.message}
                </Note>
              ) : null}
              <p className="text-[13.5px] leading-[1.65] text-ink-2">
                Under the EU Carbon Border Adjustment Mechanism your customer must report the
                emissions embedded in the{" "}
                {lookupGoods(request.cnCode)?.description.toLowerCase() ?? "goods"} they buy from
                you. Without your values they must use the Commission&apos;s default, which is set
                high on purpose. Enter the specific embedded emissions from your CBAM emissions
                report and attach the report, or the verifier&apos;s report if the values are
                verified.
              </p>
              {request.status === "submitted" ? (
                <Note tone="accent">
                  You submitted data on {request.submittedAt?.slice(0, 10)}. Submitting again
                  replaces it until your customer has reviewed it.
                </Note>
              ) : null}
              <SupplierForm token={token} supplierName={request.supplierName} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
