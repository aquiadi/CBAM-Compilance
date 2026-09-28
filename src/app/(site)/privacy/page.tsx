import type { Metadata } from "next";
import { env } from "@/config/env";
import { aiProcessor } from "@/lib/ai/client";
import { mailConfigured } from "@/lib/mail";
import { regulationConfigured } from "@/lib/regulation";
import { Clause, contactLine, LegalPage, operatorName } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy · CarbonPass" };
export const dynamic = "force-dynamic";

/**
 * What this deployment stores and who else sees it. The list of other
 * services is read from the configuration, so it names only the ones this
 * deployment actually uses.
 */
export default function PrivacyPage() {
  const ai = aiProcessor();
  const others = [
    ai
      ? `${ai}, which reads the documents you choose to have read, and the figures sent for triage and the methodology memo.`
      : null,
    mailConfigured()
      ? "The e-mail service that sends invitations, supplier requests and password resets."
      : null,
    regulationConfigured()
      ? 'The regulation service (evalgate), which receives the questions you ask on "Ask the regulation" - not your plant\'s data.'
      : null,
  ].filter(Boolean) as string[];

  return (
    <LegalPage title="Privacy" updated="28 September 2026">
      <p>
        This deployment of CarbonPass is run by {operatorName()}. This page says what it stores,
        why, who else sees it, and how to get it back or have it deleted. Questions: {contactLine()}
        .
      </p>

      <Clause title="What is stored">
        <p>
          <b>Your account:</b> your name, e-mail address and password, stored as a salted scrypt
          hash that cannot be turned back into the password. If you turn on two-factor sign-in, its
          secret{env.CARBONPASS_ENCRYPTION_KEY ? ", encrypted" : ""} and your recovery codes, stored
          hashed.
        </p>
        <p>
          <b>Your organisation&apos;s data:</b> the files you upload, the documents you keep as
          evidence, what suppliers submit through their links, the installations and figures in each
          workspace, and an activity log of who changed what. It exists to calculate and document
          your CBAM figures, and for nothing else.
        </p>
        <p>
          <b>For security:</b> sign-in sessions (a hashed token and your browser&apos;s name, for 30
          days), counters that limit repeated attempts by network address or e-mail, and single-use
          links for invitations and password resets, stored hashed.
        </p>
      </Clause>

      <Clause title="Cookies">
        <p>
          Only the ones the product needs to work: one that keeps you signed in, one that remembers
          which workspace you opened, and a short-lived one during two-factor sign-in. Your light or
          dark theme is remembered in your browser. There is no analytics, advertising or tracking,
          and no data is sold.
        </p>
      </Clause>

      <Clause title="Who else sees it">
        {others.length ? (
          <>
            <p>
              Besides the hosting provider that runs its servers and database, this deployment uses:
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              {others.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            {ai ? (
              <p>
                Nothing is sent to {ai} unless someone in your organisation uploads a document to be
                read or asks for triage or a memo. The figures it proposes are checked by a person
                before they count.
              </p>
            ) : null}
          </>
        ) : (
          <p>
            Nobody besides the hosting provider that runs its servers and database. No AI service,
            e-mail service or other third party is configured on this deployment.
          </p>
        )}
        <p>
          Within your organisation, what each person sees depends on their role: owners and editors
          change data; viewers and verifiers only read it.
        </p>
      </Clause>

      <Clause title="How long it is kept, and getting it back">
        <p>
          Your organisation&apos;s data is kept until an owner deletes it. An owner can export
          everything at any time - every workspace as a verifier pack, the members and the whole
          activity log - and can delete the organisation and all of its data, from Settings → Team.
          Sessions end after 30 days; reset links after an hour (or a day, when an owner issues
          one).
        </p>
      </Clause>

      <Clause title="Your rights">
        <p>
          You can ask to see, correct or delete the personal data held about you, and to take your
          data elsewhere, under India&apos;s Digital Personal Data Protection Act, 2023, and - where
          it applies - the EU General Data Protection Regulation. Most of this you can do yourself
          in the app; for anything else, contact {contactLine()}.
        </p>
      </Clause>

      <Clause title="Security">
        <p>
          Connections are encrypted, passwords are hashed, sessions and single-use links are stored
          as hashes, writes are refused unless they come from the app itself, sign-in attempts are
          rate-limited, and two-factor sign-in is available to everyone. No system is perfectly
          secure; report a weakness to {contactLine()}.
        </p>
      </Clause>
    </LegalPage>
  );
}
