import { PublicInformationPage } from '@/components/layouts/public-information-page';

export const metadata = { title: 'Terms of Use | Faculty of Law Online Examination System' };

export default function TermsOfUsePage() {
  return (
    <PublicInformationPage
      title="Terms of Use"
      summary="These basic terms apply when using the Faculty of Law Online Examination System. University rules and assessment-specific instructions also apply."
    >
      <section>
        <h2 className="text-lg font-semibold">Authorized use</h2>
        <p className="mt-2 text-muted-foreground">
          Use the system only with an account assigned to you and only for your authorized academic or administrative duties. Keep your sign-in credentials private and notify authorized university staff if you believe your account has been compromised.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Examinations and academic integrity</h2>
        <p className="mt-2 text-muted-foreground">
          Follow the instructions for each assessment and applicable university academic-integrity rules. Do not attempt to access another user&apos;s account, interfere with an assessment, or submit work that is not your own. Examination activity may be monitored as described in the Privacy Policy and assessment instructions.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Submissions and records</h2>
        <p className="mt-2 text-muted-foreground">
          Check that your responses are saved and follow the assessment instructions before submitting. Submitted work and related assessment records may be used for grading, review, and academic recordkeeping.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Availability and support</h2>
        <p className="mt-2 text-muted-foreground">
          Do not rely on the system as a substitute for assessment instructions or official university communications. Report technical issues using the in-exam reporting control when available, or consult the <a className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/support">Support page</a>.
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        These terms are a basic system-use notice and do not replace official Bingham University policies or assessment rules.
      </p>
    </PublicInformationPage>
  );
}