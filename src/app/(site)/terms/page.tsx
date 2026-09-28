import type { Metadata } from "next";
import { Clause, contactLine, LegalPage, operatorName } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms · CarbonPass" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="28 September 2026">
      <p>
        These terms cover your use of this CarbonPass deployment, run by {operatorName()}. By
        creating an account you accept them. They are written in plain language on purpose.
      </p>

      <Clause title="What CarbonPass is - and is not">
        <p>
          CarbonPass is a calculation and documentation aid for the EU Carbon Border Adjustment
          Mechanism. It applies the published methodology and the Commission&apos;s tables to the
          data you provide, and prepares the reports your EU importers and your verifier ask for.
        </p>
        <p>
          It is <b>not legal advice</b>, and it does not file anything. Your EU importer (the
          authorised CBAM declarant) is responsible for the declaration, and an accredited verifier
          for verifying your emissions. You remain responsible for the data you enter and confirm,
          and for checking the results before you rely on them.
        </p>
      </Clause>

      <Clause title="AI features">
        <p>
          Where they are switched on, AI features read documents and propose figures, triage
          findings, and draft text. They propose; a person confirms. Every figure in a calculation
          comes from tested code, never from an AI. The accuracy of document reading is measured on
          a test set and published, but real documents vary, and it is your responsibility to check
          each proposed line before confirming it. &quot;Ask the regulation&quot; explains the rules
          with citations; read the cited passage before relying on an answer.
        </p>
      </Clause>

      <Clause title="Your data">
        <p>
          Your data stays yours. It is used only to provide CarbonPass to your organisation, as
          described on the{" "}
          <a href="/privacy" className="text-accent hover:underline">
            privacy page
          </a>
          . An owner of your organisation can export all of it or delete all of it at any time.
        </p>
      </Clause>

      <Clause title="Your account">
        <p>
          Keep your password to yourself and turn on two-factor sign-in. Give each person their own
          account with the least access they need - a verifier gets the Verifier role. Tell{" "}
          {contactLine()} straight away if you think someone else has used your account.
        </p>
      </Clause>

      <Clause title="Fair use">
        <p>
          Do not try to reach other organisations&apos; data, get around the limits on sign-in and
          uploads, upload anything you have no right to, or use the service to break the law.
          Accounts that do may be suspended.
        </p>
      </Clause>

      <Clause title="Availability and liability">
        <p>
          The service is provided as it is, and is kept available and correct with reasonable care,
          but without a guarantee that it is uninterrupted or free of errors. To the extent the law
          allows, {operatorName()} is not liable for indirect losses, or for decisions made on
          results that were not checked. The CarbonPass software itself is open source under the MIT
          licence.
        </p>
      </Clause>

      <Clause title="Ending">
        <p>
          You can stop at any time: export your data, then delete your organisation from Settings →
          Team. If these terms change, the date above changes and the new terms apply from then.
        </p>
        <p>Questions: {contactLine()}.</p>
      </Clause>
    </LegalPage>
  );
}
