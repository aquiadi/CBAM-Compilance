import Link from "next/link";
import { Mark } from "@/components/app-shell";

export const dynamic = "force-dynamic";

/** Sign-in, sign-up and onboarding: one centred card, no application chrome. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-plane px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <Mark />
        <div>
          <div className="text-[14px] font-semibold leading-none text-ink">CarbonPass</div>
          <div className="mt-1 text-[11px] leading-none text-muted">
            CBAM compliance for Indian exporters
          </div>
        </div>
      </Link>
      <div className="w-full max-w-[460px]">{children}</div>
      <p className="mt-10 max-w-[460px] text-center text-[10.5px] leading-[1.6] text-muted">
        Figures are computed by a deterministic engine from your data and the European
        Commission&apos;s published CBAM tables. A calculation aid, not legal advice.
      </p>
    </div>
  );
}
